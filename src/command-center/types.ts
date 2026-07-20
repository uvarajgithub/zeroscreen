export type SessionMode = "LIVE" | "PAPER" | "SHADOW" | "BACKTEST";
export type ProductType = "FUTURES" | "OPTIONS";
export type SessionStatus =
  | "DRAFT" | "READY" | "STARTING" | "RUNNING" | "PAUSED"
  | "STOPPING" | "STOPPED" | "COMPLETED" | "FAILED";
export type EngineState =
  | "IDLE" | "INITIALIZING" | "CONNECTING" | "MONITORING" | "SIGNAL_RECEIVED"
  | "ORDER_SUBMITTING" | "ORDER_PENDING" | "POSITION_ACTIVE" | "POSITION_MANAGING"
  | "EXITING" | "COMPLETED" | "PAUSED" | "STOPPED" | "ERROR";
export type PositionStatus = "OPENING" | "OPEN" | "CLOSING" | "CLOSED" | "REJECTED" | "CANCELLED";
export type OrderStatus =
  | "CREATED" | "VALIDATING" | "SUBMITTED" | "ACKNOWLEDGED"
  | "PARTIALLY_FILLED" | "FILLED" | "REJECTED" | "CANCELLED" | "FAILED";
export type EventSeverity = "INFO" | "SUCCESS" | "WARNING" | "ERROR" | "CRITICAL";
export type BacktestStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface TradingSession {
  id: number;
  user_id: number;
  name: string;
  strategy_id: number | null;
  instrument_id: number | null;
  product_type: ProductType;
  mode: SessionMode;
  broker_account_id: number | null;
  status: SessionStatus;
  is_pinned: 0 | 1;
  is_protected: 0 | 1;
  is_production: 0 | 1;
  started_at: string | null;
  paused_at: string | null;
  stopped_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StrategyDefinition {
  id: number;
  code: string;
  display_name: string;
  description: string | null;
  version: string;
  is_active: 0 | 1;
  supports_futures: 0 | 1;
  supports_options: 0 | 1;
  supports_live: 0 | 1;
  supports_paper: 0 | 1;
  supports_shadow: 0 | 1;
  supports_backtest: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface TradableInstrument {
  id: number;
  exchange: string;
  symbol: string;
  display_name: string | null;
  instrument_type: ProductType;
  lot_size: number;
  tick_size: number;
  is_active: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface BrokerAccount {
  id: number;
  user_id: number;
  broker_code: string;
  display_name: string | null;
  account_reference: string | null;
  connection_status: string;
  token_status: string;
  last_token_refresh_at: string | null;
  last_connected_at: string | null;
  is_active: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface SessionConfiguration {
  id: number;
  session_id: number;
  quantity: number | null;
  lot_count: number | null;
  capital_allocated: number | null;
  max_daily_loss: number | null;
  max_trades_per_day: number | null;
  stop_loss_value: number | null;
  target_value: number | null;
  trading_start_time: string | null;
  trading_cutoff_time: string | null;
  auto_start_enabled: 0 | 1;
  auto_stop_enabled: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface SessionRuntime {
  id: number;
  session_id: number;
  engine_state: EngineState;
  market_state: string | null;
  broker_state: string | null;
  heartbeat_at: string | null;
  last_tick_at: string | null;
  last_action_at: string | null;
  last_error_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  uptime_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface TradingPosition {
  id: number;
  session_id: number;
  instrument_symbol: string;
  product_type: ProductType;
  direction: string;
  quantity: number;
  entry_price: number | null;
  current_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  target: number | null;
  realized_pnl: number | null;
  unrealized_pnl: number | null;
  status: PositionStatus;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TradingOrder {
  id: number;
  session_id: number;
  position_id: number | null;
  broker_order_id: string | null;
  order_type: string | null;
  transaction_type: string | null;
  quantity: number | null;
  requested_price: number | null;
  average_price: number | null;
  trigger_price: number | null;
  status: OrderStatus;
  rejection_reason: string | null;
  submitted_at: string | null;
  acknowledged_at: string | null;
  executed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TradeExecution {
  id: number;
  session_id: number;
  order_id: number | null;
  position_id: number | null;
  broker_execution_id: string | null;
  quantity: number | null;
  price: number | null;
  fees: number | null;
  brokerage: number | null;
  taxes: number | null;
  slippage: number | null;
  executed_at: string | null;
  created_at: string;
}

export interface SessionPnlSnapshot {
  id: number;
  session_id: number;
  timestamp: string;
  realized_pnl: number | null;
  unrealized_pnl: number | null;
  gross_pnl: number | null;
  net_pnl: number | null;
  brokerage: number | null;
  charges: number | null;
  account_balance: number | null;
  available_balance: number | null;
  used_margin: number | null;
  drawdown: number | null;
  created_at: string;
}

export interface SessionRiskSnapshot {
  id: number;
  session_id: number;
  timestamp: string;
  capital_allocated: number | null;
  capital_used: number | null;
  exposure: number | null;
  daily_loss_used: number | null;
  daily_loss_remaining: number | null;
  current_drawdown: number | null;
  max_drawdown: number | null;
  trade_count: number | null;
  remaining_trade_count: number | null;
  kill_switch_active: 0 | 1;
  created_at: string;
}

export interface SessionEvent {
  id: number;
  session_id: number;
  event_type: string;
  severity: EventSeverity;
  title: string | null;
  message: string | null;
  metadata: string | null;
  occurred_at: string;
  created_at: string;
}

export interface BacktestRun {
  id: number;
  session_id: number;
  date_from: string | null;
  date_to: string | null;
  initial_capital: number | null;
  status: BacktestStatus;
  progress_percent: number;
  started_at: string | null;
  completed_at: string | null;
  total_trades: number | null;
  winning_trades: number | null;
  losing_trades: number | null;
  gross_pnl: number | null;
  net_pnl: number | null;
  max_drawdown: number | null;
  profit_factor: number | null;
  win_rate: number | null;
  result_summary: string | null;
  created_at: string;
  updated_at: string;
}
