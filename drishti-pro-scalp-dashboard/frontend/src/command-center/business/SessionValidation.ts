/**
 * SessionValidation — pure validation rules. No UI, no side effects.
 */
import { Session, SessionMode } from "../types/session";

export type ProductType = "FUTURES" | "OPTIONS";

export interface CommandBarSelection {
  strategy: string | null;
  instrument: string | null;
  product: ProductType | null;
  mode: SessionMode | null;
  broker: string | null;
}

export interface NewSessionConfig extends CommandBarSelection {
  quantity: number | null;
  sessionName?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  initialCapital?: number | null;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Field-level result — CC-007 §5 requires messages near the relevant field, not toast-only. */
export interface FieldValidationResult {
  valid: boolean;
  fieldErrors: Partial<Record<keyof NewSessionConfig, string>>;
}

/**
 * Strategy capability matrix. Metadata only (no formulas/thresholds) —
 * mirrors CC-002's `cc_strategy_definitions.supports_*` columns. DRISHTI_V1
 * is the real production strategy; STRATEGY_B is a placeholder so
 * Paper/Shadow/Backtest sessions have more than one option to pick from.
 */
export interface StrategyCapability {
  code: string;
  supportsFutures: boolean;
  supportsOptions: boolean;
  supportsLive: boolean;
  supportsPaper: boolean;
  supportsShadow: boolean;
  supportsBacktest: boolean;
}

export const STRATEGY_CAPABILITIES: Record<string, StrategyCapability> = {
  DRISHTI_V1: {
    code: "DRISHTI_V1", supportsFutures: true, supportsOptions: false,
    supportsLive: true, supportsPaper: true, supportsShadow: true, supportsBacktest: true,
  },
  STRATEGY_B: {
    code: "STRATEGY_B", supportsFutures: true, supportsOptions: true,
    supportsLive: false, supportsPaper: true, supportsShadow: true, supportsBacktest: true,
  },
};

/** System-dependency checks that a real integration phase would source from live APIs. Defaults are optimistic stubs, documented as such. */
export interface SystemStatus {
  brokerConnected: boolean;
  tokenValid: boolean;
  marketFeedAvailable: boolean;
  historicalDataAvailable: boolean;
  simulationRuntimeAvailable: boolean;
}

export const DEFAULT_SYSTEM_STATUS: SystemStatus = {
  brokerConnected: true,
  tokenValid: true,
  marketFeedAvailable: true,
  historicalDataAvailable: true,
  simulationRuntimeAvailable: true,
};

/** Command Bar → Deploy validation: Strategy/Instrument/Mode mandatory; Broker mandatory only for LIVE. */
export function validateCommandBarSelection(selection: CommandBarSelection): ValidationResult {
  const errors: string[] = [];
  if (!selection.strategy) errors.push("Strategy is required.");
  if (!selection.instrument) errors.push("Instrument is required.");
  if (!selection.mode) errors.push("Mode is required.");
  if (selection.mode === "LIVE" && !selection.broker) errors.push("Broker is required for LIVE sessions.");
  return { valid: errors.length === 0, errors };
}

/** Broker Rules: LIVE mandatory, PAPER/SHADOW optional, BACKTEST not required. */
export function isBrokerRequired(mode: SessionMode): boolean {
  return mode === "LIVE";
}

/**
 * Full "+ New Session" panel validation (CC-007 §5). Returns field-keyed
 * errors so the UI can render them next to the relevant control instead of
 * only as a toast.
 */
export function validateNewSessionConfig(
  config: NewSessionConfig,
  systemStatus: SystemStatus = DEFAULT_SYSTEM_STATUS,
): FieldValidationResult {
  const fieldErrors: FieldValidationResult["fieldErrors"] = {};

  if (!config.strategy) fieldErrors.strategy = "Strategy is required.";
  if (!config.instrument) fieldErrors.instrument = "Instrument is required.";
  if (!config.product) fieldErrors.product = "Product is required.";
  if (!config.mode) fieldErrors.mode = "Mode is required.";
  if (config.quantity == null || config.quantity <= 0) fieldErrors.quantity = "Quantity must be greater than zero.";

  const strategy = config.strategy ? STRATEGY_CAPABILITIES[config.strategy] : undefined;
  if (config.strategy && !strategy) fieldErrors.strategy = "Unknown strategy.";
  if (strategy && config.product) {
    const supportsProduct = config.product === "FUTURES" ? strategy.supportsFutures : strategy.supportsOptions;
    if (!supportsProduct) fieldErrors.product = `${strategy.code} does not support ${config.product}.`;
  }
  if (strategy && config.mode) {
    const supportsMode =
      config.mode === "LIVE" ? strategy.supportsLive :
      config.mode === "PAPER" ? strategy.supportsPaper :
      config.mode === "SHADOW" ? strategy.supportsShadow :
      strategy.supportsBacktest;
    if (!supportsMode) fieldErrors.mode = `${strategy.code} does not support ${config.mode} mode.`;
  }

  if (config.mode === "LIVE") {
    if (!config.broker) fieldErrors.broker = "Broker is required for LIVE sessions.";
    if (!systemStatus.brokerConnected) fieldErrors.broker = "Broker is not connected.";
    else if (!systemStatus.tokenValid) fieldErrors.broker = "Broker token is invalid or expired.";
    if (!systemStatus.marketFeedAvailable) fieldErrors.mode = "Market feed is unavailable.";
  }

  if (config.mode === "PAPER" && !systemStatus.simulationRuntimeAvailable) {
    fieldErrors.mode = "Simulation runtime is unavailable.";
  }

  if (config.mode === "SHADOW" && !systemStatus.marketFeedAvailable) {
    fieldErrors.mode = "Live market feed is unavailable for Shadow mode.";
  }

  if (config.mode === "BACKTEST") {
    if (!config.dateFrom) fieldErrors.dateFrom = "Start date is required.";
    if (!config.dateTo) fieldErrors.dateTo = "End date is required.";
    if (config.dateFrom && config.dateTo && config.dateFrom >= config.dateTo) {
      fieldErrors.dateTo = "End date must be after start date.";
    }
    if (!systemStatus.historicalDataAvailable) fieldErrors.dateFrom = "Historical data is unavailable for this range.";
    if (config.initialCapital == null || config.initialCapital <= 0) {
      fieldErrors.initialCapital = "Initial capital must be greater than zero.";
    }
  }

  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors };
}

