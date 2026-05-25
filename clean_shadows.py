#!/usr/bin/env python3
"""Remove shadow (LOCK50, TRAIL, SCALP1) strategies from index.ts — keep only BHAV V3."""

with open('/home/ubuntu/trading-bot/src/index.ts', 'r', encoding='utf-8', errors='replace') as f:
    lines = f.readlines()

content = "".join(lines)

import re

# ── 1. Rename lock50Wins/lock50Losses → bhavWins/bhavLosses ──────────────────
content = content.replace('lock50Wins', 'bhavWins')
content = content.replace('lock50Losses', 'bhavLosses')
print("[1] Renamed lock50Wins/Losses → bhavWins/bhavLosses")

# ── 2. Remove lock50TradeLog variable declaration and uses ───────────────────
content = re.sub(r'let lock50TradeLog: any\[\] = \[\];\n', '', content)
content = re.sub(r'\s*lock50TradeLog: lock50TradeLog\.slice\(-20\),\n', '\n', content)
content = re.sub(r'\s*if \(s\.lock50TradeLog\) lock50TradeLog = s\.lock50TradeLog;\n', '', content)
content = re.sub(r'\s*lock50TradeLog = \[\];\n', '', content)
print("[2] Removed lock50TradeLog")

# ── 3. Remove SHADOW LOCK50 variable block ───────────────────────────────────
shadow_vars = r"""// [─\-]+ SHADOW LOCK50 [─\-]+ runs in parallel, paper-only, no real orders [─\-]+\nlet shadowState:.*?= createHybridState\(\);\n"""
content = re.sub(shadow_vars, '', content)
content = re.sub(r'let shadowPrevCandle: Candle \| null\s+=\s+null;\n', '', content)
content = re.sub(r'let shadowPnL\s+=\s+0;\n', '', content)
content = re.sub(r'let shadowTrades\s+=\s+0;\n', '', content)
content = re.sub(r'let shadowWins\s+=\s+0;\n', '', content)
content = re.sub(r'let shadowLosses\s+=\s+0;\n', '', content)
content = re.sub(r'let shadowTradeLog: any\[\]\s+=\s+\[\];\n', '', content)
print("[3] Removed shadow state variables")

# ── 4. Remove SCALP1 variable block ─────────────────────────────────────────
content = re.sub(r'// [─\-]+ SCALP1 shadow.*?\n', '', content)
content = re.sub(r'let scalp1PnL\s+=\s+0;\n', '', content)
content = re.sub(r'let scalp1Trades\s+=\s+0;\n', '', content)
content = re.sub(r'let scalp1Wins\s+=\s+0;\n', '', content)
content = re.sub(r'let scalp1Losses\s+=\s+0;\n', '', content)
content = re.sub(r'let scalp1TradeLog: any\[\]\s+=\s+\[\];\n', '', content)
content = re.sub(r'let scalp1InTrade\s+=\s+false;\n', '', content)
content = re.sub(r'let scalp1Dir: "CE" \| "PE" \| null\s+=\s+null;\n', '', content)
content = re.sub(r'let scalp1Entry\s+=\s+0;\n', '', content)
content = re.sub(r'let scalp1SL\s+=\s+0;\n', '', content)
content = re.sub(r'let scalp1Target\s+=\s+0;\n', '', content)
content = re.sub(r'let scalp1WaitSignal\s+=\s+false;.*?\n', '', content)
content = re.sub(r'let scalp1SignalDir: "CE" \| "PE" \| null\s+=\s+null;\n', '', content)
content = re.sub(r'let scalp1WaitExpiry\s+=\s+0;.*?\n', '', content)
content = re.sub(r'let scalp1Last1mKey\s+=\s+"";.*?\n', '', content)
print("[4] Removed SCALP1 state variables")

# ── 5. Remove Shadow save-state fields ───────────────────────────────────────
content = re.sub(r'\s*// Shadow \(TRAIL\) state\n\s*shadowPnL,\n\s*shadowTrades,\n\s*shadowWins,\n\s*shadowLosses,\n\s*shadowTradeLog: shadowTradeLog\.slice\(-20\),\n', '\n', content)
content = re.sub(r'\s*// SCALP1 shadow state\n\s*scalp1PnL,\n\s*scalp1Trades,\n\s*scalp1Wins,\n\s*scalp1Losses,\n\s*scalp1TradeLog: scalp1TradeLog\.slice\(-20\),\n', '\n', content)
print("[5] Removed shadow/scalp1 from save state")

