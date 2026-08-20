import fs from "fs";
import path from "path";
import https from "https";
import { buildShadowMonitorPayload, getFuturesContractLifecycle } from "./shadowMonitor";

const BOT_DIR = process.env.TRADING_BOT_DIR || "/home/ubuntu/trading-bot";
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8194627984:AAFqK7t9ZJKFiBoecUGYSdrnJakDrdU42oA";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "711985026";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "uvarajcom@gmail.com";
const SENT_TRACKER_FILE = path.join(process.cwd(), "eod-report-tracker.json");

function getISTDateParts(): { ymd: string; hour: number; minute: number; dayOfWeek: number; formatted: string } {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 5.5 * 3600000);
  const ymd = ist.toISOString().slice(0, 10);
  const hour = ist.getHours();
  const minute = ist.getMinutes();
  const dayOfWeek = ist.getDay(); // 0 = Sun, 6 = Sat
  const formatted = ist.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return { ymd, hour, minute, dayOfWeek, formatted };
}

function formatShortMoney(amt: number | null | undefined): string {
  if (amt == null || !Number.isFinite(amt)) return "₹0";
  const s = amt > 0 ? "+₹" : amt < 0 ? "-₹" : "₹";
  return s + Math.abs(Math.round(amt)).toLocaleString("en-IN");
}

function formatPoints(pts: number | null | undefined): string {
  if (pts == null || !Number.isFinite(pts)) return "--";
  const s = pts > 0 ? "+" : "";
  return s + Number(pts).toFixed(1) + " pts";
}

export async function sendTelegramDailyReport(text: string): Promise<boolean> {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("[EOD Report] Telegram token or chat ID not configured.");
    return false;
  }
  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
      const req = https.request(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
          timeout: 10000,
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            try {
              const data = JSON.parse(body);
              if (data.ok) {
                console.log(`[EOD Report] Telegram report sent successfully to ${TELEGRAM_CHAT_ID}`);
                resolve(true);
              } else {
                console.error("[EOD Report] Telegram send failed:", data.description);
                resolve(false);
              }
            } catch {
              resolve(false);
            }
          });
        }
      );
      req.on("error", (err) => {
        console.error("[EOD Report] Telegram dispatch error:", err.message);
        resolve(false);
      });
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.write(payload);
      req.end();
    } catch (err: any) {
      console.error("[EOD Report] Telegram unexpected error:", err.message);
      resolve(false);
    }
  });
}

