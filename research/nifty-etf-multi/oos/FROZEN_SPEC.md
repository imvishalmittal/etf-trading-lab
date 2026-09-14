# XR1 and BO1 post-selection out-of-sample confirmation

Frozen on 14 September 2026 before acquiring or inspecting 2025 or 2026 ETF observations.

## Classification

This is a new post-selection out-of-sample diagnostic, not a continuation of the failed original discovery gate. The original `DISCOVERY_REJECTED` verdict remains permanent. Because XR1 and BO1 were selected after their 2020–2024 results were observed, even a successful result here means only `OOS_CONFIRMATORY_SUPPORT_NOT_AUTHORIZED`.

## Unchanged candidates

- `XR1`: exact weekly relative-momentum rotation rules from `../FROZEN_SPEC.md`.
- `BO1`: exact daily breakout rules from `../FROZEN_SPEC.md`.
- No threshold, lookback, universe member, ranking rule, execution time, sizing rule, charge, or slippage assumption may change.
- `MR1` is excluded because it was economically negative, not because a better parameter was selected.

The executable workflow must load `../frozen-config.json` directly and verify the immutable discovery-specification commit `cd59d9e951deef723c31b3e78430cc15c1955ad0` in its provenance.

## Data and periods

- Source: Zerodha Kite Connect daily OHLCV, read-only endpoints only.
- Acquisition: 1 June 2024 through 11 September 2026. The 2024 overlap is indicator warm-up only; its returns are not counted.
- OOS performance: 1 January 2025 through 11 September 2026.
- Report 2025 and 2026 YTD P&L separately, plus the continuous combined period without resetting a position at 31 December 2025.
- Audit instrument mapping, exact first/last observation, duplicates, invalid OHLC, non-positive prices, zero volume, and close moves above 15%.
- Store source data, ledgers, equity curves, summaries, gates, and SHA-256 checksums in the workflow artifact.

## Execution and costs

Use the exact original next-open, maximum-one-position, whole-unit, fixed ₹50,000 allocation, non-compounding, delivery-charge, and adverse-slippage rules. Ordinary signals are evaluated only after a completed close. A position open at the final boundary is valued and forcibly liquidated at the 11 September 2026 close.

## Predeclared confirmation gates

Each candidate is evaluated independently and must pass every gate:

- At least 10 completed position episodes over the combined OOS period.
- Rejected required-action rate no greater than 2%.
- Normal, 5-bps stress, and 10-bps severe net P&L each greater than zero in calendar 2025.
- Normal, 5-bps stress, and 10-bps severe net P&L each greater than zero in 2026 YTD.
- Combined normal, stress, and severe net P&L each greater than zero.
- Combined daily mark-to-market maximum drawdown no more than ₹10,000.
- Maximum allocation no more than ₹50,000 and maximum simultaneous positions no more than one.
- Combined benchmark-relative gate: either normal net P&L exceeds Q0, or maximum drawdown is no more than 50% of Q0 drawdown and recovery factor is at least Q0's recovery factor.

No monthly bootstrap or annual concentration gate is applied to this short 20-month diagnostic; instead, both predeclared calendar slices must independently remain profitable at every slippage level.

No outcome authorizes paper or live trading. Separate authorization and a prospective paper phase would still be required.
