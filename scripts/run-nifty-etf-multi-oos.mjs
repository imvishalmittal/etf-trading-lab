import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { candlesToCsv } from '../src/nifty-etf-m1/data.mjs';
import { DELIVERY_COST_SCHEDULE } from '../src/nifty-etf-m1/costs.mjs';
import { fetchKiteDailyCandles, verifyKiteInstrument } from '../src/nifty-etf-m1/kite-data.mjs';
import { evaluateOosCandidate, prepareMarket, runBenchmark, runCandidate } from '../src/nifty-etf-multi/engine.mjs';

const baseConfigText = fs.readFileSync('research/nifty-etf-multi/frozen-config.json', 'utf8');
const baseConfig = JSON.parse(baseConfigText), oosConfig = JSON.parse(fs.readFileSync('research/nifty-etf-multi/oos/frozen-config.json', 'utf8'));
const outDir = 'artifacts/nifty-etf-multi/oos';
const apiKey = process.env.KITE_API_KEY, accessToken = process.env.KITE_ACCESS_TOKEN;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const write = (relative, value) => { const file = path.join(outDir, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
const csv = (rows) => {
  if (!rows.length) return '\n';
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value) => { const text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
  return `${[keys.join(','), ...rows.map((row) => keys.map((key) => escape(row[key])).join(','))].join('\n')}\n`;
};

function audit(symbol, candles) {
  const seen = new Set(), duplicates = [], invalid = [], zeroVolume = [], extremeMoves = [];
  let prior = null;
  for (const row of candles) {
    const date = row.timestamp.slice(0, 10);
    if (seen.has(date)) duplicates.push(date); seen.add(date);
    if (![row.open, row.high, row.low, row.close].every((value) => Number.isFinite(value) && value > 0) || row.high < Math.max(row.open, row.close) || row.low > Math.min(row.open, row.close)) invalid.push(date);
    if (!(Number(row.volume) > 0)) zeroVolume.push(date);
    if (prior && Math.abs(row.close / prior.close - 1) > 0.15) extremeMoves.push({ date, priorDate: prior.timestamp.slice(0, 10), return: row.close / prior.close - 1 });
    prior = row;
  }
  return { symbol, firstTimestamp: candles[0]?.timestamp ?? null, lastTimestamp: candles.at(-1)?.timestamp ?? null, rows: candles.length, duplicateDates: duplicates, invalidOhlcDates: invalid, zeroVolumeDates: zeroVolume, extremeCloseMoves: extremeMoves };
}

function checksums() {
  const files = [];
  const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => { const file = path.join(directory, entry.name); if (entry.isDirectory()) walk(file); else if (!file.endsWith('checksums.sha256')) files.push(file); });
  walk(outDir); write('checksums.sha256', `${files.sort().map((file) => `${sha256(fs.readFileSync(file))}  ${path.relative(outDir, file)}`).join('\n')}\n`);
}

function withoutCurve(result) {
  return Object.fromEntries(Object.entries(result.summary).map(([scenario, value]) => { const { equityCurve, ...summary } = value; return [scenario, summary]; }));
}

async function main() {
  if (oosConfig.baseSpecificationCommit !== 'cd59d9e951deef723c31b3e78430cc15c1955ad0') throw new Error('Frozen base specification provenance changed');
  const [start, end] = oosConfig.dataPeriod, input = {}, integrity = {}, instruments = {};
  for (const symbol of baseConfig.universe) {
    const instrument = await verifyKiteInstrument({ apiKey, accessToken, expected: { exchange: 'NSE', kiteSegment: 'NSE', tradingSymbol: symbol, instrumentType: 'EQ' } });
    const fetched = await fetchKiteDailyCandles({ apiKey, accessToken, instrumentToken: instrument.instrumentToken, start, end });
    input[symbol] = fetched.candles; integrity[symbol] = audit(symbol, fetched.candles);
    const text = candlesToCsv(fetched.candles); write(`data/${symbol.toLowerCase()}.csv.gz`, zlib.gzipSync(text, { level: 9 }));
    instruments[symbol] = { instrumentToken: instrument.instrumentToken, isin: instrument.match.isin, name: instrument.match.name, csvSha256: sha256(text), chunks: fetched.chunks };
  }
  const hardDefects = Object.values(integrity).flatMap((item) => [...item.duplicateDates, ...item.invalidOhlcDates, ...item.zeroVolumeDates]);
  const extremeMoveCount = Object.values(integrity).reduce((total, item) => total + item.extremeCloseMoves.length, 0);
  const lastObserved = integrity.NIFTYBEES.lastTimestamp?.slice(0, 10);
  write('data-integrity.json', `${JSON.stringify({ requested: { start, end }, instruments: integrity, hardDefectCount: hardDefects.length, extremeMoveCount, coverageEndMatched: lastObserved === end }, null, 2)}\n`);
  write('data-manifest.json', `${JSON.stringify({ source: 'Zerodha Kite Connect', interval: 'day', requested: { start, end }, instruments, baseConfigSha256: sha256(baseConfigText), sourceCommitSha: process.env.GITHUB_SHA ?? null, workflowRun: process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null }, null, 2)}\n`);
  if (hardDefects.length) throw new Error(`INVALID_DATA: ${hardDefects.length} hard integrity defects`);
  if (lastObserved !== end) throw new Error(`DATA_BLOCKED: expected final NIFTYBEES observation ${end}, received ${lastObserved ?? 'none'}`);
  const market = prepareMarket(input, baseConfig.universe), period = { start: oosConfig.performancePeriod[0], end: oosConfig.performancePeriod[1] };
  const observed = market.calendar.filter((date) => date >= period.start && date <= period.end).length;
  const benchmark = runBenchmark(market, baseConfig, period), results = {}, gates = {};
  for (const id of oosConfig.selectedCandidates) {
    results[id] = runCandidate(id, market, baseConfig, period);
    gates[id] = evaluateOosCandidate(id, results[id], benchmark, observed, oosConfig);
  }
  write('base-config.json', baseConfigText); write('oos-config.json', `${JSON.stringify(oosConfig, null, 2)}\n`); write('cost-schedule.json', `${JSON.stringify(DELIVERY_COST_SCHEDULE, null, 2)}\n`);
  write('benchmark/Q0.json', `${JSON.stringify(withoutCurve(benchmark), null, 2)}\n`);
  for (const [scenario, rows] of Object.entries(benchmark.trades)) { write(`benchmark/Q0-${scenario}.csv`, csv(rows)); write(`equity/Q0-${scenario}.csv`, csv(benchmark.summary[scenario].equityCurve)); }
  for (const [id, result] of Object.entries(results)) {
    write(`summaries/${id}.json`, `${JSON.stringify({ summary: withoutCurve(result), rejectedActions: result.rejectedActions }, null, 2)}\n`);
    for (const [scenario, rows] of Object.entries(result.trades)) { write(`trades/${id}-${scenario}.csv`, csv(rows)); write(`equity/${id}-${scenario}.csv`, csv(result.summary[scenario].equityCurve)); }
  }
  const statuses = Object.fromEntries(Object.entries(gates).map(([id, value]) => [id, value.decision === 'SUPPORT' ? oosConfig.successStatus : value.decision === 'DATA_BLOCKED' ? 'DATA_BLOCKED' : oosConfig.failureStatus]));
  write('gate.json', `${JSON.stringify({ classification: oosConfig.classification, strategies: gates }, null, 2)}\n`);
  write('status.json', `${JSON.stringify({ strategies: statuses, originalDiscoveryVerdict: 'DISCOVERY_REJECTED', tradingAuthorized: false, generatedAt: new Date().toISOString() }, null, 2)}\n`);
  write('REPORT.md', `# XR1 and BO1 post-selection OOS diagnostic\n\n${Object.entries(statuses).map(([id, status]) => `- **${id}: ${status}**`).join('\n')}\n\nThe original discovery rejection remains unchanged. No paper or live trading was activated.\n`);
  checksums(); process.stdout.write(`${JSON.stringify(statuses)}\n`);
}

main().catch((error) => { write('status.json', `${JSON.stringify({ status: error.message.startsWith('INVALID_DATA') ? 'INVALID_DATA' : 'DATA_BLOCKED', error: error.message, tradingAuthorized: false }, null, 2)}\n`); checksums(); console.error(error.stack || error.message); process.exit(1); });
