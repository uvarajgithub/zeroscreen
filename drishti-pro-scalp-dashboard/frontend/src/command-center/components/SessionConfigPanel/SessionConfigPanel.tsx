import React, { useMemo, useState } from "react";
import { CommandCenterCard, CommandCenterSelect, CommandCenterButton } from "../ui";
import {
  NewSessionConfig, STRATEGY_CAPABILITIES, ProductType,
  validateNewSessionConfig, generateSessionName,
} from "../../business/SessionValidation";
import { SessionMode } from "../../types/session";

interface SessionConfigPanelProps {
  onCreate: (config: NewSessionConfig, start: boolean) => void;
  onCancel: () => void;
}

const INSTRUMENT_OPTIONS = ["BANKNIFTY"];
/** LIVE is intentionally excluded — "+ New Session" only creates Paper/Shadow/Backtest; LIVE is the protected singleton. */
const MODE_OPTIONS: SessionMode[] = ["PAPER", "SHADOW", "BACKTEST"];

/** Compact single-panel session configuration — no multi-page wizard. */
export function SessionConfigPanel({ onCreate, onCancel }: SessionConfigPanelProps) {
  const strategyOptions = Object.keys(STRATEGY_CAPABILITIES);
  const [strategy, setStrategy] = useState(strategyOptions[0]);
  const [instrument, setInstrument] = useState(INSTRUMENT_OPTIONS[0]);
  const [mode, setMode] = useState<SessionMode>("PAPER");
  const [quantity, setQuantity] = useState(1);
  const [sessionName, setSessionName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [initialCapital, setInitialCapital] = useState(100000);

  const capability = STRATEGY_CAPABILITIES[strategy];
  const productOptions = useMemo<ProductType[]>(() => {
    const options: ProductType[] = [];
    if (capability?.supportsFutures) options.push("FUTURES");
    if (capability?.supportsOptions) options.push("OPTIONS");
    return options.length > 0 ? options : ["FUTURES"];
  }, [capability]);
  const [product, setProduct] = useState<ProductType>(productOptions[0]);
  const activeProduct = productOptions.includes(product) ? product : productOptions[0];

  const config: NewSessionConfig = {
    strategy, instrument, product: activeProduct, mode, broker: null, quantity,
    sessionName: sessionName || null,
    dateFrom: mode === "BACKTEST" ? dateFrom || null : null,
    dateTo: mode === "BACKTEST" ? dateTo || null : null,
    initialCapital: mode === "BACKTEST" ? initialCapital : null,
  };
  const validation = validateNewSessionConfig(config);
  const autoName = generateSessionName(config);
  const startLabel = mode === "BACKTEST" ? "Create and Run Backtest" : "Create and Start";

  return (
    <div className="cc-new-session-panel">
      <CommandCenterCard title="New Session">
        <div className="cc-new-session-panel__fields">
          <CommandCenterSelect label="Strategy" options={strategyOptions} value={strategy} onChange={(e) => setStrategy(e.target.value)} />
          {validation.fieldErrors.strategy && <span className="cc-field__error">{validation.fieldErrors.strategy}</span>}

          <CommandCenterSelect label="Instrument" options={INSTRUMENT_OPTIONS} value={instrument} onChange={(e) => setInstrument(e.target.value)} />

          <CommandCenterSelect label="Product" options={productOptions} value={activeProduct} onChange={(e) => setProduct(e.target.value as ProductType)} />
          {validation.fieldErrors.product && <span className="cc-field__error">{validation.fieldErrors.product}</span>}

          <CommandCenterSelect label="Mode" options={MODE_OPTIONS} value={mode} onChange={(e) => setMode(e.target.value as SessionMode)} />
          {validation.fieldErrors.mode && <span className="cc-field__error">{validation.fieldErrors.mode}</span>}

          {/* Broker is hidden here because "+ New Session" never creates LIVE sessions — broker is only required for LIVE. */}

          <label className="cc-field">
            <span className="cc-field__label">Quantity</span>
            <input
              className="cc-select"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </label>
          {validation.fieldErrors.quantity && <span className="cc-field__error">{validation.fieldErrors.quantity}</span>}

          {mode === "BACKTEST" && (
            <>
              <label className="cc-field">
                <span className="cc-field__label">Start Date</span>
                <input className="cc-select" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </label>
              {validation.fieldErrors.dateFrom && <span className="cc-field__error">{validation.fieldErrors.dateFrom}</span>}

              <label className="cc-field">
                <span className="cc-field__label">End Date</span>
                <input className="cc-select" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </label>
              {validation.fieldErrors.dateTo && <span className="cc-field__error">{validation.fieldErrors.dateTo}</span>}

              <label className="cc-field">
                <span className="cc-field__label">Initial Capital</span>
                <input
                  className="cc-select"
                  type="number"
                  min={1}
                  value={initialCapital}
                  onChange={(e) => setInitialCapital(Number(e.target.value))}
                />
              </label>
              {validation.fieldErrors.initialCapital && <span className="cc-field__error">{validation.fieldErrors.initialCapital}</span>}
            </>
          )}

          <label className="cc-field">
            <span className="cc-field__label">Session Name (optional)</span>
            <input
              className="cc-select"
              type="text"
              placeholder={autoName}
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
            />
          </label>
        </div>

        <div className="cc-new-session-panel__actions">
          <CommandCenterButton variant="neutral" onClick={onCancel}>Cancel</CommandCenterButton>
          <CommandCenterButton variant="secondary" disabled={!validation.valid} onClick={() => onCreate(config, false)}>
            Create Session
          </CommandCenterButton>
          <CommandCenterButton variant="primary" disabled={!validation.valid} onClick={() => onCreate(config, true)}>
            {startLabel}
          </CommandCenterButton>
        </div>
      </CommandCenterCard>
    </div>
  );
}
