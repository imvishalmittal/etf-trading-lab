# NIFTYBEES post-open edge discovery evidence

## Verdict

- ST1: **DISCOVERY_REJECTED**
- OR1: **DISCOVERY_REJECTED**
- VP1: **DISCOVERY_REJECTED**
- Validation and holdout: **SEALED**
- Paper/live trading: **NOT AUTHORIZED**

Unlike EDGE1, coverage passed. These are economic rejections.

## Provenance and integrity

- Authoritative run: https://github.com/imvishalmittal/etf-trading-lab/actions/runs/34768354081
- Source commit: `e7f98a0fccc9c2fc07bfcef11e2cfb82add812f4`
- Artifact ID: `10321169167`
- Artifact ZIP SHA-256: `e8e650cc6850ce4e4cbb2558cff82945a76d89efe8770f1ebbade49f5c15ab9f`
- Period: 1 January 2020–31 December 2024
- NIFTYBEES bars: 463,635
- Observed sessions: 1,243
- Rejected sessions: ST1 13 (1.05%); OR1/VP1 21 (1.69%)
- Frozen maximum rejected-session rate: 2%
- All result-file checksums verified.

## Results

| Candidate | Trades | Wins / losses | Normal net P&L | PF | 5-bps P&L | 10-bps P&L | Max drawdown |
|---|---:|---:|---:|---:|---:|---:|---:|
| ST1 | 17 | 8 / 9 | −₹709.26 | 0.876 | −₹1,116.46 | −₹1,795.12 | ₹2,688.53 |
| OR1 | 301 | 123 / 178 | −₹15,354.39 | 0.513 | −₹22,562.31 | −₹34,575.50 | ₹16,031.14 |
| VP1 | 23 | 7 / 16 | −₹1,885.42 | 0.246 | −₹2,435.94 | −₹3,353.48 | ₹2,050.24 |

ST1 failed trade count, profitability, stress, stability, bootstrap, and concentration gates. OR1 lost money in every discovery year and exceeded the drawdown gate. VP1 had too few trades and lost money in every discovery year. No candidate advances.

## Interpretation

Waiting until after 09:20 fixed the opening-data problem but did not reveal a usable NIFTYBEES edge. OR1 generated adequate sample size and failed decisively, making it the strongest rejection. Intraday fees and slippage materially worsened OR1 and VP1, but both were already weak under normal assumptions.
