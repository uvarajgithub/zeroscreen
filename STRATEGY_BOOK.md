# BankNifty 15-Min Strategy Book
**Instrument:** BANKNIFTY (token 260105) · **Qty:** 30 (2 lots × 15) · **Rs/pt:** ₹15  
**Last updated:** May 2026

---

## Base Strategy: HYBRID_REVERSE (BEST baseline)
All trail variants below are built on top of this base. Do NOT change the base logic when comparing trail variants.

### Entry
- Wait for breakout candle: `close > prevHigh + 25` → **CE trade**
- Wait for breakout candle: `close < prevLow  - 25` → **PE trade**
- SL = entry ∓ 100pts

### C1 Filter (first-candle exit)
- On the very next candle after entry: if price hasn't moved in our favour (close moves back 3+pts), exit at −3pts
- Prevents full −100pt SL on bad entries

### Body-Past Reverse
- If SL is hit AND the close of that candle is past our SL level → immediately enter opposite direction
- Reuses the `reUsed` slot, sets `isC1 = true` for the new entry

### Recovery Trade
- After both the main trade + re-entry slot are used (reUsed=true, firstDone=true)
- Reset `firstDone = false` → allows one more recovery entry on the next breakout candle

### Constants
```
HR_ENTRY_BUF = 25 pts
HR_SL_PTS    = 100 pts
HR_EARLY_EXIT = 3 pts  (C1 filter)
dailyLossCap  = 350 pts
```

---

## Trail Variants (what changes between strategies)

### 1. TRAIL ← **LIVE NOW**
```typescript
let lock = 0;
if (peakProfit >= 200) lock = 100;
else if (peakProfit >= 100) lock = 20;
if (lock > 0) {
  sl = max(sl, entry + lock);  // CE
  sl = min(sl, entry - lock);  // PE
}
```
- Peak +100 → lock +20 (just above breakeven)
- Peak +200 → lock +100 (half secured)
- **Holds winner all the way to EOD** — never tightens beyond +100 lock
- Best for: capital protection, single-wave trending days

### 2. T_LOCK50
```typescript
if (peakProfit > 100) {
  lock = peakProfit - 50;
  sl = max(sl, entry + lock);  // CE
}
```
- Peak 150 → lock 100 | Peak 300 → lock 250 | Peak 500 → lock 450
- **Always keeps within 50pts of peak** — exits early on trending days
- Triggers re-entry after stop → catches multi-wave moves
- Best for: multi-wave trending months, maximum yearly P&L

### 3. T_TIGHT
```typescript
if (peakProfit >= 200) lock = 150;
else if (peakProfit >= 100) lock = 50;
else if (peakProfit >= 50) lock = 0; // BE
```
- Peak +50 → move to BE | Peak +100 → lock +50 | Peak +200 → lock +150
- Very aggressive — exits quickly, many re-entries
- Best for: fast volatile markets

### 4. T_RATCHET
```typescript
if (peakProfit >= 300) lock = 250;
else if (peakProfit >= 200) lock = 150;
else if (peakProfit >= 100) lock = 50;
```
- 50pt ratchet: each 100pt peak jump → SL moves up 100pts
- Balanced between TRAIL and TIGHT
- Best for: consistent trending markets

### 5. T_TARGET
```typescript
if (peakProfit >= 250) return EXIT;  // pure profit target
```
- Exit at +250pts, no trailing
- Predictable, misses runaway moves
- Best for: extremely consistent range-bound markets

---

## 5-Year Backtest Results (Jan 2021 – Apr 2026)
**Source:** `backtest-v3.ts` — authoritative comparison script  
**Note:** SL check happens FIRST, then trail update (not before). This is the correct order.

### Monthly P&L (₹)

