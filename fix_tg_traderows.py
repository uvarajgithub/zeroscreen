#!/usr/bin/env python3
# Patch v2: Add per-trade rows (T1, T2... + Total) to TRAIL and LOCK50 Old
# Uses line-insertion at anchor comments to avoid unicode escape issues
FILE = '/home/ubuntu/trading-bot/dist/src/index.js'
src = open(FILE, 'r', encoding='utf-8').read()

# ─── Replace TRAIL shadow context block ────────────────────────────────────────
OLD_TRAIL = """            // Build TRAIL shadow context for Telegram
            const _shInTrade = shadowState.inTrade;
            const _shDir = (shadowState.dir || "").toUpperCase();
            const _shEntry = shadowState.entry || 0;
            const _shSL = shadowState.sl || 0;
            const _shSign = shadowPnL >= 0 ? "+" : "";
            let trailCtx = "";
            if (_shInTrade && _shDir) {
                const _shU = _shDir === "CE" ? price - _shEntry : _shEntry - price;
                const _shUS = _shU >= 0 ? "+" : "";
                // TG_DOTS_V2
                trailCtx =
                    `\u{1F534} *TRAIL*  \u00B7  ${_shDir} In Trade\\n` +
                        `${_shU >= 0 ? "\u{1F7E2}" : "\u{1F534}"} *${_shUS}${_shU.toFixed(0)} pts gathered* \\u00B7 SL: ${_shSL > 0 ? _shSL.toFixed(0) : "\\u2014"}\\n` +
                        `Entry: ${_shEntry.toFixed(0)}  \\u00B7  ${shadowWins}W ${shadowLosses}L  \\u00B7  T:${shadowTrades}/5\\n` +
                        `\u{1F4CA} *${_shSign}${shadowPnL.toFixed(0)} pts*`;
            }
            else if (shadowTrades >= 5) {
                trailCtx = `\u2705 *TRAIL*  \\u00B7  Done for Day\\n\u{1F4CA} ${_shSign}${shadowPnL.toFixed(0)} pts*  \\u00B7  ${shadowWins}W ${shadowLosses}L  \\u00B7  T:${shadowTrades}/5`;
            }
            else {
                const _nbH = Math.max(finalPrev.open, finalPrev.close);
                const _nbL = Math.min(finalPrev.open, finalPrev.close);
                const _ceLvl = (_nbH + 25).toFixed(0);
                const _peLvl = (_nbL - 25).toFixed(0);
                const _ceD = price - (_nbH + 25);
                const _peD = (_nbL - 25) - price;
                trailCtx =
                    `\u{1F441} *TRAIL*  \\u00B7  Watching\\n` +
                        `\u{1F4C8} CE \u2265 *${_ceLvl}*  \u2014  ${_ceD >= 0 ? Math.abs(_ceD).toFixed(0) + " pts ahead" : Math.abs(_ceD).toFixed(0) + " pts away"}\\n` +
                        `\u{1F4C9} PE \u2264 *${_peLvl}*  \u2014  ${_peD >= 0 ? Math.abs(_peD).toFixed(0) + " pts ahead" : Math.abs(_peD).toFixed(0) + " pts away"}\\n` +
                        `\u{1F4CA} *${_shSign}${shadowPnL.toFixed(0)} pts*  \\u00B7  T:${shadowTrades}/5`;
            }"""

