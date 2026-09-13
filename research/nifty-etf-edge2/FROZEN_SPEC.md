# NIFTYBEES post-open edge research — frozen specification

Frozen on 13 September 2026 before viewing any EDGE2 result. This is a new research namespace; it does not modify the completed `nifty-etf-edge` experiment.

## Shared rules

- Research-only NIFTYBEES execution with NIFTY 50 regime filters; no order endpoints, paper trading, or live trading.
- ₹50,000 model capital, fixed ₹40,000 allocation, whole ETF units, no compounding or loss progression.
- Ignore 09:15–09:19 for signals, reference prices, ranges, VWAP, and entries. Required data begins at 09:20.
- Signals use only completed bars and execute at the next one-minute bar open.
- Intraday ambiguity is stop-first. A gap beyond an active stop or target fills at the bar open; otherwise a trade-through fills at the level.
- Delivery costs apply to ST1. Intraday costs apply to OR1/VP1. Adverse slippage is frozen at 2, 5, and 10 bps per side.
- Discovery: 2020–2024. Validation: 2025, sealed per candidate until discovery passes. Holdout: 2026, sealed until validation passes.

## ST1 — post-open three-session pullback

After a completed session, require NIFTY close above SMA200, NIFTYBEES close above SMA100, and three consecutive negative ETF closes with a cumulative decline of at least 2%. Enter next session at 09:20. Stop at entry minus twice the signal day's 14-session mean true range, calculated without 09:15–09:19. Exit at the next 09:20 after a completed ETF close above SMA5, at the stop, or at 15:15 on the fifth invested session.

## OR1 — stabilized opening-range breakout

Require the prior NIFTY close above its SMA50. Define the opening range from 09:20–09:34. From completed five-minute blocks ending 09:39–11:59, take the first close strictly above the range high and enter next minute. Stop at the range low and target 1.5R. Accept only entry risk between 0.25% and 1.5% of entry. Exit no later than 15:15.

## VP1 — VWAP pullback continuation

Require the prior NIFTY close above SMA50. Calculate causal volume-weighted typical-price VWAP beginning at 09:20. A trend becomes established after a completed five-minute block closes above the 09:20–09:34 range high. From blocks ending 09:39–13:59, enter after the first later block whose low touches/breaches causal VWAP and whose close finishes above both VWAP and the previous block close. Stop at that block's low and target 1.5R. Accept only risk between 0.2% and 1.0% of entry. Exit no later than 15:15.

## Gates

Each candidate must independently satisfy: minimum discovery trades (ST1 50; OR1/VP1 100), rejected-session rate ≤2%, normal P&L >0 and PF ≥1.20, 5-bps P&L >0 and PF ≥1.05, 10-bps P&L >0, drawdown ≤₹10,000, at least three profitable years, ≥55% profitable active months, positive 95% lower monthly-bootstrap mean (5,000 samples; seed 20260913), single-year positive-P&L contribution ≤50%, top-decile winner contribution ≤60%, and deployment ≤₹40,000.

Failed coverage is `DATA_BLOCKED`; otherwise any failed gate is rejection. Passing research never authorizes deployment.
