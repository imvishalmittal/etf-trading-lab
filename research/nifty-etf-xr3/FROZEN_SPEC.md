# XR3 defensive multi-ETF rotation

Frozen on 14 September 2026 before acquiring the expanded-universe data or calculating XR3 returns.

## Classification and boundaries

- Research only. No broker orders, paper trading, or live deployment are authorized.
- Discovery: 1 January 2020 through 31 December 2024.
- Validation: 1 January 2025 through 31 December 2025.
- Holdout/OOS: 1 January 2026 through 11 September 2026.
- Indicator warm-up begins 1 January 2018.
- All three periods are calculated in one authoritative GitHub Actions run but receive separate metrics and gates. The continuous 2020–2026 result is context only.
- Because the 2025 and 2026 observations informed the XR3 hypothesis, these labels organize historical evidence but are not untouched confirmation. A historical pass can authorize only a separately approved prospective, no-order observation phase.

## Data and universe

- Source: Zerodha Kite Connect daily OHLCV using read-only instrument-master and historical-candle endpoints.
- Equity candidates: `NIFTYBEES`, `BANKBEES`, `JUNIORBEES`, `ITBEES`, `MID150BEES`, `PHARMABEES`, `AUTOBEES`, and `CPSEETF`.
- Defensive asset: `GOLDBEES`.
- Instruments are eligible only after their genuine listing history supplies every required indicator. No pre-listing history is fabricated.
- Audit exact NSE cash mapping, first/last date, duplicates, OHLC validity, non-positive prices, zero volume, and close-to-close moves above 15%. Extreme moves are reported, not silently edited.
- A zero-volume bar is never used as a signal or execution price. A required execution open that is absent, invalid, or zero-volume rejects the entire scheduled rotation. No later favorable price is substituted.

The expanded list is fixed before XR3 calculation. Instruments may not be removed because their returns are weak or added because their returns are strong.

## Signals and portfolio

- Model capital: ₹50,000, non-compounding.
- Evaluate after the close of the first observed `NIFTYBEES` session of each ISO week.
- Execute the resulting rotation at the next common valid market open, selling removed holdings before buying additions.
- Signals use completed daily bars only. Retained holdings are not sold and repurchased.
- Whole ETF units only; no leverage, short selling, derivatives, or overnight margin.

### Market regime

- Risk-on requires the completed `NIFTYBEES` close to be strictly above its 200-session simple moving average.
- When risk-on is false, no equity ETF may be held.

### Equity sleeves

An equity ETF qualifies only when:

1. Its 63-session total return is strictly positive.
2. Its completed close is strictly above its 100-session simple moving average.
3. Its population standard deviation of the latest 20 completed close-to-close simple returns is positive and available.

Rank qualified ETFs by `63-session return / 20-session volatility`, descending, with alphabetical symbol order breaking exact ties. Hold at most the top two, allocating at most ₹16,500 to each. Unused sleeves remain cash.

### Defensive sleeve

- `GOLDBEES` qualifies when its 63-session total return is strictly positive and its completed close is strictly above its 100-session simple moving average.
- Allocate at most ₹16,500 to eligible `GOLDBEES`; otherwise keep that sleeve in cash.
- This sleeve is independent of the equity regime. In risk-off, the portfolio therefore holds either one ₹16,500 gold sleeve or all cash.

Maximum simultaneous holdings are three. Maximum planned allocation is ₹49,500; buy fees and adverse slippage must fit inside each sleeve.

## Costs and controls

- Apply the already frozen delivery cost schedule to every buy and sell.
- Apply adverse slippage of 2 bps per side (normal), 5 bps (stress), and 10 bps (severe).
- `XR2` is the unchanged parent control, using its original five-ETF universe and rules.
- `Q0` is maximum-whole-unit `NIFTYBEES` buy and hold.
- Positions open at a period boundary are liquidated at that boundary close solely for standalone research valuation.

## Gates

Discovery gates are unchanged from the unified XR2 study: at least 25 episodes; rejected-action rate no more than 2%; positive normal/stress/severe P&L; normal PF at least 1.20; stress PF at least 1.05; drawdown no more than ₹10,000; at least three profitable years; at least 55% profitable active months; positive 95% monthly-block bootstrap lower mean using 5,000 samples and seed `20260914`; single-year positive-P&L concentration no more than 50%; and top-winning-decile contribution no more than 60%.

Validation requires at least five episodes, positive P&L in all three slippage scenarios, normal PF at least 1.10, drawdown no more than ₹5,000, and at least 50% profitable active months.

Holdout requires at least three episodes, positive P&L in all three slippage scenarios, and drawdown no more than ₹5,000.

Whole-study gates require at least 25 episodes, allocation no more than ₹50,000, no more than three simultaneous positions, recovery factor above XR2, and either higher net P&L than XR2 or at least 25% lower drawdown without a lower profit factor.

Every stage and whole-study gate must pass for `HISTORICAL_STAGED_SUPPORT_NOT_AUTHORIZED`; otherwise the verdict is `HISTORICAL_STAGED_REJECTED`. Combined profitability cannot rescue a failed period.