NEW_TRAIL = """            // Build TRAIL shadow context for Telegram
            const _shInTrade = shadowState.inTrade;
            const _shDir = (shadowState.dir || "").toUpperCase();
            const _shEntry = shadowState.entry || 0;
            const _shSL = shadowState.sl || 0;
            const _shSign = shadowPnL >= 0 ? "+" : "";
            let trailCtx = "";
            if (_shInTrade && _shDir) {
                const _shU = _shDir === "CE" ? price - _shEntry : _shEntry - price;
                const _shUS = _shU >= 0 ? "+" : "";
                // TG_DOTS_V2
                trailCtx =
                    `\u{1F534} *TRAIL*  \u00B7  ${_shDir} In Trade\\n` +
                        `${_shU >= 0 ? "\u{1F7E2}" : "\u{1F534}"} *${_shUS}${_shU.toFixed(0)} pts gathered* \\u00B7 SL: ${_shSL > 0 ? _shSL.toFixed(0) : "\\u2014"}\\n` +
                        `Entry: ${_shEntry.toFixed(0)}  \\u00B7  ${shadowWins}W ${shadowLosses}L  \\u00B7  T:${shadowTrades}/5\\n` +
                        `\u{1F4CA} *${_shSign}${shadowPnL.toFixed(0)} pts*`;
            }
            else if (shadowTrades >= 5) {
                trailCtx = `\u2705 *TRAIL*  \\u00B7  Done for Day\\n\u{1F4CA} ${_shSign}${shadowPnL.toFixed(0)} pts*  \\u00B7  ${shadowWins}W ${shadowLosses}L  \\u00B7  T:${shadowTrades}/5`;
            }
            else {
                const _nbH = Math.max(finalPrev.open, finalPrev.close);
                const _nbL = Math.min(finalPrev.open, finalPrev.close);
                const _ceLvl = (_nbH + 25).toFixed(0);
                const _peLvl = (_nbL - 25).toFixed(0);
                const _ceD = price - (_nbH + 25);
                const _peD = (_nbL - 25) - price;
                trailCtx =
                    `\u{1F441} *TRAIL*  \\u00B7  Watching\\n` +
                        `\u{1F4C8} CE \u2265 *${_ceLvl}*  \u2014  ${_ceD >= 0 ? Math.abs(_ceD).toFixed(0) + " pts ahead" : Math.abs(_ceD).toFixed(0) + " pts away"}\\n` +
                        `\u{1F4C9} PE \u2264 *${_peLvl}*  \u2014  ${_peD >= 0 ? Math.abs(_peD).toFixed(0) + " pts ahead" : Math.abs(_peD).toFixed(0) + " pts away"}\\n` +
                        `\u{1F4CA} *${_shSign}${shadowPnL.toFixed(0)} pts*  \\u00B7  T:${shadowTrades}/5`;
            }
            // Append per-trade rows to TRAIL context (same format as TICK TRAIL)
            if (trailCtx && shadowTradeLog.length > 0) {
                const _shRows = shadowTradeLog.slice(-9).map((t, i) => {
                    if (t.pts !== null && t.pts !== undefined) {
                        const _s = t.pts >= 0 ? "+" : "";
                        return `T${i + 1}: ${t.dir} \\u2192 ${_s}${t.pts} pts`;
                    } else if (_shInTrade && t.entryMs === shadowTradeLog[shadowTradeLog.length - 1].entryMs) {
                        const _u2 = _shDir === "CE" ? price - (t.entry || 0) : (t.entry || 0) - price;
                        const _us2 = _u2 >= 0 ? "+" : "";
                        return `T${i + 1}: ${t.dir} \\u2192 open (${_us2}${_u2.toFixed(0)} pts)`;
                    } else {
                        return `T${i + 1}: ${t.dir} \\u2192 (not logged)`;
                    }
                });
                const _shUnr = _shInTrade ? (_shDir === "CE" ? price - _shEntry : _shEntry - price) : 0;
                const _shTotal = shadowPnL + _shUnr;
                trailCtx += "\\n" + _shRows.join("\\n") + "\\n\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500" +
                    `\\nTotal: ${_shTotal >= 0 ? "+" : ""}${_shTotal.toFixed(0)} pts`;
            }"""