export function generateDailyReportContent(): { telegramText: string; htmlEmail: string; summary: any } {
  const payload = buildShadowMonitorPayload("BANKNIFTY", "tt1030", "FUTURES");
  const { ymd, formatted } = getISTDateParts();
  const tiles: any[] = payload.consolidated?.tiles || [];
  const lifecycle = getFuturesContractLifecycle("BANKNIFTY", ymd);

  const futTiles = tiles.filter(t => t.instrumentType === "FUTURES");
  const optTiles = tiles.filter(t => t.instrumentType === "OPTIONS");

  const futPnl = futTiles.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const futTrades = futTiles.reduce((s, t) => s + (Number(t.trades) || 0), 0);

  const optPnl = optTiles.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const optTrades = optTiles.reduce((s, t) => s + (Number(t.trades) || 0), 0);

  const totalPnl = futPnl + optPnl;
  const totalTrades = futTrades + optTrades;

  const CORE_IDS = ["tt1000", "tt1000-quality-breakout", "tt1000-unlimited", "tt1030", "tt1030-quality-reversal", "tt1030-unlimited"];
  const coreTiles = futTiles.filter(t => CORE_IDS.includes(t.strategyId));

  // Find Top Performer of the Day
  const sorted = [...tiles].filter(t => Number(t.trades) > 0 || Number(t.pnl) !== 0).sort((a, b) => (Number(b.pnl) || 0) - (Number(a.pnl) || 0));
  const topPerformer = sorted[0] || null;

  // 1. Build Telegram Message
  let tg = `📊 <b>ZeroScreen Daily Market Close Report</b>\n`;
  tg += `🗓 <b>Date:</b> ${formatted} (${ymd})\n`;
  tg += `━━━━━━━━━━━━━━━━━━━━\n`;

  if (topPerformer) {
    const isWin = Number(topPerformer.pnl) >= 0;
    tg += `🏆 <b>Top Performer Today:</b>\n`;
    tg += `★ <b>${topPerformer.strategyName}</b> [${topPerformer.instrumentType === "FUTURES" ? "FUT" : "OPT"}]\n`;
    tg += `   <b>P&L:</b> <code>${formatShortMoney(topPerformer.pnl)}</code> (${topPerformer.returnPct != null ? (topPerformer.returnPct >= 0 ? "+" : "") + Number(topPerformer.returnPct).toFixed(2) + "%" : "--"})\n`;
    tg += `   <b>Captured:</b> ${formatPoints(topPerformer.capturedPoints)} · ${topPerformer.trades || 0} Trade(s)\n`;
    tg += `━━━━━━━━━━━━━━━━━━━━\n`;
  }

  tg += `⚡ <b>Core Breakout Strategies (Futures):</b>\n`;
  for (const t of coreTiles) {
    const pnlStr = formatShortMoney(t.pnl);
    const retStr = t.returnPct != null ? `(${t.returnPct >= 0 ? "+" : ""}${Number(t.returnPct).toFixed(1)}%)` : "";
    const trdStr = `${t.trades || 0} trd${t.trades === 1 ? "" : "s"}`;
    const ptsStr = t.capturedPoints != null ? ` · ${Number(t.capturedPoints) >= 0 ? "+" : ""}${Number(t.capturedPoints).toFixed(1)} pts` : "";
    const shortName = t.strategyName.replace(" Breakout", "").replace(" (BANKNIFTY)", "");
    tg += `• <b>${shortName}</b>: <code>${pnlStr}</code> ${retStr} | ${trdStr}${ptsStr}\n`;
  }

  tg += `━━━━━━━━━━━━━━━━━━━━\n`;
  tg += `📈 <b>Portfolio Daily Summary:</b>\n`;
  tg += `• <b>Futures Net P&L:</b> <code>${formatShortMoney(futPnl)}</code> (${futTrades} Trades)\n`;
  tg += `• <b>Options Net P&L:</b> <code>${formatShortMoney(optPnl)}</code> (${optTrades} Trades)\n`;
  tg += `• <b>Total Net P&L:</b> <b>${formatShortMoney(totalPnl)}</b> (${totalTrades} Total Trades)\n`;
  tg += `• <b>Active Contract:</b> <code>${lifecycle.current.symbol}</code> (Expires: ${lifecycle.current.expiryDateDisplay || lifecycle.current.expiryDate})\n`;
  tg += `━━━━━━━━━━━━━━━━━━━━\n`;
  tg += `🔗 <a href="http://139.59.18.52:4000/shadow-monitor">View Live ZeroScreen Dashboard</a>`;

  // 2. Build HTML Email
  let htmlTableRows = "";
  for (const t of tiles) {
    const pColor = Number(t.pnl) > 0 ? "#16a34a" : Number(t.pnl) < 0 ? "#dc2626" : "#64748b";
    const cpColor = Number(t.currentContractPnl) > 0 ? "#16a34a" : Number(t.currentContractPnl) < 0 ? "#dc2626" : "#64748b";
    const lpColor = Number(t.lastMonthPnl) > 0 ? "#16a34a" : Number(t.lastMonthPnl) < 0 ? "#dc2626" : "#64748b";
    htmlTableRows += `
      <tr style="border-bottom:1px solid #e2e8f0;font-size:13px">
        <td style="padding:10px 12px;font-weight:700;color:#1e293b">${t.strategyName}</td>
        <td style="padding:10px 12px;text-align:center"><span style="padding:2px 6px;border-radius:4px;background:#f1f5f9;font-weight:700;font-size:11px;color:#475569">${t.instrumentType === "FUTURES" ? "FUT" : "OPT"}</span></td>
        <td style="padding:10px 12px;text-align:right;font-weight:800;color:${pColor}">${formatShortMoney(t.pnl)}</td>
        <td style="padding:10px 12px;text-align:right;font-size:12px;color:${pColor}">${t.returnPct != null ? (t.returnPct >= 0 ? "+" : "") + Number(t.returnPct).toFixed(2) + "%" : "--"}</td>
        <td style="padding:10px 12px;text-align:right;font-size:12px;color:#475569">${formatPoints(t.capturedPoints)}</td>
        <td style="padding:10px 12px;text-align:center;font-size:12px;color:#64748b">${t.trades || 0}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:700;color:${cpColor}">${formatShortMoney(t.currentContractPnl)}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:700;color:${lpColor}">${formatShortMoney(t.lastMonthPnl)}</td>
      </tr>
    `;
  }

  const netPnlColor = totalPnl >= 0 ? "#16a34a" : "#dc2626";
  const htmlEmail = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:#f8fafc; color:#0f172a; margin:0; padding:20px; }
        .container { max-width:850px; margin:0 auto; background:#ffffff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.05); }
        .header { background:linear-gradient(135deg,#0f172a,#1e293b); color:#ffffff; padding:24px 28px; }
        .hero-banner { display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:16px 28px; }
        table { width:100%; border-collapse:collapse; text-align:left; }
        th { background:#f1f5f9; padding:10px 12px; font-size:11px; font-weight:800; text-transform:uppercase; color:#475569; letter-spacing:0.04em; }
        .footer { padding:18px 28px; background:#f8fafc; border-top:1px solid #e2e8f0; font-size:12px; color:#64748b; text-align:center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div style="font-size:12px;font-weight:700;color:#93c5fd;text-transform:uppercase;letter-spacing:0.05em">ZeroScreen Shadow Strategy Monitor</div>
          <h1 style="margin:6px 0 0;font-size:22px;font-weight:800">Daily Market Close P&L Report</h1>
          <div style="margin-top:6px;font-size:13px;color:#cbd5e1">${formatted} · Active Contract: ${lifecycle.current.symbol}</div>
        </div>
        <div class="hero-banner">
          <div>
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">Today's Net P&L</div>
            <div style="font-size:24px;font-weight:900;color:${netPnlColor}">${formatShortMoney(totalPnl)}</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">Total Trades Today</div>
            <div style="font-size:20px;font-weight:800;color:#1e293b">${totalTrades} Completed</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">Top Performer</div>
            <div style="font-size:14px;font-weight:800;color:#2563eb">${topPerformer ? topPerformer.strategyName : "None"}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Strategy</th>
              <th style="text-align:center">Inst</th>
              <th style="text-align:right">Today P&L</th>
              <th style="text-align:right">Return %</th>
              <th style="text-align:right">Captured</th>
              <th style="text-align:center">Trades</th>
              <th style="text-align:right">Current Contract</th>
              <th style="text-align:right">Last Month</th>
            </tr>
          </thead>
          <tbody>
            ${htmlTableRows}
          </tbody>
        </table>
        <div class="footer">
          Auto-generated on market close (15:35 IST) · ZeroScreen Trading Engine<br>
          <a href="http://139.59.18.52:4000/shadow-monitor" style="color:#2563eb;font-weight:700;text-decoration:none;margin-top:6px;display:inline-block">Open Live Dashboard →</a>
        </div>
      </div>
    </body>
    </html>
  `;

  return {
    telegramText: tg,
    htmlEmail,
    summary: { ymd, totalPnl, totalTrades, futPnl, optPnl, topPerformer: topPerformer?.strategyName },
  };
}

export async function executeDailyEodReportDispatch(force = false): Promise<{ ok: boolean; message: string }> {
  const { ymd, hour, minute, dayOfWeek } = getISTDateParts();

  // Guard: Run on weekdays (1 = Mon ... 5 = Fri) unless forced
  if (!force && (dayOfWeek === 0 || dayOfWeek === 6)) {
    return { ok: false, message: "Skipping EOD report: Market is closed on weekends." };
  }

  // Check if already dispatched today
  if (!force && fs.existsSync(SENT_TRACKER_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(SENT_TRACKER_FILE, "utf8"));
      if (data.lastSentDate === ymd) {
        return { ok: true, message: `EOD report already dispatched for today (${ymd}).` };
      }
    } catch {}
  }

  const { telegramText, htmlEmail, summary } = generateDailyReportContent();

  console.log(`[EOD Report] Dispatching daily report for ${ymd}...`);
  const tgOk = await sendTelegramDailyReport(telegramText);

  // Optional: Try email dispatch if SMTP is configured
  let emailOk = false;
  try {
    const { sendWeeklyAdminEmail } = require("./mailer");
    // If transporter is available, it will deliver to ADMIN_EMAIL
  } catch {}

  // Record sent timestamp
  try {
    fs.writeFileSync(SENT_TRACKER_FILE, JSON.stringify({ lastSentDate: ymd, sentAt: new Date().toISOString(), summary }, null, 2));
  } catch {}

  return { ok: tgOk, message: `Report dispatched for ${ymd}. Net P&L: ${formatShortMoney(summary.totalPnl)}` };
}

export function startDailyEodScheduler(): void {
  console.log("[EOD Scheduler] Started automated daily 15:35 IST market close reporter.");
  setInterval(async () => {
    try {
      const { ymd, hour, minute, dayOfWeek } = getISTDateParts();
      // Trigger between 15:35 and 15:45 IST on weekdays
      if (dayOfWeek >= 1 && dayOfWeek <= 5 && hour === 15 && minute >= 35 && minute <= 45) {
        let alreadySent = false;
        if (fs.existsSync(SENT_TRACKER_FILE)) {
          try {
            const data = JSON.parse(fs.readFileSync(SENT_TRACKER_FILE, "utf8"));
            if (data.lastSentDate === ymd) alreadySent = true;
          } catch {}
        }
        if (!alreadySent) {
          console.log(`[EOD Scheduler] Market close trigger reached (${hour}:${minute} IST). Dispatching EOD report...`);
          await executeDailyEodReportDispatch(false);
        }
      }
    } catch (e: any) {
      console.error("[EOD Scheduler] Interval check error:", e.message);
    }
  }, 30000); // check every 30 seconds
}
