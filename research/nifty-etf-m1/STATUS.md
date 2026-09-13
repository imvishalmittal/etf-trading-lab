# NIFTY-ETF-M1 research status

- Strategy rules and gates: **FROZEN**
- Discovery: **DISCOVERY_REJECTED** — authoritative Kite run 34747293750 acquired 463,635 one-minute bars across 1,243 observed sessions. M1 lost ₹98,043.59 normally, had profit factor 0.348, and failed 13 frozen gates.
- Validation: **SEALED**
- Holdout: **SEALED**
- Paper/live status: **NOT_AUTHORIZED**

The legacy ETF-floor strategies remain `RESEARCH_REJECTED`, their paper workflows remain disabled, and the dashboard remains a read-only archive.

The earlier Groww zero-coverage artifact remains preserved under `evidence/discovery/`; the terminal Kite evidence is under `evidence/kite-discovery/`. Validation and holdout remain sealed because discovery failed. No substitute data was used, no paper/live workflow was activated, and the research modules contain no broker-order endpoint.
