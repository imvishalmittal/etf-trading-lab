# NIFTY-ETF-M1 research status

- Strategy rules and gates: **FROZEN**
- Discovery: **DATA_BLOCKED / KITE RECHECK PENDING** — authenticated authoritative run 34735718477 attempt 2 queried all 63 frozen chunks, but Groww returned 0 one-minute bars and 0 sessions for 2020–2024. A read-only Zerodha Kite Connect adapter has been added as an operational data-source repair; it must reproduce adequate 2020–2024 coverage before discovery can execute.
- Validation: **SEALED**
- Holdout: **SEALED**
- Paper/live status: **NOT_AUTHORIZED**

The legacy ETF-floor strategies remain `RESEARCH_REJECTED`, their paper workflows remain disabled, and the dashboard remains a read-only archive.

The Groww discovery artifact and checksums are preserved under `evidence/discovery/`. This supersedes the earlier credential-blocked checkpoint. No substitute data was used and no discovery gate was created, so later stages cannot run. Kite authentication uses the official request-token exchange, and the research modules contain no broker-order endpoint.
