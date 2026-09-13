# NIFTY-ETF-M1 research status

- Strategy rules and gates: **FROZEN**
- Discovery: **DATA_BLOCKED** — authenticated authoritative run 34735718477 attempt 2 queried all 63 frozen chunks, but Groww returned 0 one-minute bars and 0 sessions for 2020–2024.
- Validation: **SEALED**
- Holdout: **SEALED**
- Paper/live status: **NOT_AUTHORIZED**

The legacy ETF-floor strategies remain `RESEARCH_REJECTED`, their paper workflows remain disabled, and the dashboard remains a read-only archive.

The discovery artifact and checksums are preserved under `evidence/discovery/`. This supersedes the earlier credential-blocked checkpoint. No substitute data was used and no discovery gate was created, so later stages cannot run.