# ── 6. Remove Shadow restore-state blocks ────────────────────────────────────
content = re.sub(r'\s*// Restore shadow \(TRAIL\) state\n\s*shadowPnL.*?\n\s*shadowTrades.*?\n\s*shadowWins.*?\n\s*shadowLosses.*?\n\s*if \(s\.shadowTradeLog\) shadowTradeLog = s\.shadowTradeLog;\n', '\n', content)
content = re.sub(r'\s*// Restore SCALP1 shadow state\n\s*scalp1PnL.*?\n\s*scalp1Trades.*?\n\s*scalp1Wins.*?\n\s*scalp1Losses.*?\n\s*if \(s\.scalp1TradeLog\) scalp1TradeLog = s\.scalp1TradeLog;\n', '\n', content)
print("[6] Removed shadow/scalp1 from restore state")

# ── 7. Remove Shadow daily-reset block ───────────────────────────────────────
content = re.sub(r'\s*// Reset shadow LOCK50 state\n\s*shadowState\s*=.*?\n\s*shadowPrevCandle\s*=.*?\n\s*shadowPnL\s*=.*?\n\s*shadowTrades\s*=.*?\n\s*shadowWins\s*=.*?\n\s*shadowLosses\s*=.*?\n\s*shadowTradeLog\s*=.*?\n', '\n', content)
content = re.sub(r'\s*// Reset SCALP1 shadow state\n\s*scalp1PnL\s*=.*?\n\s*scalp1Trades\s*=.*?\n\s*scalp1Wins\s*=.*?\n\s*scalp1Losses\s*=.*?\n\s*scalp1TradeLog\s*=.*?\n\s*scalp1InTrade\s*=.*?\n\s*scalp1Dir\s*=.*?\n\s*scalp1Entry\s*=.*?\n\s*scalp1SL\s*=.*?\n\s*scalp1Target\s*=.*?\n\s*scalp1WaitSignal\s*=.*?\n\s*scalp1SignalDir\s*=.*?\n\s*scalp1WaitExpiry\s*=.*?\n\s*scalp1Last1mKey\s*=.*?\n', '\n', content)
print("[7] Removed shadow/scalp1 from daily reset")

# ── 8. Remove TRAIL Telegram context block (Build TRAIL shadow context) ───────
# This block is between "// Build TRAIL shadow context for Telegram" and "// Build SCALP1 per-trade log"
trail_block = re.compile(
    r'      // Build TRAIL shadow context for Telegram\n.*?(?=      // Build SCALP1 per-trade log)',
    re.DOTALL
)
content = trail_block.sub('', content)
print("[8] Removed TRAIL telegram context block")

# ── 9. Remove SCALP1 telegram log block ──────────────────────────────────────
scalp1_block = re.compile(
    r'      // Build SCALP1 per-trade log\n.*?(?=      // Build LOCK50 per-trade log)',
    re.DOTALL
)
content = scalp1_block.sub('', content)
print("[9] Removed SCALP1 telegram log block")

# ── 10. Remove LOCK50 telegram log block (only used for HYBRID_REVERSE) ──────
lock50_block = re.compile(
    r'      // Build LOCK50 per-trade log\n.*?(?=      await sendTelegram\()',
    re.DOTALL
)
content = lock50_block.sub('', content)
print("[10] Removed LOCK50 telegram log block")

# ── 11. Remove trailCtx and scalp1LogStr from sendTelegram call ──────────────
# Remove: lock50LogStr +
content = re.sub(r'\s*lock50LogStr \+\n', '\n', content)
# Remove: (ACTIVE_STRATEGY !== "BHAV_V3" && trailCtx ? `\n━━...` : "") +
content = re.sub(r'\s*\(ACTIVE_STRATEGY !== "BHAV_V3" && trailCtx \? `\\n[^`]+` : ""\) \+\n', '\n', content)
# Remove: (scalp1LogStr ? `\n━━...SCALP1...` : "") +
content = re.sub(r'\s*\(scalp1LogStr \? `\\n[^`]*SCALP1[^`]*` : ""\) \+\n', '\n', content)
print("[11] Removed trailCtx/scalp1LogStr/lock50LogStr from sendTelegram")

