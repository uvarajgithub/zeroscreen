"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaperPositions = getPaperPositions;
exports.stopTradingForDay = stopTradingForDay;
exports.isTradingStopped = isTradingStopped;
exports.handlePartialFill = handlePartialFill;
exports.placeTrade = placeTrade;
exports.exitTrade = exitTrade;
exports.squareOffAll = squareOffAll;
const kiteconnect_1 = require("kiteconnect");
const config_1 = require("./config");
const notifier_1 = require("./notifier");
function log(event, details = {}) {
    const ist = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    console.log(JSON.stringify({ time: ist, event, ...details }));
}
// process.env.MODE takes precedence (allows test-paper-trade.ts to force PAPER)
const IS_PAPER = (process.env.MODE ?? config_1.config.mode ?? "LIVE").toUpperCase() === "PAPER";
// ── Paper trade simulator ─────────────────────────────────
let paperOrderIdCounter = 1000;
const paperPositions = {};
function simulatePaperOrder(symbol, type, qty, price) {
    const orderId = `PAPER-${paperOrderIdCounter++}`;
    if (type === "BUY") {
        paperPositions[symbol] = { qty, price };
    }
    else {
        delete paperPositions[symbol];
    }
    log("PAPER_ORDER", { orderId, symbol, type, qty, price });
    return { order_id: orderId, status: "COMPLETE", filled_quantity: qty };
}
function getPaperPositions() {
    return paperPositions;
}
let tradingStopped = false;
function stopTradingForDay() {
    tradingStopped = true;
    console.error("Trading stopped for the day due to order rejection.");
}
function isTradingStopped() {
    return tradingStopped;
}
const kite = new kiteconnect_1.KiteConnect({ api_key: config_1.config.apiKey });
kite.setAccessToken(config_1.config.accessToken);
// Fetch a single order status from Kite
async function getOrderStatus(order_id) {
    const orders = await kite.getOrders();
    return orders.find(o => o.order_id === order_id) ?? { status: "UNKNOWN" };
}
// Verify an order reached COMPLETE status (poll up to 10s)
async function verifyOrderFilled(orderId) {
    for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const orders = await kite.getOrders();
        const order = orders.find(o => o.order_id === orderId);
        if (order?.status === "COMPLETE")
            return true;
        if (order?.status === "REJECTED" || order?.status === "CANCELLED") {
            stopTradingForDay();
            throw new Error(`Order ${orderId} ${order.status}: ${order.status_message}`);
        }
    }
    throw new Error(`Order ${orderId} not filled within timeout`);
}
// Helper: Handle partial fill (customize as needed)
function handlePartialFill(symbol, requestedQty, filledQty) {
    console.warn(`Partial fill detected for ${symbol}: requested ${requestedQty}, filled ${filledQty}`);
    // Adjust SL, targets, and state as needed here
    // For now, just log and continue
}
// Example order state handling (add to order placement logic):
async function handleOrderState(order) {
    if (order.status === "REJECTED") {
        log("Rejected", { status: order.status, message: order.status_message });
        await (0, notifier_1.sendTelegram)(`❌ *Order Rejected*\nReason: ${order.status_message}`);
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
            await (0, notifier_1.sendTelegram)(`⚠️ *Order Not Filled*\nStatus: ${polledOrder.status}`);
            await stopTradingForDay();
            return;
        }
        order = polledOrder;
    }
    // Partial fill handling
    const actualQty = order.filled_quantity;
    if (actualQty < order.quantity) {
        log("PARTIAL_FILL", { requested: order.quantity, filled: actualQty });
        await (0, notifier_1.sendTelegram)(`⚠️ *Partial Fill*\nRequested: ${order.quantity}\nFilled: ${actualQty}`);
        // Caller (index.ts) receives the order object and uses filled_quantity for SL sizing
    }
    return order;
}
// Spread filter for options (call before placing order)
function isOptionLiquid(bid, ask) {
    if (bid <= 0 || ask <= 0)
        return false;
    const mid = (bid + ask) / 2;
    return (ask - bid) / mid <= 0.01; // allow up to 1% spread (works for any premium level)
}
// Place BUY (MARKET) + SL-M order — verifies fill before placing SL
async function placeTrade(symbol, price, qty = config_1.config.quantity) {
    if (tradingStopped)
        throw new Error("Trading stopped for the day.");
    // ── PAPER MODE: simulate order, no real API call ──
    if (IS_PAPER) {
        // Fetch actual option LTP for accurate paper P&L tracking
        let optionLTP = price;
        try {
            const ltpResp = await kite.getLTP([`NFO:${symbol}`]);
            optionLTP = ltpResp[`NFO:${symbol}`]?.last_price ?? price;
        }
        catch (_) { }
        const result = simulatePaperOrder(symbol, "BUY", qty, optionLTP);
        log("PAPER_BUY", { symbol, optionLTP, indexPrice: price, qty });
        return result;
    }
    // --- Spread Guard ---
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
    }
    catch (e) {
        console.error("Spread check failed:", e);
        throw new Error("Spread check failed: " + (e instanceof Error ? e.message : String(e)));
    }
    console.log(`Placing trade: ${symbol} qty=${qty}`);
    let buyOrderId = "";
    let order = null;
    try {
        // BUY — MARKET order
        const buyResp = await kite.placeOrder("regular", {
            exchange: "NFO",
            tradingsymbol: symbol,
            transaction_type: "BUY",
            quantity: qty,
            order_type: "MARKET",
            product: "MIS"
        });
        buyOrderId = buyResp.order_id;
        console.log(`BUY order placed: ${buyOrderId}`);
        // Check for rejection — retry once after 2s
        let orders = await kite.getOrders();
        order = orders.find(o => o.order_id === buyOrderId);
        if (order?.status === "REJECTED") {
            console.warn(`BUY order rejected (${order.status_message}), retrying in 2s...`);
            await new Promise(r => setTimeout(r, 2000));
            const retryResp = await kite.placeOrder("regular", {
                exchange: "NFO",
                tradingsymbol: symbol,
                transaction_type: "BUY",
                quantity: qty,
                order_type: "MARKET",
                product: "MIS"
            });
            buyOrderId = retryResp.order_id;
            const retryOrders = await kite.getOrders();
            order = retryOrders.find(o => o.order_id === buyOrderId);
            if (order?.status === "REJECTED") {
                const msg = `⛔ BUY order rejected after retry\nSymbol: ${symbol}\nReason: ${order.status_message}`;
                console.error(msg);
                await (0, notifier_1.sendTelegram)(msg);
                stopTradingForDay();
                throw new Error(`Order ${buyOrderId} REJECTED after retry: ${order.status_message}`);
            }
            console.log(`Retry BUY order placed: ${buyOrderId}`);
        }
        // Partial fill handling
        const filledQty = order?.filled_quantity ?? 0;
        if (filledQty < qty) {
            handlePartialFill(symbol, qty, filledQty);
            // Optionally, adjust SL/targets here
        }
        // Verify fill before returning
        await verifyOrderFilled(buyOrderId);
        console.log(`BUY order filled: ${buyOrderId}`);
        // Re-fetch order to get final COMPLETE status after verification
        const finalOrders = await kite.getOrders();
        order = finalOrders.find(o => o.order_id === buyOrderId) ?? order;
        // Note: SL is monitored in real-time via index price in index.ts (candle-low SL).
        // No Kite SL-M order is placed because trigger price is index-based, not option-price-based.
        return order;
    }
    catch (e) {
        // API failure count is handled in index.ts, not here
        throw e;
    }
}
// Exit all open positions for a symbol (MARKET order)
async function exitTrade(symbol, qty = config_1.config.quantity) {
    if (tradingStopped)
        throw new Error("Trading stopped for the day.");
    // ── PAPER MODE ──
    if (IS_PAPER) {
        const result = simulatePaperOrder(symbol, "SELL", qty, 0);
        log("PAPER_EXIT", { symbol, qty });
        return result;
    }
    console.log(`Exiting trade: ${symbol}`);
    const resp = await kite.placeOrder("regular", {
        exchange: "NFO",
        tradingsymbol: symbol,
        transaction_type: "SELL",
        quantity: qty,
        order_type: "MARKET",
        product: "MIS"
    });
    // Check for rejection — retry once after 2s
    let exitOrders = await kite.getOrders();
    let exitOrder = exitOrders.find(o => o.order_id === resp.order_id);
    if (exitOrder?.status === "REJECTED") {
        console.warn(`EXIT order rejected (${exitOrder.status_message}), retrying in 2s...`);
        await new Promise(r => setTimeout(r, 2000));
        const retryResp = await kite.placeOrder("regular", {
            exchange: "NFO",
            tradingsymbol: symbol,
            transaction_type: "SELL",
            quantity: qty,
            order_type: "MARKET",
            product: "MIS"
        });
        const retryOrders = await kite.getOrders();
        exitOrder = retryOrders.find(o => o.order_id === retryResp.order_id);
        if (exitOrder?.status === "REJECTED") {
            const msg = `⛔ EXIT order rejected after retry\nSymbol: ${symbol}\nReason: ${exitOrder.status_message}\n⚠️ CHECK POSITION MANUALLY`;
            console.error(msg);
            await (0, notifier_1.sendTelegram)(msg);
            stopTradingForDay();
            throw new Error(`Exit order REJECTED after retry: ${exitOrder.status_message}`);
        }
        console.log(`Retry EXIT order placed: ${retryResp.order_id}`);
        return;
    }
    const order = exitOrder;
    // Partial fill handling for exit
    const filledQty = order?.filled_quantity ?? 0;
    if (filledQty < qty) {
        handlePartialFill(symbol, qty, filledQty);
    }
    console.log(`Exit order placed: ${resp.order_id}`);
}
// Exit all open positions (forced square-off)
async function squareOffAll() {
    // ── PAPER MODE ──
    if (IS_PAPER) {
        for (const symbol of Object.keys(paperPositions)) {
            simulatePaperOrder(symbol, "SELL", paperPositions[symbol].qty, 0);
        }
        log("PAPER_SQUAREOFF", { message: "All paper positions squared off" });
        return;
    }
    try {
        const positions = await kite.getPositions();
        for (const pos of positions.net) {
            if (pos.quantity !== 0) {
                await kite.placeOrder("regular", {
                    exchange: pos.exchange,
                    tradingsymbol: pos.tradingsymbol,
                    transaction_type: pos.quantity > 0 ? "SELL" : "BUY",
                    quantity: Math.abs(pos.quantity),
                    order_type: "MARKET",
                    product: pos.product
                });
                console.log(`Square-off: ${pos.tradingsymbol} qty=${pos.quantity}`);
            }
        }
    }
    catch (e) {
        console.error("Error in squareOffAll:", e);
    }
}
