import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { candlesToCsv } from '../src/nifty-etf-m1/data.mjs';
import { fetchKiteDailyCandles, verifyKiteInstrument } from '../src/nifty-etf-m1/kite-data.mjs';

const configPath = 'research/nifty-etf-xr3/frozen-config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const start = config.periods.warmupStart, end = config.periods.holdout[1];
const outDir = 'artifacts/nifty-etf-xr3/data';
const apiKey = process.env.KITE_API_KEY, accessToken = process.env.KITE_ACCESS_TOKEN;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function write(relative, value) {
  const file = path.join(outDir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

function audit(symbol, candles) {
  const seen = new Set(), duplicateDates = [], invalidOhlcDates = [], zeroVolumeDates = [], extremeCloseMoves = [];
  let prior = null;
  for (const row of candles) {
    const date = row.timestamp.slice(0, 10);
    if (seen.has(date)) duplicateDates.push(date);
    seen.add(date);
    if (![row.open, row.high, row.low, row.close].every((value) => Number.isFinite(value) && value > 0)
      || row.high < Math.max(row.open, row.close) || row.low > Math.min(row.open, row.close)) invalidOhlcDates.push(date);
    if (!(Number(row.volume) > 0)) zeroVolumeDates.push(date);
    if (prior && Math.abs(row.close / prior.close - 1) > 0.15) {
      extremeCloseMoves.push({ date, priorDate: prior.timestamp.slice(0, 10), return: row.close / prior.close - 1 });
    }
    prior = row;
  }
  return {
    symbol, firstTimestamp: candles[0]?.timestamp ?? null, lastTimestamp: candles.at(-1)?.timestamp ?? null,
    rows: candles.length, duplicateDates, invalidOhlcDates, zeroVolumeDates, extremeCloseMoves,
  };
}

function requireIntegrity(report) {
  if (report.rows < 100) throw new Error(`INVALID_DATA: ${report.symbol} has only ${report.rows} daily rows`);
  if (report.duplicateDates.length || report.invalidOhlcDates.length) {
    throw new Error(`INVALID_DATA: ${report.symbol} failed integrity audit`);
  }
}

async function main() {
  const configText = fs.readFileSync(configPath);
  const manifest = {
    researchId: config.researchId,
    source: 'Zerodha Kite Connect', interval: 'day', requested: { start, end },
    configSha256: sha256(configText), sourceCommitSha: process.env.GITHUB_SHA ?? null,
    workflowRun: process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
    instruments: {},
  };
  for (const symbol of config.universe) {
    const instrument = await verifyKiteInstrument({
      apiKey, accessToken,
      expected: { exchange: 'NSE', kiteSegment: 'NSE', tradingSymbol: symbol, instrumentType: 'EQ' },
    });
    const fetched = await fetchKiteDailyCandles({ apiKey, accessToken, instrumentToken: instrument.instrumentToken, start, end });
    const text = candlesToCsv(fetched.candles), digest = sha256(text), report = audit(symbol, fetched.candles);
    requireIntegrity(report);
    write(`data/${symbol.toLowerCase()}.csv.gz`, zlib.gzipSync(text, { level: 9 }));
    write(`integrity/${symbol.toLowerCase()}.json`, `${JSON.stringify(report, null, 2)}\n`);
    manifest.instruments[symbol] = {
      instrumentToken: instrument.instrumentToken, isin: instrument.match.isin, name: instrument.match.name,
      firstTimestamp: report.firstTimestamp, lastTimestamp: report.lastTimestamp, rows: report.rows,
      csvSha256: digest, masterSha256: instrument.masterSha256, chunks: fetched.chunks,
    };
  }
  write('frozen-config.json', configText);
  write('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  const files = [];
  const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file); else if (!file.endsWith('checksums.sha256')) files.push(file);
  });
  walk(outDir);
  write('checksums.sha256', `${files.sort().map((file) => `${sha256(fs.readFileSync(file))}  ${path.relative(outDir, file)}`).join('\n')}\n`);
  process.stdout.write(`${JSON.stringify(Object.fromEntries(Object.entries(manifest.instruments).map(([symbol, item]) => [symbol, item.rows])))}\n`);
}

main().catch((error) => {
  fs.mkdirSync(outDir, { recursive: true });
  write('status.json', `${JSON.stringify({ status: error.message.startsWith('INVALID_DATA') ? 'INVALID_DATA' : 'DATA_BLOCKED', error: error.message, tradingAuthorized: false }, null, 2)}\n`);
  console.error(error.stack || error.message);
  process.exit(1);
});
