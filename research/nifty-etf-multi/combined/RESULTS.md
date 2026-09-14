# Unified-run XR2 and BO2 staged results

## Verdict

- `XR2`: **`HISTORICAL_STAGED_REJECTED`**
- `BO2`: **`HISTORICAL_STAGED_REJECTED`**

All discovery, validation, holdout, and contextual combined calculations completed in one workflow run. The periods were separately evaluated; positive combined totals did not override failed stages. Neither candidate is authorized for paper or live trading.

## Provenance

- Frozen protocol merge: `1a7b5973fcea5642e2259068e855221f849a81d7`
- Engine merge: `0551e122a5eb41765bff31df8e6fc0740d895f1c`
- Trigger/source commit: `d4f70679a00d61309d1d2e9f2d426a400e160ed3`
- Authoritative workflow: [run 34801630148](https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34801630148)
- Result artifact: `10330888668`
- Artifact digest: `sha256:3d4c61bcfcd0d5a4fcc39c9ab029084c6c2dd8558eca668c1c56c4001d9d15f0`
- Result member checksums: **102/102 verified**
- Source artifacts: **both member checksum sets verified before calculation**
- Tests: **60 passed**

## Separate stage results

Normal, stress, and severe apply 2, 5, and 10 basis points of adverse slippage per side.

| Stage | Candidate | Episodes | Normal P&L | PF | Stress P&L | Severe P&L | Max drawdown | Decision |
|---|---|---:|---:|---:|---:|---:|---:|---|
| Discovery 2020–2024 | XR2 | 81 | +₹59,699.08 | 3.114 | +₹58,449.53 | +₹56,395.47 | **₹10,646.65** | Reject |
| Discovery 2020–2024 | BO2 | 27 | +₹34,222.17 | 2.920 | +₹33,418.64 | +₹32,056.35 | **₹11,030.49** | Reject |
| Validation 2025 | XR2 | 22 | +₹7,153.66 | 1.844 | +₹6,821.52 | +₹6,273.03 | **₹6,469.07** | Reject |
| Validation 2025 | BO2 | 7 | **−₹2,886.79** | 0.421 | **−₹3,095.63** | **−₹3,441.22** | ₹3,420.96 | Reject |
| Holdout 2026 YTD | XR2 | 13 | **−₹4,759.78** | 0.378 | **−₹4,951.81** | **−₹5,268.50** | **₹13,599.21** | Reject |
| Holdout 2026 YTD | BO2 | 2 | **−₹3,730.84** | 0.000 | **−₹3,789.42** | **−₹3,855.28** | ₹4,850.67 | Reject |

### Failed gates

XR2:

- Discovery maximum drawdown exceeded ₹10,000.
- Validation maximum drawdown exceeded ₹5,000.
- Holdout normal, stress, and severe P&L were negative.
- Holdout maximum drawdown exceeded ₹5,000.

BO2:

- Discovery maximum drawdown exceeded ₹10,000.
- Validation failed normal/stress/severe profitability, profit factor, and profitable-month rate.
- Holdout had only two episodes, below the minimum three, and lost money at every slippage level.

## Contextual combined comparison

These totals are descriptive and cannot change a stage verdict.

| Strategy | Episodes | Normal P&L | PF | Stress P&L | Severe P&L | Max drawdown | Recovery factor |
|---|---:|---:|---:|---:|---:|---:|---:|
| XR1 control | 71 | +₹78,129.20 | 2.312 | +₹75,961.90 | +₹72,351.49 | ₹25,780.83 | 3.03 |
| XR2 | 112 | +₹65,549.78 | 2.553 | +₹63,834.93 | +₹61,010.44 | ₹16,300.34 | 4.02 |
| BO1 control | 39 | +₹33,543.09 | 2.362 | +₹32,390.34 | +₹30,475.55 | ₹14,937.44 | 2.25 |
| BO2 | 35 | +₹30,716.98 | 2.311 | +₹29,674.80 | +₹27,947.81 | ₹11,030.49 | 2.78 |

XR2 achieved the intended diversification effect: compared with XR1, drawdown fell 36.8%, profit factor improved, recovery factor improved, and the episode count rose. It nevertheless lost decisively in the separately reported 2026 holdout, so it cannot advance.

BO2 reduced BO1 drawdown by 26.2%, but also reduced net P&L and profit factor and failed both later periods. The breadth filter did not create a stable breakout edge.

## Conclusion

XR2 is a useful risk-control design but not a historically stable candidate. BO2 should be retired. Further historical parameter tuning on these same observations would be post-result optimization; any future XR-family proposal must be frozen as a genuinely new hypothesis and should ultimately be confirmed prospectively.
