# XR1 and BO1 2025–2026 OOS results

## Verdict

Both unchanged candidates are **`OOS_DOES_NOT_CONFIRM`**. Each was profitable in 2025 and over the combined interval, but each lost money in 2026 YTD under all three predeclared slippage scenarios. XR1 also exceeded the frozen maximum-drawdown limit.

This result does not change the original `DISCOVERY_REJECTED` verdict and does not authorize paper or live trading.

## Provenance

- Frozen protocol commit: `f47a76deeb092e24fb5f10a0355a5ed2a09fc280`
- OOS engine merge commit: `b187767620095737b66b68eb6264b8c1f1e6217a`
- Trigger/source commit: `68d4e313ed786d2f26346173a97bb99c9012ae58`
- Authoritative workflow: [run 34800068186](https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34800068186)
- Artifact ID: `10331226835`
- Artifact digest: `sha256:8009d87f2cc35a08b6d886c80e1353d15946300af15577e896019e2075b864f7`
- All 34 recorded member checksums: **VERIFIED**
- Tests: **58 passed**

## Performance

Model capital is ₹50,000. Normal, stress, and severe use 2, 5, and 10 basis points of adverse slippage per side respectively.

| Strategy | Period | Episodes | Normal | Stress | Severe |
|---|---:|---:|---:|---:|---:|
| XR1 | 2025 |  | +₹13,502.68 | +₹13,173.38 | +₹12,658.71 |
| XR1 | 2026 YTD |  | **−₹3,552.05** | **−₹3,761.01** | **−₹4,106.70** |
| XR1 | Combined | 17 | +₹9,950.63 | +₹9,412.37 | +₹8,552.01 |
| BO1 | 2025 |  | +₹2,598.05 | +₹2,387.59 | +₹2,039.32 |
| BO1 | 2026 YTD |  | **−₹1,259.98** | **−₹1,379.37** | **−₹1,547.79** |
| BO1 | Combined | 11 | +₹1,338.07 | +₹1,008.22 | +₹491.53 |

| Strategy | Combined normal PF | Normal max drawdown | Normal recovery factor | Q0-relative gate |
|---|---:|---:|---:|---|
| XR1 | 1.540 | **₹25,780.83** | 0.39 | Pass |
| BO1 | 1.252 | ₹4,658.12 | 0.29 | Pass |
| Q0 | n/a | ₹8,290.63 | 0.05 | Benchmark |

Q0 produced +₹454.93 combined under normal slippage. XR1 and BO1 both beat Q0 net P&L, but that does not override their failed calendar-slice gates.

## Failed gates

XR1 failed:

- 2026 YTD normal net P&L greater than zero
- 2026 YTD stress net P&L greater than zero
- 2026 YTD severe net P&L greater than zero
- Maximum drawdown no more than ₹10,000

BO1 failed:

- 2026 YTD normal net P&L greater than zero
- 2026 YTD stress net P&L greater than zero
- 2026 YTD severe net P&L greater than zero

## Data integrity

- Source: Zerodha Kite Connect daily OHLCV, read-only endpoints only
- Acquisition interval: 3 June 2024 through 11 September 2026
- Performance interval: 1 January 2025 through 11 September 2026
- Instruments: NIFTYBEES, BANKBEES, JUNIORBEES, ITBEES, GOLDBEES
- Rows per instrument: 567
- Duplicate dates: 0
- Invalid OHLC rows: 0
- Zero-volume rows: 0
- Extreme close moves above 15%: 0
- Coverage-end match: yes
- Rejected required actions: 0 for both strategies

The 2024 overlap was used only for indicator warm-up. Strategy state continued across the 2025/2026 boundary without resetting.

## Research interpretation

XR1's 2025 strength did not persist into 2026, and its combined drawdown was more than half the model capital. BO1 controlled drawdown better, but its combined severe-slippage edge was only ₹491.53 across 11 episodes and it also failed every 2026 profitability slice. Neither candidate is robust enough to advance to paper trading.
