# Combined XR2 and BO2 exploratory research

Frozen on 14 September 2026 before calculating either new candidate.

## Classification

This is one combined exploratory backtest, as explicitly requested by the user. It does not divide observations into discovery, validation, or holdout sets.

The complete performance interval is 1 January 2020 through 11 September 2026. Observations from 1 January 2018 through 31 December 2019 are indicator warm-up only. Because the rules were proposed after XR1 and BO1 results were viewed, a passing result means only `COMBINED_RESEARCH_CANDIDATE_NOT_AUTHORIZED`; it is not independent historical validation.

The original XR1 and BO1 `DISCOVERY_REJECTED` and `OOS_DOES_NOT_CONFIRM` decisions remain unchanged.

## Shared execution

- Universe: `NIFTYBEES`, `BANKBEES`, `JUNIORBEES`, `ITBEES`, and `GOLDBEES`.
- Equity breadth universe: `NIFTYBEES`, `BANKBEES`, `JUNIORBEES`, and `ITBEES`.
- Model capital: ₹50,000, non-compounding.
- Signals use completed daily bars; transactions occur at the next common valid market open.
- Whole ETF units only; no leverage or short selling.
- Every buy and sell includes the frozen delivery cost schedule and adverse slippage of 2, 5, and 10 basis points per side.
- Missing or invalid required execution bars reject the action; no later favorable price is substituted.
- Positions open at the final boundary are liquidated at the 11 September 2026 close solely for research valuation.

## Controls

- `XR1`: unchanged weekly single-winner relative-momentum rotation.
- `BO1`: unchanged 20-session breakout with 10-session Donchian exit and 20-session holding cap.
- `Q0`: unchanged maximum whole-unit NIFTYBEES buy-and-hold benchmark.

The executable study must load the original `../frozen-config.json`; it may not reimplement changed versions of the controls.

## Candidate XR2 — diversified two-leader rotation

XR2 changes only XR1's concentration and sizing:

1. Evaluate on the first observed NIFTYBEES session of each ISO week after the close.
2. Calculate each ETF's 63-session total return and 100-session SMA.
3. An ETF qualifies only if its 63-session return is greater than zero and its close is above its 100-session SMA.
4. Rank qualifying ETFs by descending 63-session return, breaking exact ties alphabetically.
5. Hold the top two qualifying ETFs, with a maximum allocation of ₹25,000 to each.
6. If exactly one ETF qualifies, allocate at most ₹25,000 and hold the remaining capital in cash. If none qualify, hold cash.
7. At the next common valid market open, sell removed holdings first and then buy new holdings. Retained holdings are not artificially sold and repurchased.
8. Re-evaluate only on the next weekly signal. Maximum simultaneous positions: two; maximum total allocation: ₹50,000.

## Candidate BO2 — breadth-confirmed breakout

BO2 changes only BO1's entry filter:

1. Evaluate daily after the close when no position is open.
2. Apply every original BO1 instrument breakout, trend, ranking, execution, exit, and holding rule unchanged.
3. Additionally require NIFTYBEES to close above its 200-session SMA.
4. Additionally require at least two of the four equity-universe ETFs to close above their respective 100-session SMAs on the signal date.
5. If either market-regime condition fails, do not enter. Existing positions continue under the unchanged BO1 exit rules.

## Combined acceptance gates

Each new candidate is evaluated independently and must pass every applicable gate over the combined interval:

- At least 25 completed position episodes.
- Rejected required-action rate no greater than 2%.
- Normal net P&L greater than zero and profit factor at least 1.20.
- Stress net P&L greater than zero and profit factor at least 1.05.
- Severe-stress net P&L greater than zero.
- Daily mark-to-market maximum drawdown no more than ₹10,000.
- At least five of the seven reported calendar slices (2020–2025 and 2026 YTD) profitable under normal slippage.
- At least 55% of active calendar months profitable under normal slippage.
- Every rolling 24-month window ending at a calendar-month boundary has positive normal net P&L.
- Monthly-block bootstrap with 5,000 resamples and fixed seed `20260914`: 95% lower confidence bound of mean monthly P&L greater than zero.
- No single calendar slice contributes more than 50% of total positive normal P&L.
- Top 10% of winning episodes contribute no more than 60% of gross normal profit.
- Maximum total allocation no more than ₹50,000.
- XR2 maximum simultaneous positions no more than two; BO2 no more than one.
- Candidate normal recovery factor must exceed its parent control's normal recovery factor.
- Candidate must either exceed its parent control's normal net P&L or reduce its maximum drawdown by at least 25% without a lower normal profit factor.

No individual year, ETF, rule, threshold, or variant may be selected after seeing these results. Passing produces only `COMBINED_RESEARCH_CANDIDATE_NOT_AUTHORIZED`; failure produces `COMBINED_RESEARCH_REJECTED`.

## Next stage

There is no additional historical validation stage. A passing combined candidate may move only to a separately authorized prospective paper-observation phase. No broker orders or live deployment are authorized by this research.
