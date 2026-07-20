/**
 * CC-002 — repository contracts for Command Center session data.
 *
 * Thin data-access functions only. No broker calls, no strategy logic, no
 * execution decisions. Every session-scoped read/write requires both
 * userId and sessionId so Production/Paper/Shadow/Backtest data can never
 * be queried or mutated across ownership boundaries.
 */

import { dbAll, dbGet, dbRun } from "../db";
import {
  TradingSession, StrategyDefinition, TradableInstrument, BrokerAccount,
  SessionConfiguration, SessionRuntime, TradingPosition, TradingOrder,
  TradeExecution, SessionPnlSnapshot, SessionRiskSnapshot, SessionEvent, BacktestRun,
} from "./types";

// ── Sessions ─────────────────────────────────────────────────────────────────

export function listSessionsForUser(userId: number): Promise<TradingSession[]> {
  return dbAll<TradingSession>(
    "SELECT * FROM cc_trading_sessions WHERE user_id = ? ORDER BY is_production DESC, created_at DESC",
    [userId]
  );
}

export function getSessionForUser(userId: number, sessionId: number): Promise<TradingSession | null> {
  return dbGet<TradingSession>(
    "SELECT * FROM cc_trading_sessions WHERE user_id = ? AND id = ?",
    [userId, sessionId]
  );
}

export function getProductionSession(): Promise<TradingSession | null> {
  return dbGet<TradingSession>("SELECT * FROM cc_trading_sessions WHERE is_production = 1");
}

// ── Session-owned child records (all require userId + sessionId) ───────────

async function assertOwnedSession(userId: number, sessionId: number): Promise<void> {
  const owned = await getSessionForUser(userId, sessionId);
  if (!owned) throw new Error(`Session ${sessionId} does not belong to user ${userId}`);
}

export async function getSessionConfiguration(userId: number, sessionId: number): Promise<SessionConfiguration | null> {
  await assertOwnedSession(userId, sessionId);
  return dbGet<SessionConfiguration>("SELECT * FROM cc_session_configurations WHERE session_id = ?", [sessionId]);
}

export async function getSessionRuntime(userId: number, sessionId: number): Promise<SessionRuntime | null> {
  await assertOwnedSession(userId, sessionId);
  return dbGet<SessionRuntime>("SELECT * FROM cc_session_runtime WHERE session_id = ?", [sessionId]);
}

export async function listPositions(userId: number, sessionId: number): Promise<TradingPosition[]> {
  await assertOwnedSession(userId, sessionId);
  return dbAll<TradingPosition>(
    "SELECT * FROM cc_trading_positions WHERE session_id = ? ORDER BY created_at DESC",
    [sessionId]
  );
}

export async function listOrders(userId: number, sessionId: number): Promise<TradingOrder[]> {
  await assertOwnedSession(userId, sessionId);
  return dbAll<TradingOrder>(
    "SELECT * FROM cc_trading_orders WHERE session_id = ? ORDER BY created_at DESC",
    [sessionId]
  );
}

export async function listExecutions(userId: number, sessionId: number): Promise<TradeExecution[]> {
  await assertOwnedSession(userId, sessionId);
  return dbAll<TradeExecution>(
    "SELECT * FROM cc_trade_executions WHERE session_id = ? ORDER BY created_at DESC",
    [sessionId]
  );
}

export async function listPnlSnapshots(userId: number, sessionId: number, limit = 500): Promise<SessionPnlSnapshot[]> {
  await assertOwnedSession(userId, sessionId);
  return dbAll<SessionPnlSnapshot>(
    "SELECT * FROM cc_session_pnl_snapshots WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?",
    [sessionId, limit]
  );
}

export async function listRiskSnapshots(userId: number, sessionId: number, limit = 500): Promise<SessionRiskSnapshot[]> {
  await assertOwnedSession(userId, sessionId);
  return dbAll<SessionRiskSnapshot>(
    "SELECT * FROM cc_session_risk_snapshots WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?",
    [sessionId, limit]
  );
}

export async function listEvents(userId: number, sessionId: number, limit = 200): Promise<SessionEvent[]> {
  await assertOwnedSession(userId, sessionId);
  return dbAll<SessionEvent>(
    "SELECT * FROM cc_session_events WHERE session_id = ? ORDER BY created_at DESC LIMIT ?",
    [sessionId, limit]
  );
}

export async function listBacktestRuns(userId: number, sessionId: number): Promise<BacktestRun[]> {
  await assertOwnedSession(userId, sessionId);
  return dbAll<BacktestRun>(
    "SELECT * FROM cc_backtest_runs WHERE session_id = ? ORDER BY created_at DESC",
    [sessionId]
  );
}

// ── Reference data (not user-scoped) ────────────────────────────────────────

export function listStrategyDefinitions(): Promise<StrategyDefinition[]> {
  return dbAll<StrategyDefinition>("SELECT * FROM cc_strategy_definitions WHERE is_active = 1");
}

export function listTradableInstruments(): Promise<TradableInstrument[]> {
  return dbAll<TradableInstrument>("SELECT * FROM cc_tradable_instruments WHERE is_active = 1");
}

export function listBrokerAccountsForUser(userId: number): Promise<BrokerAccount[]> {
  return dbAll<BrokerAccount>("SELECT * FROM cc_broker_accounts WHERE user_id = ?", [userId]);
}

// ── Session lifecycle (data-model only — no engine/broker side effects) ────

export async function createDraftSession(
  userId: number,
  input: { name: string; strategyId: number; instrumentId: number; productType: "FUTURES" | "OPTIONS"; mode: "PAPER" | "SHADOW" | "BACKTEST"; brokerAccountId?: number | null }
): Promise<number> {
  if (input.mode === undefined) throw new Error("mode is required");
  await dbRun(
    `INSERT INTO cc_trading_sessions (user_id, name, strategy_id, instrument_id, product_type, mode, broker_account_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT')`,
    [userId, input.name, input.strategyId, input.instrumentId, input.productType, input.mode, input.brokerAccountId ?? null]
  );
  const row = await dbGet<{ id: number }>(
    "SELECT id FROM cc_trading_sessions WHERE user_id = ? ORDER BY id DESC LIMIT 1",
    [userId]
  );
  return row!.id;
}

/** Non-production sessions only. Protected/production sessions are rejected here
 *  and additionally guarded at the database level via triggers on cc_trading_sessions. */
export async function deleteNonProductionSession(userId: number, sessionId: number): Promise<void> {
  const session = await getSessionForUser(userId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} does not belong to user ${userId}`);
  if (session.is_protected || session.is_production) {
    throw new Error("Protected/production sessions cannot be deleted");
  }
  await dbRun("DELETE FROM cc_trading_sessions WHERE id = ? AND user_id = ?", [sessionId, userId]);
}
