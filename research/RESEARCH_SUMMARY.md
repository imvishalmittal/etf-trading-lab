# ETF Trading Lab — consolidated research summary

Last updated: 13 September 2026

## Current conclusion

**RESEARCH_REJECTED.** No strategy in this repository is authorized for paper or live trading. Scheduled purchase and sale workflows remain disabled, the dashboard is a read-only archive, and later research modules contain no broker-order endpoint.

## Completed research matrix

| Program | Period | Candidate(s) | Terminal result | Authoritative evidence |
|---|---|---|---|---|
| Legacy ETF targets/floors | 2021–2026 studies | 8–20% target/floor variants | `RESEARCH_REJECTED` | [Decision log](../ANALYSIS.md) |
| `NIFTY-ETF-M1` | 2020–2024 | Capped loss progression plus controls | `DISCOVERY_REJECTED` | [Run 34747293750](https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34747293750) |
| Follow-up research | 2020–2024 | T1, G1, P1; B1 benchmark | All candidates `DISCOVERY_REJECTED` | [Run 34750393260](https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34750393260) |
| EDGE1 exact-open research | 2020–2024 | S1, S2, I1 | `DATA_BLOCKED` | [Run 34762446008](https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34762446008) |
| EDGE2 post-open research | 2020–2024 | ST1, OR1, VP1 | All `DISCOVERY_REJECTED` | [Run 34768354081](https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34768354081) |
| Multi-ETF short-term research | 2020–2024 | XR1, MR1, BO1; Q0 benchmark | All candidates `DISCOVERY_REJECTED` | [Run 34794327066](https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34794327066) |

## Comparable economic results

All rupee figures use ₹50,000 model capital and normal 2-bps-per-side slippage unless noted.

| Strategy | Trades / exposure | Normal net P&L | Profit factor | Maximum drawdown | Conclusion |
|---|---:|---:|---:|---:|---|
| M1 capped progression | 1,235 trades | −₹98,043.59 | 0.348 | ₹98,381.37 | Large, unstable loss |
| T1 opening-range trend | 112 trades | −₹6,262.04 | 0.130 | ₹6,481.54 | Reject |
| G1 gap-down recovery | 57 trades | −₹2,236.71 | 0.484 | ₹2,971.69 | Reject |
| P1 positional SMA200 | 1,025 invested sessions | ₹29,718.23 | Not comparable to trade PF | ₹13,066.72 | Profitable but inferior to B1 gate |
| B1 passive benchmark | Full-period exposure | ₹42,037.57 | Benchmark | ₹15,081.50 | Comparison only, not intraday strategy |
| EDGE2 ST1 pullback | 17 trades | −₹709.26 | 0.876 | ₹2,688.53 | Reject |
| EDGE2 OR1 breakout | 301 trades | −₹15,354.39 | 0.513 | ₹16,031.14 | Decisive reject |
| EDGE2 VP1 VWAP pullback | 23 trades | −₹1,885.42 | 0.246 | ₹2,050.24 | Reject |
| Multi-ETF XR1 weekly rotation | 55 episodes | ₹66,463.94 | 2.552 | ₹9,117.52 | Reject: 51% single-year concentration |
| Multi-ETF MR1 pullback | 59 episodes | −₹9,515.99 | 0.774 | ₹24,314.92 | Reject |
| Multi-ETF BO1 breakout | 28 episodes | ₹32,205.03 | 2.666 | ₹14,937.44 | Reject: drawdown, bootstrap, benchmark |
| Multi-ETF Q0 benchmark | Full-period exposure | ₹52,386.24 | Benchmark | ₹18,443.72 | Comparison only |

EDGE1 P&L is intentionally excluded from this table because its exact-open coverage failed.

## Data and controls

- Zerodha Kite source: 463,635 unique NIFTYBEES one-minute bars across 1,243 observed sessions, 1 January 2020–31 December 2024.
- NIFTYBEES CSV SHA-256: `892fd2932377050e44aa500ddb9804aca15f9822cf1296f151d91ec8cc5425ec`.
- NIFTY signal CSV SHA-256: `9f3258b116a54c7c4233f58851fccca793920b7c4419a35093b3c588153b7727`.
- Every modern strategy used whole units, fixed model-capital constraints, explicit fee decomposition and adverse 2/5/10-bps slippage.
- Signals were causal and next-bar executable; stop ambiguity was handled conservatively.
- Discovery, validation and holdout were separately gated. No candidate opened validation.
- Complete trade ledgers, summaries, gate decisions and checksums are retained in run artifacts and evidence directories.
- The frozen multi-ETF daily dataset passed its integrity audit: 1,733 rows each for NIFTYBEES, BANKBEES and JUNIORBEES; 1,732 for GOLDBEES; and 1,120 for ITBEES from its 1 July 2020 listing. Artifact `10322457623` has ZIP SHA-256 `1ba7d90cd83e662ba0c2946a80c5493892411c85475d9375483ea87f788086c8`.

## Why research stopped at each stage

- M1, T1 and G1: clearly uneconomic after costs.
- P1: profitable, but failed the frozen benchmark-relative gate.
- EDGE1: required opening prices failed the predeclared integrity standard.
- EDGE2: data was valid, but all candidates failed economic and stability gates.
- Multi-ETF: MR1 was uneconomic; BO1 failed drawdown, bootstrap and benchmark gates; XR1 failed the predeclared single-year concentration gate by one percentage point despite otherwise strong results.

Stopping is part of the research design. Rules are not changed in response to outcomes, and failed candidates are not allowed into validation or holdout.

## Defensible next direction

Do not optimize thresholds or loosen XR1's gate on the now-inspected 2020–2024 sample. XR1 is the strongest research lead, but it is not validated and is not authorized for trading. A future study must obtain a genuinely independent sample or predeclare a structurally different hypothesis before inspecting results. Cross-sectional stock research additionally requires licensed point-in-time constituent history to avoid survivorship bias.
