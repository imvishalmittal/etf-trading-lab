# NIFTY-ETF-M1 frozen research specification

Frozen on 13 September 2026 before viewing any NIFTYBEES minute result. This namespace is research-only. It does not modify the retired ETF paper ledger, dashboard, broker account, or disabled purchase/sell workflows.

## Instrument and sizing

- NSE cash `NIFTYBEES`, verified at run time against the selected authoritative broker instrument master. Groww's zero-coverage result is preserved; the operational data-source repair uses Zerodha Kite Connect without changing any economic rule.
- Intraday only; entry at the exact 09:15 IST one-minute bar open and mandatory exit at the exact 15:29 IST bar open.
- Model capital ₹50,000; base allocation ₹5,000; whole-unit quantity is `floor(₹5,000 × multiplier / entry price)`.
- Capped multipliers are `1× → 2× → 4× → 8×`; maximum intended allocation is ₹40,000.
- An absent or invalid 09:15 or 15:29 bar makes that observed session ineligible and does not change ladder state.

## Variants

| ID | Frozen behavior |
|---|---|
| C0 | Fixed 1×, 15:29 exit, no stop |
| C1 | Capped ladder, 15:29 exit, no stop |
| C2 | Capped ladder, 1% hard stop |
| M1 | Capped ladder, 1% hard stop, +0.5% breakeven activation and 0.5% trailing stop |

M1 is the sole candidate. Controls cannot be selected after viewing results.

## Causal stop processing

The initial hard stop is active from entry. On each bar, an already-active stop is tested before any change based on that bar. A gap below it fills at the bar open; otherwise a trade-through fills at the active stop. A completed bar may activate breakeven or raise M1's trailing stop only for the next bar. The new stop is never tested against the same bar's low. At 15:29, an opening gap through an active stop is recorded as a gap stop; otherwise the trade exits at the 15:29 open without using that bar's later range.

## Ladder state

Each ladder variant maintains its own state, determined only from that variant's normal (2 bps/side) net P&L after all fees. Positive net P&L resets the next eligible session to 1×. Zero or negative advances 1→2→4→8; a non-positive 8× trade closes the cycle unrecovered and the next eligible session resets to 1×. Stress scenarios replay the exact normal-scenario quantity and ladder path so stress does not invent a different trade cohort.

## Costs and slippage

The dated schedule recorded on 13 September 2026 uses Dhan/Zerodha NSE equity-intraday rates:

- brokerage per order: `min(₹20, 0.03% × order value)`;
- STT: 0.025% of sell turnover;
- NSE transaction charge: 0.0030699% of buy and sell turnover;
- SEBI turnover charge: 0.0001% of buy and sell turnover;
- GST: 18% of brokerage, transaction charge, SEBI charge, and IPFT;
- stamp duty: 0.003% of buy turnover;
- NSE IPFT: 0.0000001% of turnover.

Sources: <https://zerodha.com/charges/> and <https://dhan.co/pricing/>. The frozen adverse price slippage is 2, 5, and 10 basis points per side and applies to every entry and exit, including stops.

## Period gates

Discovery is 2020-01-01 through 2024-12-31. Validation (2025) is inaccessible unless a committed discovery gate says `PASS`. Holdout (2026 through the latest completed NSE session) is inaccessible unless a committed validation gate says `PASS`. Ladder state is continuous within each opened stage and across calendar-year boundaries, but each stage begins at 1× because the preceding sealed data is not replayed into it.

The machine-readable parameters and gates are in `frozen-config.json`. Any operational repair may change fetching, retry, or artifact mechanics, but never a frozen economic rule, period, comparison, scenario, or gate.
