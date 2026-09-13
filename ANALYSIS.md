# ETF Strategy Research and Decision Log

Last updated: 13 September 2026

> **Final status: RESEARCH_REJECTED.** On 29 August 2026 the original strategy was retired after corrected cost-aware results failed to demonstrate sufficient advantage over the user's diversified mutual-fund plan. Four subsequent frozen NIFTYBEES research programs also failed or were data-blocked. Automated purchases and floor checks remain disabled. Historical artifacts are preserved for audit only.

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

## 8. Retirement decision

The earlier paper-candidate decision was superseded on 29 August 2026 after cost-aware validation and comparison with the user's diversified mutual-fund plan. All scheduled purchases and floor checks were disabled, the dashboard became a read-only archive, and no floor or target sleeve remained active. Commit `def8799` and PR #15 preserve the retirement.

## 9. Legacy-study limitations

The floor studies used a reconstructed ETF universe and daily-price approximations. Later research addressed brokerage, taxes, slippage, causal minute execution, drawdown, deterministic gates, and checksummed artifacts. Those improvements did not produce an approved strategy.

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
| [#9](https://github.com/imvishalmittal/etf-trading-lab/pull/9) | Document project and ETF research history |
| [#10](https://github.com/imvishalmittal/etf-trading-lab/pull/10) | Test trailing floors above the 8% minimum |
| [#11](https://github.com/imvishalmittal/etf-trading-lab/pull/11) | Add constrained robustness matrix |
| [#12](https://github.com/imvishalmittal/etf-trading-lab/pull/12) | Correct robustness funding assumptions |
| [#13](https://github.com/imvishalmittal/etf-trading-lab/pull/13) | Add cost-aware validation and paper candidates |
| [#14](https://github.com/imvishalmittal/etf-trading-lab/pull/14) | Document corrected validation |
| [#15](https://github.com/imvishalmittal/etf-trading-lab/pull/15) | Retire the ETF strategy and disable automation |
| [#16](https://github.com/imvishalmittal/etf-trading-lab/pull/16) | Add frozen `NIFTY-ETF-M1` research pipeline |
| [#17](https://github.com/imvishalmittal/etf-trading-lab/pull/17) | Record authenticated Groww zero-coverage result |
| [#18](https://github.com/imvishalmittal/etf-trading-lab/pull/18) | Add read-only Zerodha Kite acquisition |
| [#19](https://github.com/imvishalmittal/etf-trading-lab/pull/19) | Trigger authoritative M1 discovery |
| [#20](https://github.com/imvishalmittal/etf-trading-lab/pull/20) | Preserve M1 rejection evidence and mask tokens |
| [#21](https://github.com/imvishalmittal/etf-trading-lab/pull/21) | Add frozen T1/G1/P1 follow-up research |
| [#22](https://github.com/imvishalmittal/etf-trading-lab/pull/22) | Record follow-up discovery rejection |
| [#23](https://github.com/imvishalmittal/etf-trading-lab/pull/23) | Add frozen S1/S2/I1 short-term research |
| [#24](https://github.com/imvishalmittal/etf-trading-lab/pull/24) | Trigger S1/S2/I1 discovery |
| [#25](https://github.com/imvishalmittal/etf-trading-lab/pull/25) | Record exact-open `DATA_BLOCKED` evidence |
| [#26](https://github.com/imvishalmittal/etf-trading-lab/pull/26) | Add frozen post-open ST1/OR1/VP1 research |
| [#27](https://github.com/imvishalmittal/etf-trading-lab/pull/27) | Record post-open discovery rejection |

## 11. Artifact retention

Artifacts expire after 30 days. Run pages and this document preserve provenance. Cite a result only when its run, commit, rules and integrity status match this log.

## 12. NIFTY-ETF-M1 capped loss progression

M1 tested a capped `1× → 2× → 4× → 8×` intraday progression against fixed and stopped controls using 2020–2024 NIFTYBEES minute data. It used a 1% hard stop, breakeven/trailing logic, causal next-bar stop changes, full intraday charges, and 2/5/10-bps slippage.

Authoritative [run 34747293750](https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34747293750) processed 463,635 bars, 1,243 observed sessions and 1,235 eligible trades. M1 lost ₹98,043.59 normally, profit factor was 0.348, maximum drawdown was ₹98,381.37, all five years lost money, and 179 of 215 cycles reaching 8× ended unrecovered. It failed 13 frozen gates. Validation and holdout remained sealed.

## 13. Fixed-allocation follow-ups

Authoritative [run 34750393260](https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34750393260) tested three fixed-₹40,000 candidates:

| Candidate | Normal net P&L | 5-bps P&L | 10-bps P&L | Decision |
|---|---:|---:|---:|---|
| T1 opening-range trend | −₹6,262.04 | −₹8,943.21 | −₹13,411.84 | Reject |
| G1 gap-down recovery | −₹2,236.71 | −₹3,602.20 | −₹5,878.03 | Reject |
| P1 positional SMA200 trend | ₹29,718.23 | ₹29,349.81 | ₹28,735.78 | Reject |
| B1 passive NIFTYBEES benchmark | ₹42,037.57 | ₹42,000.96 | ₹41,939.94 | Benchmark |

P1 was profitable but retained only 70.7% of the passive benchmark's net P&L without enough drawdown improvement; it therefore failed the predeclared relative-value gate. Discovery success is not defined as merely making money.

## 14. Exact-open short-term research

S1 three-session pullback, S2 volume breakout and I1 VWAP recovery depended on the exact 09:15 NIFTYBEES print. Authoritative [run 34762446008](https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34762446008) found 187 of 1,243 sessions (15.04%) where the ETF opening gap differed from the NIFTY gap by more than three percentage points. The frozen coverage maximum was 2%.

All three were classified `DATA_BLOCKED`; calculated P&L was diagnostic only. The rules were not repaired after viewing results, and no later price was silently substituted.

## 15. Post-open research

A separate EDGE2 namespace ignored 09:15–09:19 and used only post-open prices. Coverage passed in authoritative [run 34768354081](https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34768354081).

| Candidate | Trades | Normal net P&L | Profit factor | 5-bps P&L | 10-bps P&L | Decision |
|---|---:|---:|---:|---:|---:|---|
| ST1 three-day pullback | 17 | −₹709.26 | 0.876 | −₹1,116.46 | −₹1,795.12 | Reject |
| OR1 opening-range breakout | 301 | −₹15,354.39 | 0.513 | −₹22,562.31 | −₹34,575.50 | Reject |
| VP1 VWAP pullback | 23 | −₹1,885.42 | 0.246 | −₹2,435.94 | −₹3,353.48 | Reject |

OR1 supplied an adequate sample and lost money in every discovery year, making it a decisive rejection. ST1 and VP1 also failed sample, profitability, stress, stability and bootstrap gates. No candidate advanced.

## 16. Current research conclusion

No implemented intraday or short-term NIFTYBEES strategy has passed discovery. Repeatedly changing thresholds on the same 2020–2024 sample would create data-mining risk. A defensible next project requires a newly frozen hypothesis and broader, independently acquired instruments—such as liquid sector/index ETFs—or licensed point-in-time NIFTY 200 constituent history. Any future success must still pass untouched validation and holdout before it can be considered research-passed, and separate authorization would be required for paper or live trading.
