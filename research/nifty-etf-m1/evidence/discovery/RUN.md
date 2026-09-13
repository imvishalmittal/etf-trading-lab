# Authoritative discovery checkpoint

- Workflow run: <https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34735625754>
- Source branch commit: `01c133cf15ac134e9621cf3658f4f9b388e84691`
- Pull-request merge-test SHA used by Actions: `0c03cdfdbb0f70417e43b635def476c9385a5fd3`
- Artifact ID: `10310034652`
- Artifact name: `nifty-etf-m1-discovery-0c03cdfdbb0f70417e43b635def476c9385a5fd3`
- Artifact ZIP SHA-256: `f45982253daa0ab4ecbbcf811e07b57a1e3c59ae0c4add40d9b4217e3fa6d497`
- CI run: <https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34735625720>
- Result: `DATA_BLOCKED`

The public Groww instrument master was reachable and verified the exact NSE cash mapping. The repository exposed none of `GROWW_TOTP_TOKEN`, `GROWW_TOTP_SECRET`, or `GROWW_ACCESS_TOKEN` to the workflow, so the authenticated one-minute endpoint could not be opened. Coverage is exactly zero bars and zero sessions for the requested 2020–2024 period. No substitute dataset was used.

Because discovery produced no economic evidence, no discovery gate exists, validation remains sealed, and holdout remains sealed.
