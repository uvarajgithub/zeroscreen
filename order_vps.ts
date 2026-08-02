import { KiteConnect } from "kiteconnect";
import { config } from "./config";
import { sendTelegram } from "./notifier";

function log(event: string, details: Record<string, any> = {}) {
  const ist = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  console.log(JSON.stringify({ time: ist, event, ...details }));
}

function wholeOrderPrice(value: any, side: "BUY" | "SELL") {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return value;
  return side === "BUY" ? Math.ceil(n) : Math.floor(n);
}

function kiteOrder(payload: Record<string, any>) {
  const side = String(payload.transaction_type || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
  const next = { ...payload };
  for (const key of ["price", "trigger_price"]) {
    if (next[key] == null) continue;
    const before = next[key];
    next[key] = wholeOrderPrice(before, side);
    if (Number(before) !== Number(next[key])) {
      log("ORDER_PRICE_ROUNDED", { side, field: key, before, after: next[key], symbol: next.tradingsymbol });
    }
  }
  return next;
}

// process.env.MODE takes precedence (allows test-paper-trade.ts to force PAPER)
const RAW_MODE = (process.env.MODE ?? config.mode ?? "LIVE").toUpperCase();
const IS_SHADOW_MODE = RAW_MODE === "PAPER" || RAW_MODE === "LIVE_SHADOW";
const IS_PAPER = IS_SHADOW_MODE;

// ── Paper trade simulator ─────────────────────────────────
let paperOrderIdCounter = 1000;
const paperPositions: Record<string, { qty: number; price: number }> = {};

function simulatePaperOrder(symbol: string, type: "BUY" | "SELL", qty: number, price: number) {
  const orderId = `${RAW_MODE === "LIVE_SHADOW" ? "SHADOW" : "PAPER"}-${paperOrderIdCounter++}`;
  const signedQty = type === "BUY" ? qty : -qty;
  const existing = paperPositions[symbol];
  const nextQty = (existing?.qty ?? 0) + signedQty;
  if (nextQty === 0) {
    delete paperPositions[symbol];
  } else {
    paperPositions[symbol] = { qty: nextQty, price };
  }
  log(RAW_MODE === "LIVE_SHADOW" ? "SHADOW_ORDER" : "PAPER_ORDER", { orderId, symbol, type, qty, netQty: nextQty, price });
  return { order_id: orderId, status: "COMPLETE", filled_quantity: qty, quantity: qty, average_price: price, transaction_type: type };
}

export function getPaperPositions() {
  return paperPositions;
}

let tradingStopped = false;
export function stopTradingForDay() {
  tradingStopped = true;
  console.error("Trading stopped for the day due to order rejection.");
}
export function isTradingStopped() {
  return tradingStopped;
}

const kite = new KiteConnect({ api_key: config.apiKey });
kite.setAccessToken(config.accessToken);

// Fetch a single order status from Kite
async function getOrderStatus(order_id: string): Promise<any> {
  const orders: any[] = await kite.getOrders();
  return orders.find(o => o.order_id === order_id) ?? { status: "UNKNOWN" };
}

// Verify an order reached COMPLETE status (poll up to 10s)
async function verifyOrderFilled(orderId: string): Promise<boolean> {
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const orders: any[] = await kite.getOrders();
    const order = orders.find(o => o.order_id === orderId);
    if (order?.status === "COMPLETE") return true;
    if (order?.status === "REJECTED" || order?.status === "CANCELLED") {
      stopTradingForDay();
      throw new Error(`Order ${orderId} ${order.status}: ${order.status_message}`);
    }
  }
  throw new Error(`Order ${orderId} not filled within timeout`);
}

// Helper: Handle partial fill (customize as needed)
export function handlePartialFill(symbol: string, requestedQty: number, filledQty: number) {
  console.warn(`Partial fill detected for ${symbol}: requested ${requestedQty}, filled ${filledQty}`);
  // Adjust SL, targets, and state as needed here
  // For now, just log and continue
}

// Example order state handling (add to order placement logic):
async function handleOrderState(order: any) {
  if (order.status === "REJECTED") {
    log("Rejected", { status: order.status, message: order.status_message });
    await sendTelegram(`❌ *Order Rejected*\nReason: ${order.status_message}`);
    await stopTradingForDay();
    return;
  }
  if (order.status === "OPEN") {
    // Poll until COMPLETE or CANCEL
    let polledOrder = order;
    let attempts = 0;
    while (polledOrder.status === "OPEN" && attempts < 10) {
      await new Promise(r => setTimeout(r, 1000));
      polledOrder = await getOrderStatus(order.order_id);
      attempts++;
    }
    if (polledOrder.status !== "COMPLETE") {
      log("Order not filled", { status: polledOrder.status });
      await sendTelegram(`⚠️ *Order Not Filled*\nStatus: ${polledOrder.status}`);
      await stopTradingForDay();
      return;
    }
    order = polledOrder;
  }
  // Partial fill handling
  const actualQty = order.filled_quantity;
  if (actualQty < order.quantity) {
    log("PARTIAL_FILL", { requested: order.quantity, filled: actualQty });
    await sendTelegram(`⚠️ *Partial Fill*\nRequested: ${order.quantity}\nFilled: ${actualQty}`);
    // Caller (index.ts) receives the order object and uses filled_quantity for SL sizing
  }
  return order;
}