| Month    | TRAIL    | TIGHT    | LOCK50   | RATCHET  | TARGET   | WINNER  |
|----------|----------|----------|----------|----------|----------|---------|
| 2021-01  | +65,224  | +60,027  | +78,928  | +62,437  | +39,443  | LOCK50  |
| 2021-02  | +55,161  | +63,477  | +81,188  | +65,656  | +89,384  | TARGET  |
| 2021-03  | +76,776  | +69,496  | +81,212  | +69,040  | +70,162  | LOCK50  |
| 2021-04  | +66,152  | +85,611  | +87,340  | +81,272  | +58,124  | LOCK50  |
| 2021-05  | +40,401  | +53,377  | +46,414  | +53,321  | +36,851  | TIGHT   |
| 2021-06  | +39,298  | +39,580  | +36,416  | +42,386  | +38,025  | RATCHET |
| 2021-07  | +20,237  | +23,789  | +25,352  | +26,789  | +15,718  | RATCHET |
| 2021-08  | +39,919  | +39,698  | +56,963  | +41,048  | +37,543  | LOCK50  |
| 2021-09  | +34,025  | +44,509  | +57,968  | +54,860  | +34,388  | LOCK50  |
| 2021-10  | +50,663  | +55,858  | +53,188  | +55,006  | +28,554  | TIGHT   |
| 2021-11  | +41,660  | +55,770  | +82,744  | +58,313  | +49,609  | LOCK50  |
| 2021-12  | +44,318  | +45,556  | +39,318  | +44,282  | +11,179  | TIGHT   |
| 2022-01  | +57,949  | +65,276  | +86,710  | +72,908  | +35,534  | LOCK50  |
| 2022-02  | +71,554  | +79,430  | +86,241  | +90,635  | +73,375  | RATCHET |
| 2022-03  | +69,328  | +66,993  | +70,286  | +65,611  | +48,659  | LOCK50  |
| 2022-04  | +51,844  | +58,012  | +77,457  | +55,866  | +45,316  | LOCK50  |
| 2022-05  | +50,523  | +39,296  | +46,948  | +39,296  | +47,395  | **TRAIL** |
| 2022-06  | +37,856  | +46,786  | +35,719  | +47,417  | +12,946  | RATCHET |
| 2022-07  | +38,154  | +42,425  | +58,322  | +44,630  | +39,638  | LOCK50  |
| 2022-08  | +37,103  | +38,421  | +53,475  | +39,876  | +16,294  | LOCK50  |
| 2022-09  | +49,529  | +54,920  | +57,970  | +61,823  | +57,954  | RATCHET |
| 2022-10  | +31,058  | +32,476  | +28,231  | +35,503  | +25,648  | RATCHET |
| 2022-11  | +17,331  | +27,005  | +13,621  | +27,005  | +6,105   | TIGHT   |
| 2022-12  | +31,329  | +33,809  | +29,461  | +35,264  | +13,642  | RATCHET |
| 2023-01  | +47,643  | +54,053  | +67,777  | +59,963  | +48,454  | LOCK50  |
| 2023-02  | +54,920  | +56,359  | +31,906  | +45,123  | +27,571  | TIGHT   |
| 2023-03  | +47,094  | +43,806  | +30,931  | +40,664  | +36,565  | **TRAIL** |
| 2023-04  | +11,714  | +13,989  | +14,297  | +12,520  | +14,182  | LOCK50  |
| 2023-05  | +33,912  | +40,709  | +41,945  | +40,709  | +26,567  | LOCK50  |
| 2023-06  | +27,413  | +21,789  | +4,860   | +21,789  | +12,877  | **TRAIL** |
| 2023-07  | +30,047  | +38,469  | +22,741  | +36,080  | +1,622   | TIGHT   |
| 2023-08  | +27,490  | +31,281  | +26,699  | +32,736  | +23,366  | RATCHET |
| 2023-09  | +35,222  | +35,633  | +39,096  | +37,227  | +26,072  | LOCK50  |
| 2023-10  | +26,546  | +23,562  | +32,282  | +23,006  | +25,893  | LOCK50  |
| 2023-11  | +14,330  | +11,665  | +17,315  | +12,940  | +16,063  | LOCK50  |
| 2023-12  | +46,407  | +39,129  | +48,704  | +38,608  | +32,215  | LOCK50  |
| 2024-01  | +73,375  | +77,686  | +74,233  | +73,450  | +55,381  | TIGHT   |
| 2024-02  | +59,766  | +62,117  | +68,851  | +60,403  | +45,662  | LOCK50  |
| 2024-03  | +14,840  | +24,459  | +26,620  | +26,619  | +17,446  | LOCK50  |
| 2024-04  | +45,900  | +48,700  | +20,773  | +40,037  | +18,311  | TIGHT   |
| 2024-05  | +63,927  | +61,104  | +75,999  | +66,264  | +52,478  | LOCK50  |
| 2024-06  | +53,967  | +66,163  | +74,128  | +56,794  | +64,900  | LOCK50  |
| 2024-07  | +21,089  | +34,320  | +70,651  | +38,358  | +33,443  | LOCK50  |
| 2024-08  | +35,099  | +36,569  | +42,349  | +40,934  | +22,852  | LOCK50  |
| 2024-09  | +33,623  | +42,776  | +37,262  | +35,600  | +33,720  | TIGHT   |
| 2024-10  | +54,446  | +51,887  | +38,335  | +52,448  | +31,219  | **TRAIL** |
| 2024-11  | +39,119  | +42,512  | +57,331  | +48,191  | +20,635  | LOCK50  |
| 2024-12  | +57,418  | +70,894  | +78,752  | +65,206  | +47,175  | LOCK50  |
| 2025-01  | +40,858  | +58,469  | +89,422  | +73,202  | +47,482  | LOCK50  |
| 2025-02  | +35,284  | +44,202  | +35,939  | +45,791  | +40,173  | RATCHET |
| 2025-03  | +30,157  | +35,693  | +35,285  | +35,693  | +3,481   | TIGHT   |
| 2025-04  | +38,800  | +47,967  | +46,948  | +47,807  | +66,561  | TARGET  |
| 2025-05  | +38,641  | +43,217  | +59,156  | +47,884  | +28,848  | LOCK50  |
| 2025-06  | +34,847  | +33,395  | +28,793  | +35,879  | +15,575  | RATCHET |
| 2025-07  | +30,763  | +35,135  | +25,178  | +38,756  | +36,359  | RATCHET |
| 2025-08  | +29,666  | +33,826  | +29,197  | +33,826  | +18,281  | TIGHT   |
| 2025-09  | +32,755  | +42,093  | +27,788  | +38,549  | +20,570  | TIGHT   |
| 2025-10  | +37,737  | +39,779  | +51,952  | +49,455  | +40,239  | LOCK50  |
| 2025-11  | +40,258  | +36,871  | +26,648  | +35,245  | +5,501   | **TRAIL** |
| 2025-12  | +28,395  | +33,740  | +40,502  | +32,311  | +26,007  | LOCK50  |
| 2026-01  | +30,871  | +37,850  | +47,740  | +46,752  | +36,035  | LOCK50  |
| 2026-02  | +38,063  | +42,401  | +61,796  | +39,123  | +47,335  | LOCK50  |
| 2026-03  | +77,077  | +72,687  | +1,22,200| +84,385  | +68,948  | LOCK50  |
| 2026-04  | +70,467  | +77,746  | +96,164  | +77,733  | +69,371  | LOCK50  |

