import dotenv from "dotenv";
import fs from "fs";
dotenv.config({ override: true });

export const defaultConfig = {
  mode: process.env.MODE || "LIVE",
  apiKey: process.env.API_KEY!,
  accessToken: process.env.ACCESS_TOKEN!,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  capital: Number(process.env.CAPITAL) || 200000,
  capitalDrawdownPercent: Number(process.env.CAPITAL_DRAWDOWN_PERCENT) || 5,
  quantity: Number(process.env.QUANTITY) || 1,
  // ── Strategy selector ──────────────────────────────────────────────────────
  // "BODY_BREAKOUT" : enter directly when candle close breaks body by MIN_BREAKOUT_MARGIN
  // "RC_CONFIRM"    : wait for reversal candle after breakout, enter at RC close, max 2 trades
  // "ITM_HOLD"      : BB signal → buy ITM monthly option → hold 3 calendar days, max 2 concurrent
  // "AMINA"         : Rolling C1+C2 scan | T1 SL 50pt | Re-entry opposite 100pt SL | 5yr Rs 10,66,085
  activeStrategy: "BODY_BREAKOUT" as "BODY_BREAKOUT" | "RC_CONFIRM" | "ITM_HOLD" | "HYBRID_REVERSE" | "AMINA",

  risk: {
    maxDailyLossPoints: 100,
    maxTradesPerDay: 1,      // 1 trade/day — simpler, matches 1-trade backtest
    dailyLossCap: 200,       // stop after 2 SL hits (-200 pts)
    riskPerTradePercent: 1,
  },
  strategy: {
    timeframe: "15m",
    earlyEntryEnabled: true,
    vwapFilter: true,
    momentumThreshold: 30,
  },
  entry: {
    earlyEntryBufferPts: 20,
    breakoutBufferPts: 10,
  },
  optionSelection: {
    minPremium: 400,
    maxPremium: 600,
    preferLiquidity: true,
    minBreakoutMargin: 50,   // close must be 50+ pts past body high/low — filters hairline breakouts
  },
  tradeManagement: {
    stopLossPoints: 100,
    targetPoints: 300,       // legacy field — kept for reference; replaced by trail logic below
    trailActivatePts: 300,   // profit pts at which reversal-candle trailing SL activates (backtest best: 300)
    reversalBodyMin: 75,     // min candle body pts to count as a reversal candle (backtest best: 75)
    trailingStops: [
      { profit: 200, sl: 50 },
      { profit: 350, sl: 150 },
      { profit: 500, sl: 300 }
    ]
  },
  instrument: {
    name: "BANKNIFTY",
    token: 15955458,           // NSE instrument token for BANKNIFTY historical data
    ltpSymbol: "NSE:NIFTY BANK", // Symbol used for getLTP
    exchange: "NFO",
  },
  // ── ITM_HOLD strategy config ───────────────────────────────────────────────
  // Only used when activeStrategy = "ITM_HOLD"
  itmHold: {
    strikeOffset: 1000,    // pts ITM: CE strike = spot-1000, PE strike = spot+1000 (delta ~0.8)
    holdDays: 3,           // calendar days to hold before time-exit (backtest best: 3d, 38/23 +/- months)
    minDTE: 15,            // min days-to-monthly-expiry required at entry (avoids theta crush)
    slBuffer: 50,          // extra pts beyond signal candle low/high for SL (CE: low-50, PE: high+50)
    maxConcurrent: 2,      // max simultaneous open positions (each needs ~Rs 42-44k capital)
  }
};

function loadUserOverrides() {
  try {
    const path = "user-settings.json";
    if (fs.existsSync(path)) {
      const raw = fs.readFileSync(path, "utf-8");
      const overrides = JSON.parse(raw);
      // Only allow safe keys
      const allowed = ["mode","quantity","risk","strategy","entry","optionSelection","tradeManagement","instrument","itmHold","activeStrategy"];
      const filtered: any = {};
      for (const key of allowed) {
        if (overrides[key] !== undefined) filtered[key] = overrides[key];
      }
      // ── Strategy preset auto-config ──────────────────────────────────────
      // When activeStrategy is set, auto-apply that strategy's proven config.
      // User can still override individual sub-keys on top (e.g. quantity).
      if (filtered.activeStrategy === "ITM_HOLD" && !filtered.itmHold) {
        // Apply backtest-proven ITM_HOLD defaults (no manual itmHold block needed)
        filtered.itmHold = STRATEGY_PRESETS["ITM_HOLD"].itmHold;
      }
      if (filtered.activeStrategy === "BODY_BREAKOUT" && !filtered.optionSelection) {
        filtered.optionSelection = STRATEGY_PRESETS["BODY_BREAKOUT"].optionSelection;
      }
      if (filtered.activeStrategy === "RC_CONFIRM" && !filtered.optionSelection) {
        filtered.optionSelection = STRATEGY_PRESETS["RC_CONFIRM"].optionSelection;
      }
      if (filtered.activeStrategy === "HYBRID_REVERSE" && !filtered.risk) {
        filtered.risk            = STRATEGY_PRESETS["HYBRID_REVERSE"].risk;
        filtered.tradeManagement = STRATEGY_PRESETS["HYBRID_REVERSE"].tradeManagement;
        filtered.optionSelection = STRATEGY_PRESETS["HYBRID_REVERSE"].optionSelection;
      }
      if (filtered.activeStrategy === "AMINA" && !filtered.risk) {
        filtered.risk            = STRATEGY_PRESETS["AMINA"].risk;
        filtered.tradeManagement = STRATEGY_PRESETS["AMINA"].tradeManagement;
        filtered.optionSelection = STRATEGY_PRESETS["AMINA"].optionSelection;
      }
      return filtered;
    }
  } catch (e) {
    console.error("Error loading user overrides:", e);
  }
  return {};
}

