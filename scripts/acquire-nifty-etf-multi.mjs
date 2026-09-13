import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { candlesToCsv } from '../src/nifty-etf-m1/data.mjs';
import { fetchKiteDailyCandles, verifyKiteInstrument } from '../src/nifty-etf-m1/kite-data.mjs';

const symbols = ['NIFTYBEES', 'BANKBEES', 'JUNIORBEES', 'ITBEES', 'GOLDBEES'];
const start = '2018-01-01', end = '2024-12-31', outDir = 'artifacts/nifty-etf-multi/discovery-data';
const apiKey = process.env.KITE_API_KEY, accessToken = process.env.KITE_ACCESS_TOKEN;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
function write(relative, value) { const file = path.join(outDir, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); }
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

async function main() {
  const manifest = { source: 'Zerodha Kite Connect', interval: 'day', requested: { start, end }, sourceCommitSha: process.env.GITHUB_SHA ?? null, workflowRun: process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null, instruments: {} };
  for (const symbol of symbols) {
    const instrument = await verifyKiteInstrument({ apiKey, accessToken, expected: { exchange: 'NSE', kiteSegment: 'NSE', tradingSymbol: symbol, instrumentType: 'EQ' } });
    const fetched = await fetchKiteDailyCandles({ apiKey, accessToken, instrumentToken: instrument.instrumentToken, start, end });
    const text = candlesToCsv(fetched.candles), digest = sha256(text);
    write(`data/${symbol.toLowerCase()}.csv.gz`, zlib.gzipSync(text, { level: 9 }));
    const report = audit(symbol, fetched.candles);
    write(`integrity/${symbol.toLowerCase()}.json`, `${JSON.stringify(report, null, 2)}\n`);
    manifest.instruments[symbol] = { instrumentToken: instrument.instrumentToken, isin: instrument.match.isin, name: instrument.match.name, firstTimestamp: report.firstTimestamp, lastTimestamp: report.lastTimestamp, rows: report.rows, csvSha256: digest, masterSha256: instrument.masterSha256, chunks: fetched.chunks };
  }
  write('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  const files = [];
  const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => { const file = path.join(directory, entry.name); if (entry.isDirectory()) walk(file); else if (!file.endsWith('checksums.sha256')) files.push(file); });
  walk(outDir); write('checksums.sha256', `${files.sort().map((file) => `${sha256(fs.readFileSync(file))}  ${path.relative(outDir, file)}`).join('\n')}\n`);
  process.stdout.write(`${JSON.stringify(Object.fromEntries(Object.entries(manifest.instruments).map(([symbol, item]) => [symbol, item.rows])))}\n`);
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
