# Authoritative discovery checkpoint

- Workflow run: <https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34735718477>, attempt 2
- Frozen source branch commit: `8a3c9c4e33709c8edde330fc58de41177f018986`
- Pull-request merge-test SHA used by Actions: `4a12ca866f8a8bf9f939487c8ad5aebfac6e89fc`
- Merged implementation commit: `f2ce20eee5bbb93f47e15773641857d6c84c6b96`
- Artifact ID: `10310593796`
- Artifact name: `nifty-etf-m1-discovery-4a12ca866f8a8bf9f939487c8ad5aebfac6e89fc`
- Artifact ZIP SHA-256: `735147c35cbbc62b80d21e2a64e437584e56a86429b050f8c2f3292d11f45680`
- Post-merge CI: <https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34735756752>
- Result: `DATA_BLOCKED`

The added `GROWW_ACCESS_TOKEN` authenticated successfully. The public Groww instrument master verified the exact NSE cash mapping, and the workflow queried all 63 consecutive 29-calendar-day chunks covering 2020-01-01 through 2024-12-31. Groww returned no one-minute candles in any chunk. Coverage is exactly zero bars and zero sessions. The empty raw CSV checksum is `8c16152e4bd556aa7ba69aead7982b82cc8f295ef97ea18da2ced47a86975d0b`. No substitute dataset was used.

Because discovery produced no economic evidence, no discovery gate exists, validation remains sealed, and holdout remains sealed.