### Yearly Summary (₹)

| Year | TRAIL      | TIGHT      | LOCK50     | RATCHET    | TARGET     | WINNER  |
|------|------------|------------|------------|------------|------------|---------|
| 2021 | +5,73,833  | +6,36,747  | +7,27,031  | +6,54,413  | +5,08,978  | LOCK50  |
| 2022 | +5,43,557  | +5,84,847  | +6,44,440  | +6,15,833  | +4,22,505  | LOCK50  |
| 2023 | +4,02,738  | +4,10,444  | +3,78,553  | +4,01,366  | +2,91,448  | TIGHT   |
| 2024 | +5,52,569  | +6,19,187  | +6,65,285  | +6,04,304  | +4,43,220  | LOCK50  |
| 2025 | +4,18,159  | +4,84,387  | +4,96,808  | +5,14,397  | +3,42,114  | RATCHET |
| 2026 | +2,16,477  | +2,30,684  | +3,27,901  | +2,47,994  | +2,21,687  | LOCK50  |
| **5-YR** | **+27,07,333** | **+29,66,294** | **+32,40,017** | **+30,38,306** | **+22,29,953** | **LOCK50** |

### Win Count
| | TRAIL | TIGHT | LOCK50 | RATCHET | TARGET |
|---|---|---|---|---|---|
| Months best | 5 | 12 | 34 | 11 | 2 |
| Years best  | 0 | 1  | 4  | 1  | 0 |