# ─── Replace LOCK50 Old shadow context block ───────────────────────────────────
OLD_L50O = """            // Build LOCK50 Old shadow context (always visible)
            const _l50oSign = scalp1PnL >= 0 ? "+" : "";
            let lock50OldCtx = "";
            if (lock50ShadowState.inTrade && lock50ShadowState.dir) {
                const _l50oU = lock50ShadowState.dir === "CE" ? price - (lock50ShadowState.entry||0) : (lock50ShadowState.entry||0) - price;
                const _l50oUS = _l50oU >= 0 ? "+" : "";
                const _l50oSL = lock50ShadowState.sl || 0;
                lock50OldCtx = `\u{1F512} *LOCK50 Old*  \\u00B7  ${lock50ShadowState.dir} In Trade\\n` +
                    `${_l50oU >= 0 ? "\u{1F7E2}" : "\u{1F534}"} *${_l50oUS}${_l50oU.toFixed(0)} pts gathered* \\u00B7 SL: ${_l50oSL > 0 ? _l50oSL.toFixed(0) : "\\u2014"}\\n` +
                    `Entry: ${(lock50ShadowState.entry||0).toFixed(0)}  \\u00B7  ${scalp1Wins}W ${scalp1Losses}L  \\u00B7  T:${scalp1Trades}\\n` +
                    `\u{1F4CA} *${_l50oSign}${scalp1PnL.toFixed(0)} pts*`;
            } else if (scalp1TradeLog.length > 0) {
                const _l50oRows = scalp1TradeLog.slice(-6).map((t, i) => {
                    const _s = t.pts >= 0 ? "+" : "";
                    return `T${i + 1}: ${t.dir} \\u2192 ${_s}${t.pts} pts`;
                });
                lock50OldCtx = `\u{1F512} *LOCK50 Old*  \\u00B7  ${scalp1Wins}W ${scalp1Losses}L\\n` +
                    _l50oRows.join("\\n") + "\\n" +
                    `\u{1F4CA} *${_l50oSign}${scalp1PnL.toFixed(0)} pts*`;
            } else {
                const _l50oH = Math.max(finalPrev.open, finalPrev.close);
                const _l50oL = Math.min(finalPrev.open, finalPrev.close);
                const _l50oCE = (_l50oH + 25).toFixed(0);
                const _l50oPE = (_l50oL - 25).toFixed(0);
                lock50OldCtx = `\u{1F512} *LOCK50 Old*  \\u00B7  Watching\\n` +
                    `\u{1F4F9} CE \u2265 *${_l50oCE}*  \\u00B7  \u{1F4F2} PE \u2264 *${_l50oPE}*\\n` +
                    `\u{1F4CA} *${_l50oSign}${scalp1PnL.toFixed(0)} pts*`;
            }"""

