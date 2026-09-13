# NIFTYBEES short-term edge discovery evidence

## Verdict

- S1 three-session pullback: **DATA_BLOCKED**
- S2 volume-confirmed breakout: **DATA_BLOCKED**
- I1 intraday VWAP recovery: **DATA_BLOCKED**
- Validation: **SEALED**
- Holdout: **SEALED**
- Paper/live trading: **NOT AUTHORIZED**

The workflow completed and verified all artifact checksums. This is a data-quality verdict, not evidence that S1 is profitable. No candidate may advance because the rejected-session rate exceeded the frozen 2% gate.

## Provenance

- Authoritative discovery run: https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34762446008
- Source commit: `dca28b6c5f372900b3b7ae255513fa4497aeab48`
- Result artifact ID: `10319521801`
- Result artifact ZIP SHA-256: `cbcfd54c7e6ab22a6fe2825a61dfecf764f6ba16655a218aaf5ca989d713da47`
- Source-data run: https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34750393260
- Source-data artifact ID: `10315219201`
- Source-data ZIP SHA-256: `4c5c64a08206c341b1d3369cfa7240b5ec0ff08c623dfd54836ce10e47f67baa`
- NIFTY minute CSV SHA-256: `9f3258b116a54c7c4233f58851fccca793920b7c4419a35093b3c588153b7727`
- NIFTYBEES minute CSV SHA-256: `892fd2932377050e44aa500ddb9804aca15f9822cf1296f151d91ec8cc5425ec`

## Integrity result

- Period: 1 January 2020 through 31 December 2024
- NIFTYBEES bars: 463,635 unique one-minute bars
- Observed sessions: 1,243
- Duplicate timestamps: 0
- Out-of-order timestamps: 0
- Impossible OHLC bars: 0
- Missing 09:15 bars: 5 sessions
- Missing 15:29 bars: 8 sessions
- Cross-instrument opening-gap divergence above 3 percentage points: 187 sessions (15.04%)
- Frozen maximum rejected-session rate: 2%

The anomalous 09:15 NIFTYBEES prints directly affect S1/S2 entry prices and I1's decline-from-open calculation. Removing them after viewing results or silently substituting a later price would change the frozen strategies, so the correct conclusion is `DATA_BLOCKED`.

## Diagnostic results only

These figures were produced for troubleshooting but are not valid discovery evidence because coverage failed.

| Candidate | Trades | Wins / losses | Normal net P&L | Profit factor | 5-bps net P&L | 10-bps net P&L | Max drawdown |
|---|---:|---:|---:|---:|---:|---:|---:|
| S1 | 5 | 3 / 2 | ₹267.94 | 1.198 | ₹148.03 | −₹51.83 | ₹1,060.99 |
| S2 | 10 | 3 / 7 | −₹2,953.28 | 0.451 | −₹3,191.87 | −₹3,589.51 | ₹2,953.28 |
| I1 | 134 | 28 / 106 | −₹8,351.00 | 0.157 | −₹11,559.01 | −₹16,905.69 | ₹8,374.04 |

S1 also had too few trades and failed the severe-stress, bootstrap, and concentration gates. S2 and I1 were economically negative even in the diagnostic run. None should be deployed.

## Concrete continuation

1. For S1/S2, acquire licensed adjusted NIFTYBEES daily OHLCV or validated exchange-quality opening data; these swing candidates do not require every minute.
2. For any new intraday candidate, predeclare an execution window based on a liquid post-open price such as a 09:20 VWAP, then start a new research ID. Do not retrofit I1.
3. For cross-sectional NIFTY 200 research, obtain point-in-time constituent history plus adjusted security data. Using today's constituents historically would introduce survivorship bias.
