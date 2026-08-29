# ETF Trading Lab

Archived NSE ETF strategy laboratory. The strategy was rejected after comparison with the user's diversified mutual-fund plan. All trading automation is disabled; the repository, ledger and dashboard remain as read-only research history.

- Dashboard: https://etf-paper-trading.imvishalmittal.chatgpt.site
- Research history: [ANALYSIS.md](ANALYSIS.md)
- Mode: **RESEARCH_REJECTED** — no purchases, sales or broker orders are submitted

## Retired paper strategies

The following sleeves were tested and are retained only as historical definitions:

| Sleeve | Exit |
|---|---|
| ETF-8-FLOOR | Arm a fixed +8% floor; sell only if a later session falls back to it |
| ETF-15-FLOOR | Arm a fixed +15% floor; sell only if a later session falls back to it |

No new deposits, purchases, valuations or exits are recorded.

## Frozen entry rule

The decision runs around 15:15 IST on NSE market days:

1. Current-session return must be at most −1%.
2. Return from the close 30 sessions earlier to the immediately previous close must be at most −2.5%.
3. Daily volume must exceed 500,000 units.
4. Rank by most negative 30-session return, then most negative daily return, then highest volume.
5. Select at most one ETF per market session.
6. Do not select the same ETF category on consecutive market sessions.

## Automation

| Workflow | Schedule | Purpose |
|---|---|---|
| Paper ETF purchase | **Disabled** | Archived notice only; cannot purchase or write the ledger |
| Paper ETF floor check | **Disabled** | Archived notice only; cannot sell or write the ledger |
| CI | Pull requests and pushes | Run deterministic tests |
| Compare ETF fixed floors | Research request/manual | Replay frozen purchases through 8/10/12/15/20% floors |
| Backtest ETF floors 5Y | Research request/manual | Regenerate five years of entries and compare floors |

GitHub schedules may start late during platform congestion. Ledger writes are serialized to prevent conflicts.

## Data and dashboard

- Groww supplies paper-workflow market data only.
- Official NSE security bhavdata supplies research OHLC and volume.
- `data/ledger.json` is the paper ledger.
- `public/state.json` is the sanitized dashboard feed.
- The dashboard presents paper deposits, positions, trades, cash, demat value and XIRR.
- The dashboard feed includes each lot's floor state, peak return and drawdown from peak.

The dashboard reads `https://raw.githubusercontent.com/imvishalmittal/etf-trading-lab/main/public/state.json`.

## Fixed-floor research rule

For an X% floor:

1. Buy a ₹15,000 whole-unit lot.
2. Do not sell when the ETF first reaches +X%.
3. Arm the original +X% price as a fixed floor.
4. The floor becomes eligible only from a later market session.
5. Sell at the floor when a later session returns to it.
6. If that session opens below the floor, use the lower opening price.
7. The floor never trails upward.
8. Unsold positions are marked to the final close.

The five-year study did not demonstrate an advantage over the diversified mutual-fund plan sufficient to justify its complexity. Both sleeves were retired on 29 August 2026.

## Repository map

| Path | Purpose |
|---|---|
| `config/strategy.json` | Active paper configuration |
| `src/selection.mjs` | Qualification, ranking and category exclusion |
| `src/ledger.mjs` | Deposits, purchases and sales |
| `src/floor-backtest.mjs` | Focused fixed-floor engine |
| `scripts/run-purchase.mjs` | Scheduled paper purchase decision |
| `scripts/run-sell.mjs` | Scheduled target check |
| `scripts/run-floor-replay-nse.mjs` | Frozen-entry 24-month floor comparison |
| `scripts/run-floor-5y-nse.mjs` | Reconstructed five-year comparison |
| `research/frozen-entries-*.csv` | Published simulated entries from the original workbook |
| `research/etf-universe-2021.csv` | March 2021 universe seed |
| `requests/` | Auditable research triggers |

## Local verification

```bash
npm test
npm run state
```

Paper workflows require `GROWW_TOTP_TOKEN`, `GROWW_TOTP_SECRET`, and optionally `GROWW_ACCESS_TOKEN` for recovery. Never commit broker credentials, account identifiers or real transactions.

## Research status

| Strategy | Status |
|---|---|
| 8% fixed floor | **Research rejected; automation disabled** |
| 15% fixed floor | **Research rejected; automation disabled** |
| Immediate 8%/12% targets | Retired from new paper purchases |
| 10%, 12%, 20% fixed floors | Not selected for separate paper sleeves |

No backtest result is permission or advice to trade real money.
