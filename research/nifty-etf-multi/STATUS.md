# Multi-ETF research status

- Instrument list and discovery data period: **FROZEN**
- Data acquisition: **COMPLETE — INTEGRITY PASSED**
- Strategy definitions: **FROZEN — RETURNS NOT YET CALCULATED**
- Candidates: `XR1` weekly rotation, `MR1` oversold pullback, `BO1` breakout
- Deterministic engine: **IMPLEMENTED; 58 TESTS PASS**
- Discovery: **XR1, MR1 AND BO1 — DISCOVERY_REJECTED**
- Validation: **SEALED**
- Holdout: **SEALED**
- Paper/live trading: **NOT AUTHORIZED**

Authoritative acquisition evidence:

- Workflow: [run 34772431861, attempt 2](https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34772431861)
- Source commit: `a8bfed067d5f5ebfc08321d8862c79d05b8ed0ac`
- Artifact: `10322457623`
- Artifact ZIP SHA-256: `1ba7d90cd83e662ba0c2946a80c5493892411c85475d9375483ea87f788086c8`
- Internal checksum verification: **PASSED**

| Instrument | First observation | Last observation | Rows | Integrity defects |
|---|---|---|---:|---:|
| `NIFTYBEES` | 2018-01-01 | 2024-12-31 | 1,733 | 0 |
| `BANKBEES` | 2018-01-01 | 2024-12-31 | 1,733 | 0 |
| `JUNIORBEES` | 2018-01-01 | 2024-12-31 | 1,733 | 0 |
| `ITBEES` | 2020-07-01 | 2024-12-31 | 1,120 | 0 |
| `GOLDBEES` | 2018-01-01 | 2024-12-31 | 1,732 | 0 |

Integrity defects count duplicate dates, invalid OHLC, non-positive prices, zero-volume dates, and close-to-close moves above 15%. `ITBEES` begins at its actual 2020 listing; no pre-listing history was fabricated.

Discovery evidence: [run 34794327066](https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34794327066), artifact `10328862790`. XR1 failed only the frozen single-year concentration gate; MR1 and BO1 failed multiple economic or robustness gates. See [discovery results](evidence/discovery/RESULTS.md).

User-authorized post-selection OOS diagnostic for unchanged XR1 and BO1:

- Protocol: **FROZEN BEFORE 2025/2026 ACQUISITION**
- Performance: 2025 and 2026 YTD, reported separately and continuously combined
- Data acquisition and integrity: **COMPLETE — PASSED**
- XR1 verdict: **OOS_DOES_NOT_CONFIRM**
- BO1 verdict: **OOS_DOES_NOT_CONFIRM**
- Original discovery verdict: **UNCHANGED**
- Paper/live trading: **NOT AUTHORIZED**

Authoritative OOS evidence: [run 34800068186](https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34800068186), artifact `10331226835`, artifact digest `sha256:8009d87f2cc35a08b6d886c80e1353d15946300af15577e896019e2075b864f7`. See [OOS results](oos/RESULTS.md).

User-authorized unified-run follow-up:

- Research design: **SEPARATE DISCOVERY, VALIDATION AND HOLDOUT RESULTS IN ONE WORKFLOW RUN**
- New candidates: `XR2` diversified two-leader rotation and `BO2` breadth-confirmed breakout
- Discovery: **2020–2024**
- Validation: **2025**
- Holdout/OOS: **2026 THROUGH 11 SEPTEMBER**
- Execution: **ALL PERIODS ALWAYS CALCULATED TOGETHER; NO SEPARATE GATED RUNS**
- Protocol: **FROZEN BEFORE XR2/BO2 CALCULATION**
- Combined summary: **CONTEXT ONLY; CANNOT OFFSET A FAILED PERIOD**
- Interpretation if successful: **HISTORICAL SUPPORT ONLY; PROSPECTIVE PAPER OBSERVATION STILL REQUIRED**
- Paper/live trading: **NOT AUTHORIZED**

See the [combined frozen specification](combined/FROZEN_SPEC.md).
