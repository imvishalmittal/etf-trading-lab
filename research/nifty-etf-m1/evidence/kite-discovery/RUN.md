# Authoritative Kite discovery run

- Workflow: <https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34747293750>
- Source commit: `b0f67172fe099acfef7ce929e091a6ff897d618e`
- Artifact ID: `10314478066`
- Artifact ZIP SHA-256: `f9ed28fe8cf2394f39dbf85e9b028f2ebbd64abe5400beb7a67c4719c81c2a3c`
- Period: 2020-01-01 through 2024-12-31
- Result: `DISCOVERY_REJECTED`

Zerodha Kite returned 463,635 genuine NIFTYBEES one-minute bars covering the entire frozen interval. There were 1,243 observed sessions, 1,235 eligible sessions and eight rejected sessions. No duplicate, conflicting, out-of-order, non-positive or impossible OHLC bar was found. Forty-nine opening gaps above 10% were recorded for manual/microstructure review and were not silently altered.

M1 normal net P&L was -₹98,043.59, profit factor 0.348 and maximum drawdown ₹98,381.37. Stress net P&L was -₹109,560.53 and severe-stress net P&L was -₹128,755.44. M1 failed 13 predeclared gates, so validation and holdout remain sealed.

The complete compressed minute dataset, all twelve complete trade ledgers, monthly/yearly CSVs and diagnostics remain in the checksummed workflow artifact. No paper or live trading was authorized or activated.
