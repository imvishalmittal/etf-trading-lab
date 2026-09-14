# Multi-ETF research status

- Instrument list and discovery data period: **FROZEN**
- Data acquisition: **COMPLETE — INTEGRITY PASSED**
- Strategy definitions: **FROZEN — RETURNS NOT YET CALCULATED**
- Candidates: `XR1` weekly rotation, `MR1` oversold pullback, `BO1` breakout
- Deterministic engine: **IMPLEMENTED; 57 TESTS PASS LOCALLY**
- Discovery: **AUTHORITATIVE GITHUB ACTIONS RUN PENDING**
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