/** CC-007 §4 — auto-generated session name when the user leaves it blank. */
export function generateSessionName(config: Pick<NewSessionConfig, "mode" | "instrument" | "product" | "strategy" | "dateFrom" | "dateTo">): string {
  const modeLabel = config.mode ? config.mode.charAt(0) + config.mode.slice(1).toLowerCase() : "Session";
  if (config.mode === "BACKTEST" && config.dateFrom) {
    const month = new Date(config.dateFrom).toLocaleString("en-US", { month: "short", year: "numeric" });
    return `${modeLabel} · ${config.instrument ?? "Session"} · ${month}`;
  }
  const productLabel = config.product === "OPTIONS" ? "Options" : "Futures";
  return `${modeLabel} · ${config.instrument ?? "Instrument"} ${productLabel}`;
}

/** Production session protection: never deletable, duplicable, renamable, or convertible to another mode. */
export function assertNotProtectedMutation(session: Session, action: "delete" | "duplicate" | "rename" | "changeStrategy" | "changeMode" | "changeInstrument" | "changeProduct" | "changeBroker"): void {
  if (!session.isProtected) return;
  throw new Error(`Protected session "${session.name}" cannot be ${action}d.`);
}

/** LIVE sessions only support Start/Pause/Resume/Stop/EmergencyStop lifecycle actions. */
export function assertLifecycleActionAllowed(session: Session, action: "start" | "pause" | "resume" | "stop" | "emergencyStop" | "delete" | "duplicate" | "rename"): void {
  if (session.mode !== "LIVE") return;
  const allowed: (typeof action)[] = ["start", "pause", "resume", "stop", "emergencyStop"];
  if (!allowed.includes(action)) {
    throw new Error(`LIVE session "${session.name}" does not support "${action}".`);
  }
}

/** CC-007 §18 — which user actions require an explicit confirmation dialog. */
export function requiresConfirmation(
  action: "start" | "stop" | "pause" | "resume" | "close" | "delete" | "emergencyStop",
  session: Pick<Session, "mode">,
  context: { hasActivePosition?: boolean; hasPendingOrder?: boolean; isRunning?: boolean } = {},
): boolean {
  if (action === "delete" || action === "emergencyStop") return true;
  if (action === "start" && session.mode === "LIVE") return true;
  if (action === "stop" && (session.mode === "LIVE" || context.hasActivePosition || context.hasPendingOrder)) return true;
  if (action === "close" && context.isRunning) return true;
  return false; // switching tabs/workspace, drafting, and pausing an idle Paper/Shadow session never confirm.
}
