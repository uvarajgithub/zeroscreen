/**
 * SessionRepository — in-memory persistence seam for CC-006.
 *
 * No API/database calls yet (CC-002's `cc_*` tables are the real target of
 * a future integration phase). Every accessor below is keyed by `sessionId`
 * and never returns data across sessions — the same isolation contract as
 * CC-002's repository, just backed by memory instead of SQLite for now.
 */
import { Session } from "../types/session";

export interface TradeRecord { sessionId: string; [key: string]: unknown }
export interface OrderRecord { sessionId: string; [key: string]: unknown }
export interface LogRecord { sessionId: string; [key: string]: unknown }
export interface HistoryRecord { sessionId: string; [key: string]: unknown }
export interface AnalyticsSnapshot { sessionId: string; [key: string]: unknown }

export class SessionRepository {
  private sessions = new Map<string, Session>();
  private trades = new Map<string, TradeRecord[]>();
  private orders = new Map<string, OrderRecord[]>();
  private logs = new Map<string, LogRecord[]>();
  private history = new Map<string, HistoryRecord[]>();
  private analytics = new Map<string, AnalyticsSnapshot[]>();

  // ── Sessions ───────────────────────────────────────────────────────────
  listSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  saveSession(session: Session): void {
    this.sessions.set(session.id, session);
    if (!this.trades.has(session.id)) this.trades.set(session.id, []);
    if (!this.orders.has(session.id)) this.orders.set(session.id, []);
    if (!this.logs.has(session.id)) this.logs.set(session.id, []);
    if (!this.history.has(session.id)) this.history.set(session.id, []);
    if (!this.analytics.has(session.id)) this.analytics.set(session.id, []);
  }

  deleteSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session?.isProtected) {
      throw new Error(`Protected session "${session.name}" cannot be deleted.`);
    }
    this.sessions.delete(sessionId);
    this.trades.delete(sessionId);
    this.orders.delete(sessionId);
    this.logs.delete(sessionId);
    this.history.delete(sessionId);
    this.analytics.delete(sessionId);
  }

  // ── Session-scoped reads (never combined across sessions) ─────────────
  getTrades(sessionId: string): TradeRecord[] { return this.trades.get(sessionId) ?? []; }
  getOrders(sessionId: string): OrderRecord[] { return this.orders.get(sessionId) ?? []; }
  getLogs(sessionId: string): LogRecord[] { return this.logs.get(sessionId) ?? []; }
  getHistory(sessionId: string): HistoryRecord[] { return this.history.get(sessionId) ?? []; }
  getAnalytics(sessionId: string): AnalyticsSnapshot[] { return this.analytics.get(sessionId) ?? []; }

  appendLog(sessionId: string, record: LogRecord): void {
    this.logs.get(sessionId)?.push(record);
  }
}
