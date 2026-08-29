# ETF Strategy Research and Decision Log

Last updated: 29 August 2026

> **Final status: RESEARCH_REJECTED.** On 29 August 2026 the strategy was retired after its corrected cost-aware results failed to demonstrate a sufficient advantage over the user's diversified mutual-fund plan. Automated purchases and floor checks are disabled. Historical artifacts are preserved for audit only.

This document records the strategy definitions, datasets, workflow runs, artifacts, corrections, results and decisions. Failed experiments are preserved so they cannot later be mistaken for evidence.

## 1. Research question

The common entry rule requires a daily return ≤−1%, previous-close 30-session return ≤−2.5%, volume >500,000, one selection per session, most-negative 30-session ranking, and no repeated category on consecutive market sessions.

Two exit families were tested:

1. **Immediate target:** sell when a later session reaches a fixed target.
2. **Fixed floor:** arm the threshold after it is first reached, keep holding, then sell on a subsequent return to that fixed threshold or at a lower opening gap.

The fixed floor never trails upward.

## 2. Shared accounting assumptions

- Approximately ₹15,000 of whole ETF units per purchase.
- Reuse sale proceeds; add fresh funding only for a cash shortfall.
- Mark open positions to the final close.
- Calculate XIRR from dated fresh deposits and terminal account value.
- No exit on the purchase or arming session.
- Gap below the floor fills at the lower opening price.
- Exclude exit-session highs from pre-exit peak return because daily OHLC cannot establish event order.
- Floor studies are gross, before brokerage, taxes, spread, tracking error and execution costs.

## 3. Original workbook and immediate targets

Source: `ETF_Dip_Recovery_Trade_Ledger_3Y.xlsx`

| Item | Value |
|---|---|
| Period | 28-Aug-2023 to 27-Aug-2026 |
| Simulated purchases | 235 |
| Targets compared | 7%, 8%, 10%, 12%, 15%, 20% |
| Published inputs | `research/frozen-entries-1.csv` to `frozen-entries-4.csv` |

Earlier analysis favored approximately 7–8% for faster recycling. Immediate 8% and 12% were retained as contrasting paper sleeves. The workbook is not committed; the reproducibility inputs contain only simulated dates, symbols, categories and prices.

## 4. Fixed 8% floor

### Invalid zero-purchase run