// Spread filter for options (call before placing order)
function isFuturesSymbol(symbol: string) { return /FUT$/i.test(symbol); }
function isOptionLiquid(bid: number, ask: number) {
  if (bid <= 0 || ask <= 0) return false;
  const mid = (bid + ask) / 2;
  return (ask - bid) / mid <= 0.01; // allow up to 1% spread (works for any premium level)
}

// Place MARKET order — direction defaults to BUY (options); pass SELL for futures short
export async function placeTrade(symbol: string, price: number, qty: number = config.quantity, direction: "BUY" | "SELL" = "BUY") {
  if (tradingStopped) throw new Error("Trading stopped for the day.");

  // ── PAPER MODE: simulate order, no real API call ──
  if (IS_PAPER) {
    // Fetch actual LTP for accurate paper P&L tracking
    let ltp = price;
    try {
      const ltpResp = await kite.getLTP([`NFO:${symbol}`]);
      ltp = (ltpResp as any)[`NFO:${symbol}`]?.last_price ?? price;
    } catch (_) {}
    const result = simulatePaperOrder(symbol, direction, qty, ltp);
    log(`PAPER_${direction}`, { symbol, ltp, indexPrice: price, qty, direction });
    return result;
  }

  // --- Spread Guard (options only; futures spreads are not premium spreads) ---
  if (!isFuturesSymbol(symbol)) {
    try {
      const quoteResp = await kite.getQuote([`NFO:${symbol}`]);
      const quote = quoteResp[`NFO:${symbol}`];
      if (quote && quote.depth) {
        const bid = quote.depth.buy[0]?.price || 0;
        const ask = quote.depth.sell[0]?.price || 0;
        if (!isOptionLiquid(bid, ask)) {
          throw new Error(`Bid-ask spread too wide: bid=${bid}, ask=${ask}`);
        }
      }
    } catch (e) {
      console.error("Spread check failed:", e);
      throw new Error("Spread check failed: " + (e instanceof Error ? e.message : String(e)));
    }
  } else {
    log("SPREAD_GUARD_SKIP", { symbol, reason: "futures_symbol" });
  }
  console.log(`Placing trade: ${symbol} qty=${qty} direction=${direction}`);
  let buyOrderId = "";
  let order = null;
  try {
    // MARKET order (direction = BUY for long options/futures, SELL for futures short)
    const buyResp: any = await kite.placeOrder("regular", kiteOrder({
      exchange: "NFO",
      tradingsymbol: symbol,
      transaction_type: direction,
      quantity: qty,
      order_type: "MARKET",
      product: "MIS"
    }));
    buyOrderId = buyResp.order_id;
    console.log(`${direction} order placed: ${buyOrderId}`);
    // Check for rejection — retry once after 2s
    let orders: any[] = await kite.getOrders();
    order = orders.find(o => o.order_id === buyOrderId);
    if (order?.status === "REJECTED") {
      console.warn(`${direction} order rejected (${order.status_message}), retrying in 2s...`);
      await new Promise(r => setTimeout(r, 2000));
      const retryResp: any = await kite.placeOrder("regular", kiteOrder({
        exchange: "NFO",
        tradingsymbol: symbol,
        transaction_type: direction,
        quantity: qty,
        order_type: "MARKET",
        product: "MIS"
      }));
      buyOrderId = retryResp.order_id;
      const retryOrders: any[] = await kite.getOrders();
      order = retryOrders.find(o => o.order_id === buyOrderId);
      if (order?.status === "REJECTED") {
        const msg = `⛔ ${direction} order rejected after retry\nSymbol: ${symbol}\nReason: ${order.status_message}`;
        console.error(msg);
        await sendTelegram(msg);
        stopTradingForDay();
        throw new Error(`Order ${buyOrderId} REJECTED after retry: ${order.status_message}`);
      }
      console.log(`Retry ${direction} order placed: ${buyOrderId}`);
    }
    // Verify fill before returning
    await verifyOrderFilled(buyOrderId);
    console.log(`${direction} order filled: ${buyOrderId}`);
    // Re-fetch order to get final COMPLETE status after verification
    const finalOrders: any[] = await kite.getOrders();
    order = finalOrders.find(o => o.order_id === buyOrderId) ?? order;
    const filledQty = Number(order?.filled_quantity ?? 0);
    if (filledQty <= 0) {
      stopTradingForDay();
      throw new Error(`Order ${buyOrderId} completed with zero filled quantity`);
    }
    if (filledQty < qty) {
      handlePartialFill(symbol, qty, filledQty);
    }
    // Note: SL is monitored in real-time via index price in index.ts (candle-low SL).
    // No Kite SL-M order is placed because trigger price is index-based, not option-price-based.
    return order;
  } catch (e) {
    // API failure count is handled in index.ts, not here
    throw e;
  }
}

