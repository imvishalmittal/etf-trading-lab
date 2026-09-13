# NIFTYBEES short-term edge research — frozen specification

Frozen on 13 September 2026 before viewing any result for these hypotheses. This namespace is research-only. It cannot place orders, modify the retired ETF ledger/dashboard, or open paper/live trading.

## Shared rules

- Signal instruments are the NSE `NIFTY 50` index and NSE cash `NIFTYBEES`; execution is only in whole NIFTYBEES units.
- Model capital is ₹50,000 and every entry requests a fixed ₹40,000 allocation. Profits are not compounded and losses never increase later exposure.
- Signals based on a completed session or completed five-minute block execute no earlier than the next eligible NIFTYBEES bar open.
- A session is execution-ineligible if its NIFTYBEES opening gap differs from the same-session NIFTY opening gap by more than three percentage points. This predeclared cross-instrument integrity rule prevents isolated ETF opening prints from being treated as executable alpha.
- Multi-day trades use the frozen Zerodha ETF-delivery cost schedule and adverse 2/5/10 bps per-side slippage. Intraday trades use the frozen NSE cash-intraday schedule and the same slippage scenarios.
- Discovery is 2020–2024. Validation is 2025 and stays sealed separately for each candidate unless it passes discovery. The 2026 holdout stays sealed unless that candidate passes validation.
- No threshold, lookback, timing rule, stop, target, cost, or gate may be optimized after results are viewed.

## S1 — three-session pullback in an uptrend

At a completed session close, require all of the following:

1. NIFTY closes strictly above its 200-session simple moving average, including the signal close.
2. NIFTYBEES closes strictly above its 100-session simple moving average, including the signal close.
3. NIFTYBEES has three consecutive negative close-to-close sessions and its cumulative close decline over those three sessions is at least 3%.

Enter at the next eligible session's exact 09:15 open. The initial stop is the reference entry minus twice the signal session's 14-session Wilder true-range arithmetic mean. It is active on the entry bar. Exit at the earliest of:

- a stop gap or trade-through;
- the next session's 09:15 open after a completed NIFTYBEES close strictly above its five-session SMA;
- the 15:29 open of the fifth invested session.

Maximum one open position and no overlapping entry.

## S2 — volume-confirmed 20-session breakout

At a completed session close, require all of the following:

1. NIFTYBEES closes strictly above every one of its preceding 20 completed closes.
2. It closes strictly above its 100-session SMA, including the signal close.
3. Signal-session volume is at least 1.5 times the median volume of the preceding 20 completed sessions.

Enter at the next eligible session's exact 09:15 open. Use the same two-ATR initial stop and causal stop handling as S1. Exit at the earliest of:

- a stop gap or trade-through;
- the next session's 09:15 open after a completed close strictly below every one of its preceding ten completed closes;
- the 15:29 open of the fifteenth invested session.

Maximum one open position and no overlapping entry.

## I1 — intraday VWAP recovery

1. Require the prior completed NIFTY close to be strictly above its 50-session SMA, including that prior close.
2. From completed five-minute blocks ending 09:34 through 11:59, require NIFTYBEES to have traded at least 1% below its exact 09:15 open.
3. Require the current NIFTY five-minute close to be strictly above the prior completed NIFTY session close.
4. Calculate causal session VWAP from NIFTYBEES one-minute typical prices `(high + low + close) / 3`, weighted by strictly positive volume. Require the previous five-minute close to be at or below its then-current VWAP and the current five-minute close to be strictly above its then-current VWAP.
5. Enter at the next one-minute NIFTYBEES bar open. The stop is the recovery block's low. The target is two times entry risk above the reference entry. Reject zero/non-positive risk.
6. The stop is active on the entry bar. A gap through an active stop or target fills at the bar open. If both stop and target trade in the same bar, process the stop first. Otherwise exit at the exact 15:15 bar open.

Maximum one trade per session.

## Acceptance gates

Each candidate must pass every gate independently:

- minimum discovery trades: 50 for S1/S2 and 100 for I1;
- rejected-session rate no greater than 2%;
- normal net P&L greater than zero and profit factor at least 1.20;
- 5-bps stress net P&L greater than zero and profit factor at least 1.05;
- 10-bps severe net P&L greater than zero;
- maximum normal drawdown no more than ₹10,000;
- at least three of five discovery years profitable;
- at least 55% of active months profitable;
- 5,000-resample monthly bootstrap, seed 20260913: 95% lower bound of mean monthly P&L greater than zero;
- no single year above 50% of total positive-year P&L;
- top 10% of winning trades no more than 60% of gross profit;
- maximum requested allocation no more than ₹40,000.

If the rejected-session coverage gate fails, the candidate is classified `DATA_BLOCKED` rather than economically accepted or rejected; any calculated P&L is diagnostic only.

Validation and holdout apply proportionally smaller predeclared sample/year gates and every shared economic, stress, coverage, drawdown, bootstrap, and concentration gate. Passing research never authorizes paper or live trading.
