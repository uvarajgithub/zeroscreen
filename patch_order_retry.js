// patch_order_retry.js — adds retry + Telegram alert to placeTrade and exitTrade
const fs = require('fs');
const path = '/home/ubuntu/trading-bot/src/order.ts';
let src = fs.readFileSync(path, 'utf8');

// ── 1. placeTrade: replace rejection block with retry logic ──────────────────
const oldBuyReject = `    buyOrderId = buyResp.order_id;
    console.log(\`BUY order placed: \${buyOrderId}\`);
    // Check for rejection
    const orders: any[] = await kite.getOrders();
    order = orders.find(o => o.order_id === buyOrderId);
    if (order?.status === "REJECTED") {
      console.error("Order rejected:", order.status_message);
      stopTradingForDay();
      throw new Error(\`Order \${buyOrderId} REJECTED: \${order.status_message}\`);
    }`;

const newBuyReject = `    buyOrderId = buyResp.order_id;
    console.log(\`BUY order placed: \${buyOrderId}\`);
    // Check for rejection — retry once after 2s
    let orders: any[] = await kite.getOrders();
    order = orders.find(o => o.order_id === buyOrderId);
    if (order?.status === "REJECTED") {
      console.warn(\`BUY order rejected (\${order.status_message}), retrying in 2s...\`);
      await new Promise(r => setTimeout(r, 2000));
      const retryResp: any = await kite.placeOrder("regular", {
        exchange: "NFO",
        tradingsymbol: symbol,
        transaction_type: "BUY",
        quantity: qty,
        order_type: "MARKET",
        product: "MIS"
      });
      buyOrderId = retryResp.order_id;
      const retryOrders: any[] = await kite.getOrders();
      order = retryOrders.find(o => o.order_id === buyOrderId);
      if (order?.status === "REJECTED") {
        const msg = \`⛔ BUY order rejected after retry\\nSymbol: \${symbol}\\nReason: \${order.status_message}\`;
        console.error(msg);
        await sendTelegram(msg);
        stopTradingForDay();
        throw new Error(\`Order \${buyOrderId} REJECTED after retry: \${order.status_message}\`);
      }
      console.log(\`Retry BUY order placed: \${buyOrderId}\`);
    }`;

if (!src.includes(oldBuyReject)) {
  console.error('ERROR: BUY rejection block not found — check whitespace/content');
  process.exit(1);
}
src = src.replace(oldBuyReject, newBuyReject);

// ── 2. exitTrade: replace rejection block with retry logic ───────────────────
const oldExitReject = `  // Check for rejection
  const orders: any[] = await kite.getOrders();
  const order = orders.find(o => o.order_id === resp.order_id);
  if (order?.status === "REJECTED") {
    console.error("Exit order rejected:", order.status_message);
    stopTradingForDay();
    throw new Error(\`Order \${resp.order_id} REJECTED: \${order.status_message}\`);
  }`;

const newExitReject = `  // Check for rejection — retry once after 2s
  let exitOrders: any[] = await kite.getOrders();
  let exitOrder = exitOrders.find(o => o.order_id === resp.order_id);
  if (exitOrder?.status === "REJECTED") {
    console.warn(\`EXIT order rejected (\${exitOrder.status_message}), retrying in 2s...\`);
    await new Promise(r => setTimeout(r, 2000));
    const retryResp: any = await kite.placeOrder("regular", {
      exchange: "NFO",
      tradingsymbol: symbol,
      transaction_type: "SELL",
      quantity: qty,
      order_type: "MARKET",
      product: "MIS"
    });
    const retryOrders: any[] = await kite.getOrders();
    exitOrder = retryOrders.find(o => o.order_id === retryResp.order_id);
    if (exitOrder?.status === "REJECTED") {
      const msg = \`⛔ EXIT order rejected after retry\\nSymbol: \${symbol}\\nReason: \${exitOrder.status_message}\\n⚠️ CHECK POSITION MANUALLY\`;
      console.error(msg);
      await sendTelegram(msg);
      stopTradingForDay();
      throw new Error(\`Exit order REJECTED after retry: \${exitOrder.status_message}\`);
    }
    console.log(\`Retry EXIT order placed: \${retryResp.order_id}\`);
    return;
  }
  const order = exitOrder;`;

if (!src.includes(oldExitReject)) {
  console.error('ERROR: EXIT rejection block not found — check whitespace/content');
  process.exit(1);
}
src = src.replace(oldExitReject, newExitReject);

fs.writeFileSync(path, src);
console.log('✓ Retry logic added to placeTrade() and exitTrade()');
console.log('  - BUY rejection: retry once after 2s → Telegram alert if still rejected');
console.log('  - EXIT rejection: retry once after 2s → Telegram alert + manual position warning');
