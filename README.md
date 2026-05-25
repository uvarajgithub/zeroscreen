# ZeroScreen — Restore Points

## 🟢 RESTORE POINT 1 — Dashboard BHAV V3 Watch Card (May 25, 2026)

### What's in this restore point
- "Watching for Next Signal" card shows **BHAV V3 candle status** (PDH row + candle countdown + closed trades)
- Row design: colored `.watch-lvl-row` pills (red for PDH, amber for candle timer)
- Light-mode safe colors: PDH label=`#dc2626`, countdown=`#d97706`, spot=`var(--text-main)`
- Bot: BHAV_V3, PAPER mode, 30 qty, SL 150pts, max 5 trades/day

### Backup locations
| Where | Path |
|-------|------|
| VPS   | `/root/zeroscreen/dist/server.js.template-live-dashboard` (777KB) |
| Local | `C:\Users\LENOVO\zeroscreen\server_vps.js` |
| Git   | commit tag `restore-dashboard-bhav-v3-may25` |

### ✅ One-command restore (if dashboard breaks)
```powershell
.\plink.exe -batch -pw "Uvi@janya123Jas" root@139.59.18.52 "cp '/root/zeroscreen/dist/server.js.template-live-dashboard' /root/zeroscreen/dist/server.js && pm2 restart zeroscreen --update-env && echo restored"
```

---

## Infrastructure
- **VPS**: DigitalOcean Ubuntu `139.59.18.52` — ZeroScreen port 4000, PM2 id 8
- **Trading bot**: PM2 id 30 (`amina-100-variant-b`), path `/home/ubuntu/trading-bot/`
- **DB**: SQLite at `/root/zeroscreen/zeroscreen.db`

## ⚠️ Critical Rules
- **NEVER run `npx tsc` on ZeroScreen** — `src/server.ts` has different dashboard, will wipe the live design
- **Always patch `dist/server.js` directly** using Python scripts via pscp + plink
- Patching workflow: write `.py` locally → `pscp` to VPS → `plink python3 /root/script.py` → `pm2 restart zeroscreen`
- **NEVER** use `python3 -c "..."` through PowerShell — quote escaping breaks badly

## Deploy Commands
```powershell
# Upload file to VPS
.\pscp.exe -pw "Uvi@janya123Jas" <localfile> root@139.59.18.52:/path/on/vps

# Run command on VPS
.\plink.exe -batch -pw "Uvi@janya123Jas" root@139.59.18.52 "<command>"

# Restart ZeroScreen (NO npx tsc!)
.\plink.exe -batch -pw "Uvi@janya123Jas" root@139.59.18.52 "pm2 restart zeroscreen --update-env"

# Restart trading bot (tsc required here)
.\plink.exe -batch -pw "Uvi@janya123Jas" root@139.59.18.52 "cd /home/ubuntu/trading-bot && npx tsc && pm2 restart amina-100-variant-b --update-env"

# Check bot logs
.\plink.exe -batch -pw "Uvi@janya123Jas" root@139.59.18.52 "pm2 logs amina-100-variant-b --nostream --lines 20 2>&1"
```
