"use strict";
/**
 * CC-002 — repository contracts for Command Center session data.
 *
 * Thin data-access functions only. No broker calls, no strategy logic, no
 * execution decisions. Every session-scoped read/write requires both
 * userId and sessionId so Production/Paper/Shadow/Backtest data can never
 * be queried or mutated across ownership boundaries.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSessionsForUser = listSessionsForUser;
exports.getSessionForUser = getSessionForUser;
exports.getProductionSession = getProductionSession;
exports.getSessionConfiguration = getSessionConfiguration;
exports.getSessionRuntime = getSessionRuntime;
exports.listPositions = listPositions;
exports.listOrders = listOrders;
exports.listExecutions = listExecutions;
exports.listPnlSnapshots = listPnlSnapshots;
exports.listRiskSnapshots = listRiskSnapshots;
exports.listEvents = listEvents;
exports.listBacktestRuns = listBacktestRuns;
exports.listStrategyDefinitions = listStrategyDefinitions;
exports.listTradableInstruments = listTradableInstruments;
exports.listBrokerAccountsForUser = listBrokerAccountsForUser;
exports.createDraftSession = createDraftSession;
exports.deleteNonProductionSession = deleteNonProductionSession;
const db_1 = require("../db");
// ── Sessions ─────────────────────────────────────────────────────────────────
function listSessionsForUser(userId) {
    return (0, db_1.dbAll)("SELECT * FROM cc_trading_sessions WHERE user_id = ? ORDER BY is_production DESC, created_at DESC", [userId]);
}
function getSessionForUser(userId, sessionId) {
    return (0, db_1.dbGet)("SELECT * FROM cc_trading_sessions WHERE user_id = ? AND id = ?", [userId, sessionId]);
}
function getProductionSession() {
    return (0, db_1.dbGet)("SELECT * FROM cc_trading_sessions WHERE is_production = 1");
}
// ── Session-owned child records (all require userId + sessionId) ───────────
async function assertOwnedSession(userId, sessionId) {
    const owned = await getSessionForUser(userId, sessionId);
    if (!owned)
        throw new Error(`Session ${sessionId} does not belong to user ${userId}`);
}
async function getSessionConfiguration(userId, sessionId) {
    await assertOwnedSession(userId, sessionId);
    return (0, db_1.dbGet)("SELECT * FROM cc_session_configurations WHERE session_id = ?", [sessionId]);
}
async function getSessionRuntime(userId, sessionId) {
    await assertOwnedSession(userId, sessionId);
    return (0, db_1.dbGet)("SELECT * FROM cc_session_runtime WHERE session_id = ?", [sessionId]);
}
async function listPositions(userId, sessionId) {
    await assertOwnedSession(userId, sessionId);
    return (0, db_1.dbAll)("SELECT * FROM cc_trading_positions WHERE session_id = ? ORDER BY created_at DESC", [sessionId]);
}
async function listOrders(userId, sessionId) {
    await assertOwnedSession(userId, sessionId);
    return (0, db_1.dbAll)("SELECT * FROM cc_trading_orders WHERE session_id = ? ORDER BY created_at DESC", [sessionId]);
}
async function listExecutions(userId, sessionId) {
    await assertOwnedSession(userId, sessionId);
    return (0, db_1.dbAll)("SELECT * FROM cc_trade_executions WHERE session_id = ? ORDER BY created_at DESC", [sessionId]);
}
async function listPnlSnapshots(userId, sessionId, limit = 500) {
    await assertOwnedSession(userId, sessionId);
    return (0, db_1.dbAll)("SELECT * FROM cc_session_pnl_snapshots WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?", [sessionId, limit]);
}
async function listRiskSnapshots(userId, sessionId, limit = 500) {
    await assertOwnedSession(userId, sessionId);
    return (0, db_1.dbAll)("SELECT * FROM cc_session_risk_snapshots WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?", [sessionId, limit]);
}
async function listEvents(userId, sessionId, limit = 200) {
    await assertOwnedSession(userId, sessionId);
    return (0, db_1.dbAll)("SELECT * FROM cc_session_events WHERE session_id = ? ORDER BY created_at DESC LIMIT ?", [sessionId, limit]);
}
async function listBacktestRuns(userId, sessionId) {
    await assertOwnedSession(userId, sessionId);
    return (0, db_1.dbAll)("SELECT * FROM cc_backtest_runs WHERE session_id = ? ORDER BY created_at DESC", [sessionId]);
}
// ── Reference data (not user-scoped) ────────────────────────────────────────
function listStrategyDefinitions() {
    return (0, db_1.dbAll)("SELECT * FROM cc_strategy_definitions WHERE is_active = 1");
}
function listTradableInstruments() {
    return (0, db_1.dbAll)("SELECT * FROM cc_tradable_instruments WHERE is_active = 1");
}
function listBrokerAccountsForUser(userId) {
    return (0, db_1.dbAll)("SELECT * FROM cc_broker_accounts WHERE user_id = ?", [userId]);
}
// ── Session lifecycle (data-model only — no engine/broker side effects) ────
async function createDraftSession(userId, input) {
    if (input.mode === undefined)
        throw new Error("mode is required");
    await (0, db_1.dbRun)(`INSERT INTO cc_trading_sessions (user_id, name, strategy_id, instrument_id, product_type, mode, broker_account_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT')`, [userId, input.name, input.strategyId, input.instrumentId, input.productType, input.mode, input.brokerAccountId ?? null]);
    const row = await (0, db_1.dbGet)("SELECT id FROM cc_trading_sessions WHERE user_id = ? ORDER BY id DESC LIMIT 1", [userId]);
    return row.id;
}
/** Non-production sessions only. Protected/production sessions are rejected here
 *  and additionally guarded at the database level via triggers on cc_trading_sessions. */
async function deleteNonProductionSession(userId, sessionId) {
    const session = await getSessionForUser(userId, sessionId);
    if (!session)
        throw new Error(`Session ${sessionId} does not belong to user ${userId}`);
    if (session.is_protected || session.is_production) {
        throw new Error("Protected/production sessions cannot be deleted");
    }
    await (0, db_1.dbRun)("DELETE FROM cc_trading_sessions WHERE id = ? AND user_id = ?", [sessionId, userId]);
}
