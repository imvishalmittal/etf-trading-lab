# Multi-ETF research data specification

Frozen before acquisition on 13 September 2026.

- Source: Zerodha Kite Connect historical daily OHLCV, read-only endpoints only.
- Instruments: NSE cash `NIFTYBEES`, `BANKBEES`, `JUNIORBEES`, `ITBEES`, and `GOLDBEES`.
- Discovery data: 1 January 2018–31 December 2024. The 2018–2019 observations are prehistory for causal indicators; performance discovery will remain 2020–2024.
- Validation data (2025) and holdout data (2026) will not be acquired or inspected unless prior gates pass.
- Required audit: exact instrument master mapping, first/last timestamp, row count, duplicate dates, invalid OHLC, non-positive prices, zero volume, and close-to-close moves above 15%.
- Store CSV/JSON artifacts with SHA-256 checksums and exact workflow provenance.
- No strategy calculation occurs in the acquisition workflow.
- No order endpoint, paper workflow, ledger, dashboard, or account setting may be used or changed.

Point-in-time NIFTY 200 stock research remains out of scope until licensed constituent history is available. This ETF list is predeclared and will not be expanded or reduced in response to returns.
