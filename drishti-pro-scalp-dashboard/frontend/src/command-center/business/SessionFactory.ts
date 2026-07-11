/**
 * SessionFactory — creates Session records and their runtime, per the
 * Command Bar's Deploy routing:
 *   LIVE      -> load the existing production runtime (never a new one)
 *   PAPER     -> new paper runtime
 *   SHADOW    -> new shadow runtime
 *   BACKTEST  -> new backtest runtime
 */
import { Session, SessionMode } from "../types/session";
import {
  NewSessionConfig, validateNewSessionConfig, generateSessionName,
  SystemStatus, DEFAULT_SYSTEM_STATUS, FieldValidationResult,
} from "./SessionValidation";
import { SessionRuntimeService, ProductionAdapter, noopProductionAdapter } from "./SessionRuntimeService";

let sequence = 0;
function nextId(mode: SessionMode): string {
  sequence += 1;
  return `${mode.toLowerCase()}-${sequence}`;
}

export class SessionCreationError extends Error {
  constructor(public readonly fieldErrors: FieldValidationResult["fieldErrors"]) {
    super(Object.values(fieldErrors).join(" "));
  }
}

export class SessionFactory {
  /** LIVE is a singleton — created once (see createProductionSession) and never duplicated via the "+ New Session" workflow. */
  createSession(input: NewSessionConfig, systemStatus: SystemStatus = DEFAULT_SYSTEM_STATUS): Session {
    if (input.mode === "LIVE") {
      throw new SessionCreationError({ mode: "A new LIVE session cannot be created — the production session is a protected singleton." });
    }
    const validation = validateNewSessionConfig(input, systemStatus);
    if (!validation.valid) throw new SessionCreationError(validation.fieldErrors);

    const mode = input.mode as Exclude<SessionMode, "LIVE">;
    const id = nextId(mode);
    return {
      id,
      name: input.sessionName?.trim() || generateSessionName(input),
      mode,
      instrument: input.instrument!,
      product: input.product!,
      strategy: input.strategy!,
      broker: input.broker ?? null,
      quantity: input.quantity!,
      isPinned: false,
      isProtected: false,
      closable: true,
      status: "READY", // configuration is already valid — Start is a separate, explicit action.
      dateFrom: input.dateFrom ?? null,
      dateTo: input.dateTo ?? null,
      initialCapital: input.initialCapital ?? null,
    };
  }

  /** Called once, at app bootstrap, to represent the existing 10:30 BANKNIFTY Futures strategy — loaded and reused, never recreated. */
  createProductionSession(): Session {
    return {
      id: "production-10-30-banknifty-futures",
      name: "10:30 LIVE",
      mode: "LIVE",
      instrument: "BANKNIFTY",
      product: "FUTURES",
      strategy: "DRISHTI_V1",
      broker: "ZERODHA",
      quantity: 1, // 1 lot default, per CC-007 §1
      isPinned: true,
      isProtected: true,
      closable: false,
      status: "RUNNING",
    };
  }

  /** Deploy routing — LIVE always loads the one production runtime, never creates a new one. */
  createRuntime(session: Session, productionAdapter: ProductionAdapter = noopProductionAdapter): SessionRuntimeService {
    return new SessionRuntimeService(session, productionAdapter);
  }
}