// ── Strategy presets — full config for each named strategy ────────────────────
// Just set "activeStrategy": "<NAME>" in user-settings.json to switch strategies.
// All other params are auto-applied from the preset below.
export const STRATEGY_PRESETS = {
  BODY_BREAKOUT: {
    // Original strategy: direct entry on 15-min candle body breakout, exit same day
    optionSelection: { minPremium: 400, maxPremium: 600, preferLiquidity: true, minBreakoutMargin: 50 },
    tradeManagement: { stopLossPoints: 100, targetPoints: 0, trailingStops: [{ profit: 200, sl: 50 }, { profit: 350, sl: 150 }, { profit: 500, sl: 300 }] },
  },
  RC_CONFIRM: {
    // Wait for reversal candle after breakout, enter at RC close, max 2 trades
    optionSelection: { minPremium: 400, maxPremium: 600, preferLiquidity: true, minBreakoutMargin: 50 },
    tradeManagement: { stopLossPoints: 100, targetPoints: 0, trailingStops: [{ profit: 200, sl: 50 }, { profit: 350, sl: 150 }, { profit: 500, sl: 300 }] },
  },
  ITM_HOLD: {
    // Backtest: +Rs 2.86L/yr (1 leg), Win 29%, R:R 4.21, 38/23 positive/negative months
    // Signal: same BB+CandleLow 15-min breakout
    // Option: ITM1000 monthly (delta ~0.8), hold 3 days, SL = candle low/high ± 50pts
    // Capital: ~Rs 42-44k per leg, max 2 concurrent legs (~Rs 84-88k total)
    itmHold: {
      strikeOffset: 1000,   // pts ITM: CE = spot-1000, PE = spot+1000 → delta ~0.8
      holdDays: 3,          // exit after 3 calendar days if no SL hit
      minDTE: 15,           // skip entry if <15 days to monthly expiry
      slBuffer: 50,         // index SL = candle low - 50 (CE) or candle high + 50 (PE)
      maxConcurrent: 2,     // max 2 open positions simultaneously
    },
  },
  AMINA: {
    // Backtest: +Rs 10,66,085 (5yr, 1233 days) | Win rate 45% | Max loss/day Rs -2,250
    // Entry   : Rolling C1+C2 scan (Rule A: same-color | Rule B: C2 body > C1 opposite)
    //           First candle CLOSE crossing breakout level. First signal of the day only.
    // T1 SL   : 50 pts fixed (candle close basis) | T1 Target: NONE — hold to 3:15 PM
    // Re-entry: Opposite direction | Filter: price vs day open (moveAgainstRe < 0)
    //           SL: 100 pts fixed | Target: NONE — hold to EOD
    // Capital : Rs 15,000/trade (30 qty × ~500 premium) | Rs/pt = 15
    risk: {
      maxDailyLossPoints: 150,  // max T1(-50) + Re(-100) = -150 pts/day
      maxTradesPerDay: 2,       // T1 + 1 optional re-entry
      dailyLossCap: 150,
      riskPerTradePercent: 1,
    },
    optionSelection: {
      minPremium: 400,
      maxPremium: 600,
      preferLiquidity: true,
      minBreakoutMargin: 0,     // no buffer needed — close must cross BL
    },
    tradeManagement: {
      stopLossPoints: 50,       // T1 SL (re-entry SL is 100, handled in amina-live.ts)
      targetPoints: 0,          // no target — hold to EOD
      trailingStops: [],
    },
  },
  HYBRID_REVERSE: {
    // Backtest: +Rs 16,45,335 (5yr, 2 lots=30 qty) | +Rs 8,22,670 (1 lot=15 qty) | MaxDD Rs 22,200 (2 lots)
    // Signal  : 15-min body breakout + 25 pt buffer (CE: close > prevBodyHigh+25)
    // SL      : ±100 pts | C1-3: exit −3 if candle-1 closes 3+ pts against
    // Mod-A   : after C1 early exit, reset state → fresh signal in ANY direction
    // HybRev  : if SL candle body closes past SL level → immediately enter opposite
    // Re-entry: same-dir 1x after wick-only SL (refHigh must be broken)
    // Live    : 2 lots = 30 qty | P&L = index_pts / 2 × 30
    risk: {
      maxDailyLossPoints: 100,
      maxTradesPerDay: 5,    // allow unlimited Mod-A resets per day
      dailyLossCap: 200,     // stop after −200 index pts in a day
      riskPerTradePercent: 1,
    },
    tradeManagement: {
      stopLossPoints: 100,
      targetPoints: 0,
      trailingStops: [],
    },
    optionSelection: {
      minPremium: 50,
      maxPremium: 1500,
      preferLiquidity: true,
      minBreakoutMargin: 25,
    },
  },
} as const;

export const config = {
  ...defaultConfig,
  ...loadUserOverrides(),
};