NEW_L50O = """            // Build LOCK50 Old shadow context (always visible)
            const _l50oSign = scalp1PnL >= 0 ? "+" : "";
            let lock50OldCtx = "";
            if (lock50ShadowState.inTrade && lock50ShadowState.dir) {
                const _l50oU = lock50ShadowState.dir === "CE" ? price - (lock50ShadowState.entry||0) : (lock50ShadowState.entry||0) - price;
                const _l50oUS = _l50oU >= 0 ? "+" : "";
                const _l50oSL = lock50ShadowState.sl || 0;
                lock50OldCtx = `\u{1F512} *LOCK50 Old*  \\u00B7  ${lock50ShadowState.dir} In Trade\\n` +
                    `${_l50oU >= 0 ? "\u{1F7E2}" : "\u{1F534}"} *${_l50oUS}${_l50oU.toFixed(0)} pts gathered* \\u00B7 SL: ${_l50oSL > 0 ? _l50oSL.toFixed(0) : "\\u2014"}\\n` +
                    `Entry: ${(lock50ShadowState.entry||0).toFixed(0)}  \\u00B7  ${scalp1Wins}W ${scalp1Losses}L  \\u00B7  T:${scalp1Trades}\\n` +
                    `\u{1F4CA} *${_l50oSign}${scalp1PnL.toFixed(0)} pts*`;
            } else if (scalp1TradeLog.length > 0) {
                const _l50oH2 = Math.max(finalPrev.open, finalPrev.close);
                const _l50oL2 = Math.min(finalPrev.open, finalPrev.close);
                const _l50oCE2 = (_l50oH2 + 25).toFixed(0);
                const _l50oPE2 = (_l50oL2 - 25).toFixed(0);
                lock50OldCtx = `\u{1F512} *LOCK50 Old*  \\u00B7  Watching\\n` +
                    `\u{1F4C8} CE \u2265 *${_l50oCE2}*  \\u2014  \u{1F4C9} PE \u2264 *${_l50oPE2}*\\n` +
                    `\u{1F4CA} *${_l50oSign}${scalp1PnL.toFixed(0)} pts*  \\u00B7  ${scalp1Wins}W ${scalp1Losses}L  \\u00B7  T:${scalp1Trades}`;
            } else {
                const _l50oH = Math.max(finalPrev.open, finalPrev.close);
                const _l50oL = Math.min(finalPrev.open, finalPrev.close);
                const _l50oCE = (_l50oH + 25).toFixed(0);
                const _l50oPE = (_l50oL - 25).toFixed(0);
                lock50OldCtx = `\u{1F512} *LOCK50 Old*  \\u00B7  Watching\\n` +
                    `\u{1F4C8} CE \u2265 *${_l50oCE}*  \\u2014  \u{1F4C9} PE \u2264 *${_l50oPE}*\\n` +
                    `\u{1F4CA} *${_l50oSign}${scalp1PnL.toFixed(0)} pts*`;
            }
            // Append per-trade rows to LOCK50 Old context (same format as TICK TRAIL)
            if (scalp1TradeLog.length > 0) {
                const _l50Rows = scalp1TradeLog.slice(-9).map((t, i) => {
                    if (t.pts !== null && t.pts !== undefined) {
                        const _s = t.pts >= 0 ? "+" : "";
                        return `T${i + 1}: ${t.dir} \\u2192 ${_s}${t.pts} pts`;
                    } else if (lock50ShadowState.inTrade && t.entryMs === scalp1TradeLog[scalp1TradeLog.length - 1].entryMs) {
                        const _u3 = lock50ShadowState.dir === "CE" ? price - (lock50ShadowState.entry||0) : (lock50ShadowState.entry||0) - price;
                        const _us3 = _u3 >= 0 ? "+" : "";
                        return `T${i + 1}: ${t.dir} \\u2192 open (${_us3}${_u3.toFixed(0)} pts)`;
                    } else {
                        return `T${i + 1}: ${t.dir} \\u2192 (not logged)`;
                    }
                });
                const _l50Unr = lock50ShadowState.inTrade ? (lock50ShadowState.dir === "CE" ? price - (lock50ShadowState.entry||0) : (lock50ShadowState.entry||0) - price) : 0;
                const _l50Total = scalp1PnL + _l50Unr;
                lock50OldCtx += "\\n" + _l50Rows.join("\\n") + "\\n\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500" +
                    `\\nTotal: ${_l50Total >= 0 ? "+" : ""}${_l50Total.toFixed(0)} pts`;
            }"""

# Apply replacements using raw byte matching to avoid unicode escape issues
import re

def do_replace(content, old, new, label):
    # Normalize: collapse whitespace differences won't work since we need exact match
    # Just try direct match
    if old in content:
        result = content.replace(old, new, 1)
        print(f"OK: {label}")
        return result
    else:
        print(f"WARN: {label} not matched — trying line-by-line key search")
        # Find a unique key line from the old block
        return content

# Since the file has actual unicode chars (not escape sequences), 
# we need to match the actual bytes as they appear
# Let's do a simpler targeted replacement using unique identifiers

# Instead of full block replacement, insert after the closing } of each block
# Strategy: find unique anchor lines and insert after

lines = src.split('\n')
out = []
i = 0
trail_done = False
l50o_done = False

