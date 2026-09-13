# NIFTY ETF multi-asset short-term research — frozen specification

Frozen on 13 September 2026 after the data-integrity artifact was verified and before any strategy return was calculated.

## Research boundary

- Research only. No paper trading, live trading, broker order, dashboard write, or account change.
- Model capital: ₹50,000; no leverage, short selling, fractional units, or capital compounding.
- Discovery performance: 1 January 2020–31 December 2024.
- Validation: 1 January–31 December 2025, sealed until a candidate passes every discovery gate.
- Holdout: 1 January 2026 through the latest completed session, sealed until that candidate passes every validation gate.
- Discovery data are the checksummed daily Zerodha Kite OHLCV files in workflow artifact `10322457623`.
- Indicators may use the frozen 2018–2019 prehistory. `ITBEES` becomes eligible only when its genuine post-listing history satisfies every lookback.

## Shared execution and portfolio rules

Signals use only data available at a completed daily close. Entries, exits, and rotations execute at the next valid session open. A same-close fill is forbidden.

- Universe: `NIFTYBEES`, `BANKBEES`, `JUNIORBEES`, `ITBEES`, `GOLDBEES`.
- Maximum one open position and maximum allocation of ₹50,000.
- Quantity is the greatest whole number whose adverse entry fill plus buy-side charges does not exceed ₹50,000.
- Allocation resets to ₹50,000 for sizing each new position; profits are not compounded and losses do not increase risk.
- Uninvested capital earns zero interest.
- Missing or invalid required execution bars reject the affected action; later favorable prices are not substituted.
- If entry and exit signals coincide, execute the exit first. A different instrument may be entered at the same open with separately charged sell and buy transactions.
- All positions are forcibly liquidated at the final stage close solely to value the frozen research boundary.
- Delivery charges and taxes use the dated schedule already frozen in `src/nifty-etf-m1/costs.mjs`.
- Adverse price slippage is applied to every buy and sell: normal 2 bps per side, stress 5 bps, and severe stress 10 bps.

## Candidate XR1 — weekly cross-ETF relative momentum rotation

Hypothesis: medium-term leadership persists across broad equity, sector, and gold ETFs, while an absolute-trend filter avoids weak assets.

1. On the first observed `NIFTYBEES` session of each ISO week, calculate after the close.
2. For each ETF with sufficient history, calculate 63-session total return and 100-session simple moving average.
3. An ETF is eligible only when its 63-session return is greater than zero and its close is above its 100-session SMA.
4. Select the eligible ETF with the highest 63-session return; break exact ties alphabetically by symbol. Select cash if none qualify.
5. At the next common valid market open, hold the selected ETF using the shared sizing rule. If it is already held, do nothing and incur no artificial turnover.
6. There is no intraperiod stop or discretionary override. Re-evaluate only on the next scheduled weekly signal.

## Candidate MR1 — short-term oversold pullback

Hypothesis: a sharp short pullback within an established uptrend mean-reverts over the next few sessions.

1. Evaluate daily after the close when no position is open.
2. Eligible instruments are the equity ETFs `NIFTYBEES`, `BANKBEES`, `JUNIORBEES`, and `ITBEES`; `GOLDBEES` is excluded from this equity mean-reversion hypothesis.
3. Require close above the 100-session SMA, 2-period Wilder RSI at or below 10, and a three-session close-to-close return at or below −2%.
4. If several qualify, choose the lowest RSI; then the most negative three-session return; then alphabetical symbol.
5. Enter at the next common valid open.
6. After each subsequent close, signal an exit when close is at or above the 5-session SMA or after five held sessions, whichever occurs first. Execute at the next valid open.

## Candidate BO1 — daily breakout with short holding cap

Hypothesis: a fresh multiweek high above the long trend can continue for several sessions, while a short Donchian exit limits stale exposure.

1. Evaluate daily after the close when no position is open.
2. Eligible instruments are `NIFTYBEES`, `BANKBEES`, `JUNIORBEES`, and `ITBEES`.
3. Require the close to be above the 100-session SMA and strictly above the maximum high of the preceding 20 sessions, excluding the current session.
4. If several qualify, choose the highest 63-session return; break exact ties alphabetically.
5. Enter at the next common valid open.
6. After each subsequent close, signal an exit when close is strictly below the minimum low of the preceding 10 sessions, excluding the current session, or after 20 held sessions, whichever occurs first. Execute at the next valid open.

## Benchmark Q0

`Q0` buys the maximum whole-unit `NIFTYBEES` position at the first valid discovery open and liquidates at the last discovery close, including delivery costs and the same slippage scenarios. It is a comparison only and cannot be promoted as a short-term candidate.

## Frozen gates

Each candidate is decided independently and must pass every gate:

- At least 25 completed position episodes.
- Rejected required-action rate no greater than 2%.
- Normal net P&L greater than zero and profit factor at least 1.10.
- Stress and severe-stress net P&L both greater than zero.
- Maximum drawdown no more than ₹10,000.
- At least three of the five discovery calendar years profitable.
- At least 55% of active calendar months profitable.
- With 5,000 monthly-block bootstrap resamples and seed `20260913`, the family-adjusted 98.33% lower confidence bound of mean monthly P&L must exceed zero.
- No single year may contribute more than 50% of total positive P&L.
- The top 10% of winning episodes may contribute no more than 60% of gross profit.
- Maximum allocation no more than ₹50,000 and maximum simultaneous positions no more than one.
- Benchmark-relative gate: either normal net P&L exceeds Q0, or maximum drawdown is no more than 50% of Q0 drawdown and recovery factor is at least Q0's recovery factor.

Validation uses the same rules and economic, stress, stability, concentration, coverage, and benchmark-relative gates. A candidate failing discovery is permanently rejected and cannot inspect validation. A candidate failing validation cannot inspect holdout. No parameter, universe member, gate, or period may change in response to results.

Passing all research stages would mean `RESEARCH_PASSED_NOT_AUTHORIZED`, not permission to trade.
