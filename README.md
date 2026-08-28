# ETF Trading Lab

Paper-only ETF strategy laboratory for two identical entry sleeves with 8% and 12% profit targets.

## Frozen entry rule

- At most one ETF selection per NSE market session, evaluated around 3:15 PM IST.
- Current-session change must be `<= -1%`.
- Previous-close 30-session return must be `<= -2.5%`.
- If several qualify, select the **most negative 30-session return**, then most negative daily return, then highest volume.
- Volume must exceed 500,000.
- Do not select the same ETF category on consecutive NSE market sessions.
- One verified market-day deposit of ₹30,000. A qualifying selection is split into ETF-8 and ETF-12 sleeves (₹15,000 each); only whole units are recorded and residual cash remains cash.
- Targets are eligible from the next market session. There is no stop-loss or forced exit.

This repository never submits broker orders. Groww is used only for market data.

## Local verification

```bash
npm test
npm run state
```

Broker-data workflows will require repository secrets `GROWW_TOTP_TOKEN` and `GROWW_TOTP_SECRET`. An optional short-lived `GROWW_ACCESS_TOKEN` can be used for manual recovery.

## ETF-8-FLOOR research

This isolated two-year backtest, with a separate recent-three-month view, funds ₹15,000 per market session. A lot is not sold when it first reaches +8%; that price becomes a fixed floor from the next session. The lot exits only if a later session falls back to that floor. Unsold lots are marked to the final close for account value and XIRR.
