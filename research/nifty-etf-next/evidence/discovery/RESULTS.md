# Frozen discovery result

Final decision: **DISCOVERY_REJECTED for T1, G1, and P1**.

- Period: 2020-01-01 through 2024-12-31
- Authoritative workflow: https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34750393260
- Source commit: `7efb31b3e540cd718aef77978e0c409e68f6f95d`
- Artifact ID: `10315219201`
- Artifact ZIP SHA-256: `4c5c64a08206c341b1d3369cfa7240b5ec0ff08c623dfd54836ce10e47f67baa`
- Data source: Zerodha Kite Connect
- Slippage scenarios: 2, 5, and 10 basis points per side

## Decisions

| Candidate | Normal net P&L | Stress net P&L | Severe net P&L | Normal maximum drawdown | Discovery decision |
|---|---:|---:|---:|---:|---|
| T1 opening-range trend | -₹6,262.04 | -₹8,943.21 | -₹13,411.84 | ₹6,481.54 | REJECT |
| G1 gap-down recovery | -₹2,236.71 | -₹3,602.20 | -₹5,878.03 | ₹2,971.69 | REJECT |
| P1 200-session positional trend | ₹29,718.23 | ₹29,349.81 | ₹28,735.78 | ₹13,066.72 | REJECT |
| B1 passive buy-and-hold benchmark | ₹42,037.57 | ₹42,000.96 | ₹41,939.94 | ₹15,081.50 | BENCHMARK |

T1 produced 112 trades, won 6, lost 106, and had a 0.130 normal profit factor. G1 produced only 57 trades, won 5, lost 52, and had a 0.484 normal profit factor. Neither intraday hypothesis was profitable in any frozen cost scenario or any discovery calendar year.

P1 passed every absolute profitability, stress, and sample-size gate, with 1,025 invested sessions, 15 completed round trips, and four profitable years out of five. It failed the frozen relative-value gate: it retained only 70.7% of B1's net P&L, while its maximum drawdown remained 86.6% of B1's. The rule required P1 either to beat B1 without worse drawdown, or retain at least 90% of B1's profit with drawdown no more than 75% of B1's.

No candidate may enter validation or the sealed holdout. No paper or live trading is authorized.

## Data integrity

- NIFTY signal data: 576,202 unique one-minute bars, including prehistory from 2018-10-08 for causal SMA inputs; 1,544 observed sessions, 1,535 endpoint-eligible.
- NIFTYBEES execution data: 463,635 unique one-minute bars from 2020-01-01 through 2024-12-31; 1,243 observed sessions, 1,235 endpoint-eligible.
- Duplicate timestamps: 0.
- Impossible OHLC rows: 0.
- Critical integrity failure: false.
- NIFTY signal CSV SHA-256: `9f3258b116a54c7c4233f58851fccca793920b7c4419a35093b3c588153b7727`.
- NIFTYBEES execution CSV SHA-256: `892fd2932377050e44aa500ddb9804aca15f9822cf1296f151d91ec8cc5425ec`.

The authoritative artifact passed its internal `sha256sum -c` verification. A later reporting-only repair adds the actual delivery-fee component totals to positional summaries and removes irrelevant `trades`/`ladderUsage` labels from daily mark-to-market rows. It does not alter fills, costs, P&L, drawdowns, gates, or decisions; the transaction-fee totals used economically were already correct (P1 ₹372.17; B1 ₹26.72 under normal slippage).
