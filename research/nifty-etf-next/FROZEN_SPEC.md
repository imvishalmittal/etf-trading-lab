# NIFTY ETF follow-up hypotheses — frozen specification

Frozen on 13 September 2026 before viewing any result for these hypotheses. This namespace is research-only and cannot place broker orders, modify the retired ETF ledger/dashboard, or open paper/live trading.

## Shared execution and research discipline

- Signal instrument: NSE `NIFTY 50` index. Execution instrument: NSE cash `NIFTYBEES`. Both mappings must be verified from the authoritative Kite instrument master.
- Model capital is ₹50,000. Every entry requests a fixed ₹40,000 allocation with whole ETF units: `floor(₹40,000 / execution price)`. Profits are not reinvested and losses do not increase later sizing.
- All decisions from a completed NIFTY bar execute no earlier than the next NIFTYBEES minute-bar open. Missing required signal or execution bars reject the session rather than choosing a favourable substitute.
- Intraday execution uses the already-frozen NSE equity-intraday fee schedule and adverse 2/5/10 bps per-side slippage. Positional execution uses zero delivery brokerage, equity-oriented ETF STT of 0.001% on sells, applicable exchange/SEBI/IPFT/GST/stamp charges, and a ₹15.34 DP charge on every sell, plus the same slippage scenarios. The dated sources are Zerodha's charges page and its DP-charge schedule.
- Discovery is 2020–2024. Validation is 2025 and remains sealed unless the individual candidate passes discovery. The 2026 holdout remains sealed unless that candidate passes validation. Each strategy receives its own decision; one candidate cannot open another candidate's later stage.
- No threshold, time, moving-average window, exit, cost, gate, or strategy may be optimized after results are viewed.

## T1 — opening-range trend confirmation

1. Calculate the NIFTY opening range from the 15 completed one-minute bars 09:15–09:29.
2. Require the prior completed NIFTY session's close to be strictly above the arithmetic mean of its preceding 50 completed session closes, including that prior close as the newest observation.
3. Require the 09:34 NIFTY close (the end of the fixed 09:30–09:34 confirmation interval) to be strictly above the opening-range high.
4. Enter NIFTYBEES at the exact 09:35 bar open. Maximum one entry per session.
5. An initial hard stop 1% below the reference entry is active during the entry bar. An opening gap below an active stop fills at the bar open; otherwise a trade-through fills at the stop.
6. After entry, the first completed NIFTY one-minute close at or below the opening-range high creates an exit for the next NIFTYBEES minute open. An already-active ETF stop is processed first.
7. If neither exit occurs, sell at the 15:20 NIFTYBEES bar open.

## G1 — gap-down opening-range recovery

1. Require the exact 09:15 NIFTY open to be at least 0.75% below the prior completed NIFTY session close.
2. Calculate the NIFTY opening range from 09:15–09:29.
3. From 09:30 through 14:59, the first completed NIFTY one-minute candle whose close is strictly above the opening-range high creates an entry at the next NIFTYBEES minute open.
4. Use the same fixed sizing, 1% hard stop, causal gap/stop ordering and maximum-one-trade rule as T1.
5. After entry, the first completed NIFTY one-minute close at or below the opening-range high creates an exit for the next NIFTYBEES minute open.
6. If neither exit occurs, sell at the 15:20 NIFTYBEES bar open. A signal that lacks a next execution bar is rejected.

## P1 — positional 200-session trend

1. At each completed NIFTY session, calculate the arithmetic mean of the latest 200 completed NIFTY session closes, including that session's close.
2. If the close is strictly above its SMA and P1 is in cash, buy NIFTYBEES at the next eligible session's exact 09:15 open. If strictly below and invested, sell at the next eligible 09:15 open. Equality preserves the current state.
3. Allocation is fixed at ₹40,000; idle cash earns zero. No leverage, averaging, stop, trail, or loss progression is used.
4. Any open position is liquidated at the final observed stage session's 15:29 open solely to measure the sealed stage independently.
5. B1 buys NIFTYBEES at the first eligible stage 09:15 open and liquidates at the same final 15:29 open, using identical sizing, delivery fees, and slippage.
6. P1 passes its relative gate only if it either (a) beats B1 net P&L without worse drawdown, or (b) retains at least 90% of positive B1 net P&L while limiting drawdown to at most 75% of B1. Both strategies are marked daily from NIFTYBEES prices.

The machine-readable parameters and immutable gates are in `frozen-config.json`.