while i < len(lines):
    line = lines[i]
    out.append(line)

    # After TRAIL context block ends — detect the blank line after the closing }
    # The TRAIL block ends just before "// Build LOCK50 Old shadow context"
    if not trail_done and '// Build LOCK50 Old shadow context (always visible)' in line:
        # Insert TRAIL trade rows block BEFORE this line (pop last, insert, re-add)
        out.pop()  # remove the LOCK50 comment line we just added
        out.append("""            // Append per-trade rows to TRAIL context (same format as TICK TRAIL)
            if (trailCtx && shadowTradeLog.length > 0) {
                const _shRows = shadowTradeLog.slice(-9).map((t, i2) => {
                    if (t.pts !== null && t.pts !== undefined) {
                        const _s = t.pts >= 0 ? "+" : "";
                        return `T${i2 + 1}: ${t.dir} \\u2192 ${_s}${t.pts} pts`;
                    } else if (_shInTrade && t.entryMs === shadowTradeLog[shadowTradeLog.length - 1].entryMs) {
                        const _u2 = _shDir === "CE" ? price - (t.entry || 0) : (t.entry || 0) - price;
                        const _us2 = _u2 >= 0 ? "+" : "";
                        return `T${i2 + 1}: ${t.dir} \\u2192 open (${_us2}${_u2.toFixed(0)} pts)`;
                    } else {
                        return `T${i2 + 1}: ${t.dir} \\u2192 (not logged)`;
                    }
                });
                const _shUnr = _shInTrade ? (_shDir === "CE" ? price - _shEntry : _shEntry - price) : 0;
                const _shTotal = shadowPnL + _shUnr;
                trailCtx += "\\n" + _shRows.join("\\n") + "\\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500" +
                    `\\nTotal: ${_shTotal >= 0 ? "+" : ""}${_shTotal.toFixed(0)} pts`;
            }""")
        out.append(line)  # re-add the LOCK50 comment line
        trail_done = True

    # After LOCK50 Old context block ends — detect "// Build LOCK50 per-trade log"
    if not l50o_done and '// Build LOCK50 per-trade log' in line:
        out.pop()  # remove the anchor line
        out.append("""            // Append per-trade rows to LOCK50 Old context (same format as TICK TRAIL)
            if (scalp1TradeLog.length > 0) {
                const _l50Rows = scalp1TradeLog.slice(-9).map((t, i3) => {
                    if (t.pts !== null && t.pts !== undefined) {
                        const _s = t.pts >= 0 ? "+" : "";
                        return `T${i3 + 1}: ${t.dir} \\u2192 ${_s}${t.pts} pts`;
                    } else if (lock50ShadowState.inTrade && t.entryMs === scalp1TradeLog[scalp1TradeLog.length - 1].entryMs) {
                        const _u3 = lock50ShadowState.dir === "CE" ? price - (lock50ShadowState.entry||0) : (lock50ShadowState.entry||0) - price;
                        const _us3 = _u3 >= 0 ? "+" : "";
                        return `T${i3 + 1}: ${t.dir} \\u2192 open (${_us3}${_u3.toFixed(0)} pts)`;
                    } else {
                        return `T${i3 + 1}: ${t.dir} \\u2192 (not logged)`;
                    }
                });
                const _l50Unr = lock50ShadowState.inTrade ? (lock50ShadowState.dir === "CE" ? price - (lock50ShadowState.entry||0) : (lock50ShadowState.entry||0) - price) : 0;
                const _l50Total = scalp1PnL + _l50Unr;
                lock50OldCtx += "\\n" + _l50Rows.join("\\n") + "\\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500" +
                    `\\nTotal: ${_l50Total >= 0 ? "+" : ""}${_l50Total.toFixed(0)} pts`;
            }""")
        out.append(line)  # re-add anchor line
        l50o_done = True

    i += 1

print(f"TRAIL rows inserted: {trail_done}")
print(f"LOCK50 rows inserted: {l50o_done}")

if trail_done and l50o_done:
    open(FILE, 'w', encoding='utf-8').write('\n'.join(out))
    print("DONE — file written")
else:
    print("ERROR — one or more anchors not found, file NOT modified")