# ── 12. Remove shadow/scalp1 from heartbeat JSON ─────────────────────────────
content = re.sub(r'\s*shadowPnL: parseFloat\(shadowPnL\.toFixed\(0\)\),\n', '', content)
content = re.sub(r'\s*shadowTrades,\n', '', content)
content = re.sub(r'\s*shadowInTrade: shadowState\.inTrade,\n', '', content)
content = re.sub(r'\s*shadowDir: shadowState\.dir \|\| null,\n', '', content)
content = re.sub(r'\s*shadowEntry: shadowState\.inTrade \? \(shadowState\.entry \|\| null\) : null,\n', '', content)
content = re.sub(r'\s*shadowSL: shadowState\.inTrade \? \(shadowState\.sl \|\| null\) : null,\n', '', content)
content = re.sub(r'\s*shadowWins,\n', '', content)
content = re.sub(r'\s*shadowLosses,\n', '', content)
content = re.sub(r'\s*shadowTradeLog: shadowTradeLog\.slice\(-10\),\n', '', content)
content = re.sub(r'\s*scalp1PnL: parseFloat\(scalp1PnL\.toFixed\(0\)\),\n', '', content)
content = re.sub(r'\s*scalp1Trades,\n', '', content)
content = re.sub(r'\s*scalp1Wins,\n', '', content)
content = re.sub(r'\s*scalp1Losses,\n', '', content)
content = re.sub(r'\s*scalp1InTrade,\n', '', content)
content = re.sub(r'\s*scalp1Dir: scalp1InTrade \? scalp1Dir : null,\n', '', content)
content = re.sub(r'\s*scalp1Entry: scalp1InTrade \? scalp1Entry : null,\n', '', content)
content = re.sub(r'\s*scalp1SL: scalp1InTrade \? scalp1SL : null,\n', '', content)
content = re.sub(r'\s*scalp1Target: scalp1InTrade \? scalp1Target : null,\n', '', content)
content = re.sub(r'\s*scalp1TradeLog: scalp1TradeLog\.slice\(-10\),\n', '', content)
print("[12] Removed shadow/scalp1 from heartbeat JSON")

# ── 13. Remove Shadow LOCK50 candle processing block ─────────────────────────
shadow_proc = re.compile(
    r'  // [─\-]+ Shadow LOCK50: same candle.*?shadowPrevCandle = currentCandle;\n\n',
    re.DOTALL
)
content = shadow_proc.sub('', content)
print("[13] Removed shadow LOCK50 processing block")

# ── 14. Remove SCALP1 entry and monitor blocks ───────────────────────────────
scalp1_proc = re.compile(
    r'  // [─\-]+ SCALP1: try to enter on confirming 1-min candle.*?scalp1Dir = null; scalp1Entry = 0; scalp1SL = 0; scalp1Target = 0;\n    \}\n  \}\n\n',
    re.DOTALL
)
content = scalp1_proc.sub('', content)
print("[14] Removed SCALP1 processing block")

# ── 15. runBhavBot daily reset: remove shadow/scalp1 resets (bhavWins/Losses keep) ──
content = re.sub(r'\s*shadowState\s*=\s*createHybridState\(\);\n', '\n', content)
content = re.sub(r'\s*shadowPrevCandle\s*=\s*null;\n', '', content)
# remove any leftover scalp1 resets in runBhavBot
for v in ['scalp1InTrade', 'scalp1Dir', 'scalp1Entry', 'scalp1SL', 'scalp1Target',
          'scalp1WaitSignal', 'scalp1SignalDir', 'scalp1WaitExpiry', 'scalp1Last1mKey']:
    content = re.sub(r'\s*' + v + r'\s*=.*?;\n', '\n', content)
print("[15] Removed leftover scalp1/shadow resets in runBhavBot")

with open('/home/ubuntu/trading-bot/src/index.ts', 'w', encoding='utf-8', errors='replace') as f:
    f.write(content)

print("\nDone! All shadow strategies removed.")