| Item | Value |
|---|---|
| Run | [33196243513](https://github.com/imvishalmittal/etf-trading-lab/actions/runs/33196243513) |
| Artifact | `etf-8-floor-results` — 9695875898 |
| Reported purchases | 0 |
| Status | **Invalid — never cite** |

Cause: a double-escaped newline expression treated each frozen CSV as one line and discarded all rows. The NSE-session check did not independently assert entry count.

[PR #5](https://github.com/imvishalmittal/etf-trading-lab/pull/5) corrected parsing and added hard gates for exactly 235 valid frozen entries and a non-empty 24-month cohort.

### Corrected run

| Item | Value |
|---|---|
| Run | [33225325097](https://github.com/imvishalmittal/etf-trading-lab/actions/runs/33225325097) |
| Artifact | `etf-8-floor-results` — 9706649687 |
| Commit | `2d9b04b48ff4ad6ef6b5bf1db22f07ad2f9388b6` |

| Metric | 24 months | Recent 3 months |
|---|---:|---:|
| Purchases | 189 | 25 |
| Fresh funding | ₹8,33,018.96 | ₹2,80,585.24 |
| Floor exits | 147 | 14 |
| Open lots | 42 | 11 |
| Account value | ₹9,55,220.34 | ₹2,95,815.12 |
| Profit | ₹1,22,201.38 | ₹15,229.88 |
| Total return | 14.6697% | 5.4279% |
| XIRR | 8.4551% | 41.8387% annualized |

The three-month XIRR is a short-period annualization, not a sustainable-return estimate.

## 5. Peak return before 8% floor exits

Added in [PR #6](https://github.com/imvishalmittal/etf-trading-lab/pull/6).

| Item | Value |
|---|---|
| Run | [33226417867](https://github.com/imvishalmittal/etf-trading-lab/actions/runs/33226417867) |
| Artifact | `etf-8-floor-results` — 9707023236 |

| Maximum return before exit | Lots |
|---|---:|
| 8–10% | 113 |
| 10–15% | 26 |
| 15–20% | 5 |
| 20–30% | 3 |
| Above 30% | 0 |

- Median peak: 8.7662%.
- Maximum peak: 29.7199%.
- Normal/gap exits: 68/79.

Interpretation: 77% of completed lots never exceeded 10%, so most gained little extra upside after arming while remaining exposed to gaps.

## 6. Frozen-entry floor comparison

Implemented in [PR #7](https://github.com/imvishalmittal/etf-trading-lab/pull/7).

| Item | Value |
|---|---|
| Run | [33226868724](https://github.com/imvishalmittal/etf-trading-lab/actions/runs/33226868724) |
| Artifact | `etf-floor-comparison-results` — 9707169019 |
| Period | 28-Aug-2024 to 27-Aug-2026 |
| Purchases | 189 identical entries per variant |

### 24-month outcome

| Floor | Fresh funding | Profit | Total return | XIRR | Exits | Gap exits | Open |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 8% | ₹8.33L | ₹1.22L | 14.67% | 8.46% | 147 | 79 | 42 |
| 10% | ₹9.25L | ₹1.46L | 15.76% | 9.14% | 140 | 79 | 49 |
| 12% | ₹10.02L | ₹1.59L | 15.90% | 9.27% | 130 | 89 | 59 |
| **15%** | **₹11.45L** | **₹2.46L** | **21.45%** | **12.53%** | 104 | 52 | 85 |
| 20% | ₹12.44L | ₹2.42L | 19.43% | 11.67% | 92 | 52 | 97 |

### Recent-three-month outcome

| Floor | Funding | Profit | XIRR annualized | Exits | Open |
|---:|---:|---:|---:|---:|---:|
| 8% | ₹2.81L | ₹15,230 | 41.84% | 14 | 11 |
| 10% | ₹3.12L | ₹16,945 | 42.46% | 10 | 15 |
| 12% | ₹3.42L | ₹18,243 | 42.70% | 7 | 18 |
| **15%** | **₹3.57L** | **₹18,828** | **44.12%** | 3 | 22 |
| 20% | ₹3.74L | ₹17,315 | 38.92% | 0 | 25 |

The 24-month horizon initially favored 15%, but it required ₹3.11L more funding than 8% and left 85 rather than 42 lots open.

### Fifteen-percent details

- Realized/unrealized profit: ₹2,08,350.53/₹37,153.67.
- Completed lots: 104; 103 profitable, one losing.
- Normal/gap exits: 52/52.
- Median/average completed holding: 109/149 calendar days.
- Median/average open holding: 190/280 days.
- Open lots: 85, including six armed.
- Open silver P&L: +₹75,871.
- Open technology/FMCG P&L: −₹23,492/−₹19,795.

The result was partly concentrated in three silver lots above +159%, while many unarmed IT/FMCG lots remained deeply negative.

## 7. Reconstructed five-year comparison

Implemented in [PR #8](https://github.com/imvishalmittal/etf-trading-lab/pull/8).

| Item | Value |
|---|---|
| Run | [33228081308](https://github.com/imvishalmittal/etf-trading-lab/actions/runs/33228081308) |
| Artifact | `etf-floor-5y-results` — 9707565320 |
| Commit | `6e2182f39d216b458f8e02a75411f82475d63d53` |
| Period | 28-Aug-2021 to 27-Aug-2026 |
| NSE sessions parsed | 1,355 including lookback |
| ETF universe | 400-symbol union |
| Generated purchases | 339 |

Universe construction used 89 March-2021 ETFs, 349 current NSE ETFs and known historical symbols. Symbols enter only after appearing in daily data. Forty-eight split-like discontinuities were excluded and reported instead of creating artificial returns.

### Outcome

| Floor | Funding | Account value | Profit | Realized profit | Return | XIRR | Exits | Open |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **8%** | **₹7.81L** | ₹12.58L | ₹4.77L | ₹2.89L | 61.09% | **18.03%** | 295 | **44** |
| 10% | ₹8.52L | ₹13.66L | ₹5.14L | ₹3.52L | 60.33% | 17.55% | 286 | 53 |
| 12% | ₹10.07L | ₹15.82L | ₹5.76L | ₹4.08L | 57.22% | 16.73% | 273 | 66 |
| 15% | ₹11.57L | ₹18.97L | ₹7.40L | ₹4.57L | **63.99%** | 17.69% | 238 | 101 |
| 20% | ₹12.31L | ₹19.76L | ₹7.45L | ₹5.98L | 60.54% | 15.16% | 221 | 118 |

### Purchase counts

| Year | Purchases |
|---:|---:|
| 2021 partial | 12 |
| 2022 | 75 |
| 2023 | 43 |
| 2024 | 61 |
| 2025 | 75 |
| 2026 partial | 73 |

### Overlap validation

| Check | Count |
|---|---:|
| Original frozen entries | 235 |
| Regenerated overlap entries | 222 |
| Exact same date and symbol | 159 |
| Same purchase date | 205 |

This is robustness evidence, not an exact workbook extension. Differences arise from daily close versus after-3-PM execution, expanded universe coverage, category reconstruction and conservative split exclusions.

### Interpretation

- 8% had the highest XIRR and lowest capital requirement.
- 15% produced more absolute profit and the highest return, but required about ₹3.76L more funding and left 101 versus 44 lots open.
- 20% added only ₹4,844 profit over 15% while requiring more cash, leaving more lots open and producing lower XIRR.
- 10%, 12% and 20% do not justify separate paper sleeves.

## 8. Current decision

### Active paper sleeves

- Immediate 8% target.
- Immediate 12% target.
- ₹15,000 per sleeve per qualifying selection.
- No floor is active in paper trading yet.

### Floor shortlist

1. **8% floor:** primary capital-efficient candidate.
2. **15% floor:** secondary high-capital/high-absolute-profit candidate.

Before promotion, add costs, define a release rule for permanently unarmed holdings, and collect forward paper evidence.

## 9. Known limitations and next tests

1. Add brokerage, taxes, spread and slippage.
2. Test maximum holding/drawdown exits for unarmed lots.
3. Calculate drawdown and simultaneous deployed capital through time.
4. Repeat without gold and silver to test commodity concentration.
5. Compare close-price approximation with actual 15:15 observations.
6. Paper-test 8% and 15% floors prospectively.
7. Publish sanitized research summaries to a dashboard Research page.

## 10. Pull-request chronology

| PR | Purpose |
|---|---|
| [#1](https://github.com/imvishalmittal/etf-trading-lab/pull/1) | Initial paper trading and dashboard |
| [#2](https://github.com/imvishalmittal/etf-trading-lab/pull/2) | ₹15,000 sleeves and initial floor engine |
| [#3](https://github.com/imvishalmittal/etf-trading-lab/pull/3) | Groww research attempt; blocked by missing secrets |
| [#4](https://github.com/imvishalmittal/etf-trading-lab/pull/4) | Frozen entries and official NSE OHLC |
| [#5](https://github.com/imvishalmittal/etf-trading-lab/pull/5) | Correct zero-entry parser and add integrity gates |
| [#6](https://github.com/imvishalmittal/etf-trading-lab/pull/6) | Add peak return before floor exit |
| [#7](https://github.com/imvishalmittal/etf-trading-lab/pull/7) | Compare five floors on frozen entries |
| [#8](https://github.com/imvishalmittal/etf-trading-lab/pull/8) | Reconstruct five years and compare floors |

## 11. Artifact retention

Artifacts expire after 30 days. Run pages and this document preserve provenance. Cite a result only when its run, commit, rules and integrity status match this log.