---

## Strategy Comparison Summary

| Criteria | Winner | Notes |
|---|---|---|
| 5-year total profit | **LOCK50** ₹32.4L | Beats TRAIL by ₹5.3L |
| Capital protection / min drawdown | **TRAIL** | Max daily loss ~₹180 on choppy days |
| Choppy day loss | **TRAIL** −₹135 | LOCK50 can hit −₹1,500+ on same day |
| Multi-wave trending months | **LOCK50** | 2× TRAIL on big months (Jan 25, Jul 24) |
| Single-wave trending days | **TRAIL** | Holds EOD, LOCK50 exits early |
| Commissions (60 months) | **TRAIL** ~₹1.44L | LOCK50 ~₹2.52L (+₹1.08L more) |
| After commission 5yr | LOCK50 ₹29.88L | TRAIL ₹25.63L |
| Consistent across years | **LOCK50** 4/6 yrs | TRAIL 0/6 yrs best |
| Negative months | **Both 0** | Neither had a losing month |

---

## Recent Performance (May 2026)

| Day | TRAIL | LOCK50 |
|---|---|---|
| May 4 | **+₹6,771** | +₹3,754 |
| May 5 | **−₹135** | −₹1,635 |
| May 6 | **+₹19,075** | +₹12,758 |
| May 7 (partial) | −₹90 | −₹90 |
| **4-day total** | **+₹25,621** | **+₹14,787** |

May 4–6 were single-wave trending days → TRAIL outperformed significantly.

---

## Backtest Scripts Reference (on VPS `/home/ubuntu/trading-bot/`)

| Script | Purpose |
|---|---|
| `backtest-v3.ts` | **Authoritative** — all 5 trail variants, full 5yr monthly table |
| `backtest-recovery.ts` | OLD vs FIXED vs BEST 3-way comparison |
| `day-replay.ts` | Single day trade-by-trade replay — `--date YYYY-MM-DD` |

### Run commands
```bash
# Full 5-year comparison
npx ts-node backtest-v3.ts

# Specific date range
npx ts-node backtest-v3.ts --from 2026-01-01 --to 2026-04-30

# Day replay (trade by trade)
npx ts-node day-replay.ts --date 2026-05-06
```

---

## Deploy Commands (from local Windows)
```powershell
# Upload file
.\pscp.exe -pw "Uvi@janya123Jas" <file> root@139.59.18.52:/home/ubuntu/trading-bot/src/<file>

# Build + restart
.\plink.exe -batch -pw "Uvi@janya123Jas" root@139.59.18.52 "cd /home/ubuntu/trading-bot && npx tsc && pm2 restart trading-bot --update-env"

# Check logs
.\plink.exe -batch -pw "Uvi@janya123Jas" root@139.59.18.52 "pm2 logs trading-bot --lines 50 --nostream"
```
