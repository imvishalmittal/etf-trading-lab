# NIFTY-ETF-MULTI-1 discovery results

Terminal verdict: **DISCOVERY_REJECTED** for all three candidates.

Authoritative [workflow run 34794327066](https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34794327066) replayed the immutable discovery data from run `34772431861`, artifact `10322457623`. All source and result checksums passed.

| Candidate | Episodes | Wins | Normal net P&L | Profit factor | 5-bps P&L | 10-bps P&L | Daily max drawdown | Failed gates |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `XR1` weekly rotation | 55 | 26 | ₹66,463.94 | 2.552 | ₹64,805.44 | ₹62,006.27 | ₹9,117.52 | Single-year concentration |
| `MR1` oversold pullback | 59 | 27 | −₹9,515.99 | 0.774 | −₹11,276.76 | −₹14,193.17 | ₹24,314.92 | 10 gates |
| `BO1` breakout | 28 | 20 | ₹32,205.03 | 2.666 | ₹31,382.13 | ₹29,984.01 | ₹14,937.44 | Drawdown, bootstrap, benchmark-relative |
| `Q0` NIFTYBEES benchmark | 1 | 1 | ₹52,386.24 | — | ₹52,340.57 | ₹52,264.44 | ₹18,443.72 | Comparison only |

## Interpretation

`XR1` was the strongest candidate. It beat Q0 by ₹14,077.70, used less than half Q0's drawdown, remained profitable under severe slippage, had four profitable years, 37 of 60 profitable active months, and passed the family-adjusted bootstrap. It nevertheless failed the frozen rule that no single year contribute more than 50% of total positive-year P&L: 2021 contributed 51% after rounded reporting. The gate will not be loosened after observing the result, so 2025 validation remains sealed.

`MR1` was economically negative and unstable. `BO1` was profitable and stress-resistant, but its ₹14,937.44 drawdown exceeded the ₹10,000 cap, its family-adjusted bootstrap lower bound was −₹231.50, and it did not satisfy the benchmark alternative.

There were zero rejected execution actions. Every candidate stayed within one position and ₹50,000. Gold ETF episodes were charged as non-equity ETF delivery transactions; equity ETF episodes included sell-side STT. All signals used completed closes and all ordinary trades executed at the next open.

No validation, holdout, paper trading, or live trading was opened.