// Exit open position for a symbol — direction defaults to SELL (close long); pass BUY to close short
export async function exitTrade(symbol: string, qty: number = config.quantity, direction: "BUY" | "SELL" = "SELL") {
  if (tradingStopped) throw new Error("Trading stopped for the day.");

  // ── PAPER MODE ──
  if (IS_PAPER) {
    const result = simulatePaperOrder(symbol, direction, qty, 0);
    log("PAPER_EXIT", { symbol, qty, direction });
    return result;
  }

  console.log(`Exiting trade: ${symbol} direction=${direction}`);
  const resp: any = await kite.placeOrder("regular", kiteOrder({
    exchange: "NFO",
    tradingsymbol: symbol,
    transaction_type: direction,
    quantity: qty,
    order_type: "MARKET",
    product: "MIS"
  }));
  // Check for rejection — retry once after 2s
  let exitOrders: any[] = await kite.getOrders();
  let exitOrder = exitOrders.find(o => o.order_id === resp.order_id);
  if (exitOrder?.status === "REJECTED") {
    console.warn(`EXIT(${direction}) order rejected (${exitOrder.status_message}), retrying in 2s...`);
    await new Promise(r => setTimeout(r, 2000));
    const retryResp: any = await kite.placeOrder("regular", kiteOrder({
      exchange: "NFO",
      tradingsymbol: symbol,
      transaction_type: direction,
      quantity: qty,
      order_type: "MARKET",
      product: "MIS"
    }));
    const retryOrders: any[] = await kite.getOrders();
    exitOrder = retryOrders.find(o => o.order_id === retryResp.order_id);
    if (exitOrder?.status === "REJECTED") {
      const msg = `⛔ EXIT(${direction}) order rejected after retry\nSymbol: ${symbol}\nReason: ${exitOrder.status_message}\n⚠️ CHECK POSITION MANUALLY`;
      console.error(msg);
      await sendTelegram(msg);
      stopTradingForDay();
      throw new Error(`Exit order REJECTED after retry: ${exitOrder.status_message}`);
    }
    await verifyOrderFilled(retryResp.order_id);
    const finalRetryOrders: any[] = await kite.getOrders();
    const finalRetryOrder = finalRetryOrders.find(o => o.order_id === retryResp.order_id) ?? exitOrder;
    const retryFilledQty = Number(finalRetryOrder?.filled_quantity ?? 0);
    if (retryFilledQty <= 0) {
      stopTradingForDay();
      throw new Error(`Exit order ${retryResp.order_id} completed with zero filled quantity`);
    }
    if (retryFilledQty < qty) {
      handlePartialFill(symbol, qty, retryFilledQty);
    }
    console.log(`Retry EXIT(${direction}) order filled: ${retryResp.order_id}`);
    return finalRetryOrder;
  }
  await verifyOrderFilled(resp.order_id);
  const finalOrders: any[] = await kite.getOrders();
  const order = finalOrders.find(o => o.order_id === resp.order_id) ?? exitOrder;
  const filledQty = Number(order?.filled_quantity ?? 0);
  if (filledQty <= 0) {
    stopTradingForDay();
    throw new Error(`Exit order ${resp.order_id} completed with zero filled quantity`);
  }
  if (filledQty < qty) {
    handlePartialFill(symbol, qty, filledQty);
  }
  console.log(`Exit order filled: ${resp.order_id}`);
  return order;
}

// Exit all open positions (forced square-off)
export async function squareOffAll() {
  // ── PAPER MODE ──
  if (IS_PAPER) {
    for (const symbol of Object.keys(paperPositions)) {
      const qty = paperPositions[symbol].qty;
      simulatePaperOrder(symbol, qty > 0 ? "SELL" : "BUY", Math.abs(qty), 0);
    }
    log(RAW_MODE === "LIVE_SHADOW" ? "SHADOW_SQUAREOFF" : "PAPER_SQUAREOFF", { message: "All shadow/paper positions squared off" });
    return;
  }
  try {
    const positions = await kite.getPositions();
    for (const pos of positions.net) {
      if (pos.quantity !== 0) {
        await kite.placeOrder("regular", kiteOrder({
          exchange: pos.exchange as any,
          tradingsymbol: pos.tradingsymbol,
          transaction_type: pos.quantity > 0 ? "SELL" : "BUY",
          quantity: Math.abs(pos.quantity),
          order_type: "MARKET",
          product: pos.product as any
        }));
        console.log(`Square-off: ${pos.tradingsymbol} qty=${pos.quantity}`);
      }
    }
  } catch (e) {
    console.error("Error in squareOffAll:", e);
  }
}

