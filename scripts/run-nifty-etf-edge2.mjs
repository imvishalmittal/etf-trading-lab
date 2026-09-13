import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { COST_SCHEDULE, DELIVERY_COST_SCHEDULE } from '../src/nifty-etf-m1/costs.mjs';
import { auditCandles, candlesToCsv, parseCsv } from '../src/nifty-etf-m1/data.mjs';
import { fetchKiteMinuteCandles, verifyKiteInstrument } from '../src/nifty-etf-m1/kite-data.mjs';
import { evaluateGates, runIntraday, runST1 } from '../src/nifty-etf-edge2/engine.mjs';
import { groupSessions } from '../src/nifty-etf-m1/engine.mjs';

const config = JSON.parse(fs.readFileSync('research/nifty-etf-edge2/frozen-config.json', 'utf8'));
const args = Object.fromEntries(process.argv.slice(2).filter((value) => value.startsWith('--')).map((value) => { const [key, ...rest] = value.slice(2).split('='); return [key, rest.join('=')]; }));
const stage = args.stage ?? 'discovery';
if (!['discovery', 'validation', 'holdout'].includes(stage)) throw new Error(`Unknown stage ${stage}`);
const outDir = args.out ?? `artifacts/nifty-etf-edge2/${stage}`;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const shiftDays = (text, amount) => { const value = new Date(`${text}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + amount); return value.toISOString().slice(0, 10); };
const todayIndia = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};
function write(relative, value) { const file = path.join(outDir, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); }
function csv(rows) {
  if (!rows.length) return '\n';
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value) => { const text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
  return `${[keys.join(','), ...rows.map((row) => keys.map((key) => escape(row[key])).join(','))].join('\n')}\n`;
}
function checksums() {
  const files = [];
  const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => { const file = path.join(directory, entry.name); if (entry.isDirectory()) walk(file); else if (!file.endsWith('checksums.sha256')) files.push(file); });
  walk(outDir); write('checksums.sha256', `${files.sort().map((file) => `${sha256(fs.readFileSync(file))}  ${path.relative(outDir, file)}`).join('\n')}\n`);
}
const parseCandles = (text) => parseCsv(text).map((row) => ({ timestamp: row.timestamp, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume ?? 0) }));
function load(file, expected, label) { const text = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'), actual = sha256(text); if (expected && actual !== expected) throw new Error(`${label} checksum mismatch`); return { text, candles: parseCandles(text), sha256: actual }; }
function candidates() {
  if (stage === 'discovery') return ['ST1', 'OR1', 'VP1'];
  const prior = stage === 'validation' ? 'discovery' : 'validation', file = `research/nifty-etf-edge2/evidence/${prior}/gate.json`;
  if (!fs.existsSync(file)) throw new Error(`SEALED_STAGE_BLOCKED: missing ${file}`);
  const gate = JSON.parse(fs.readFileSync(file, 'utf8'));
  const passing = Object.entries(gate.strategies ?? {}).filter(([, value]) => value.decision === 'PASS').map(([id]) => id);
  if (!passing.length) throw new Error(`SEALED_STAGE_BLOCKED: no candidate passed ${prior}`);
  return passing;
}
async function acquire(period) {
  if (args['signal-file'] && args['execution-file']) return { source: 'Checksummed Zerodha Kite artifact replay', signal: load(args['signal-file'], stage === 'discovery' ? config.sourceArtifact.signalCsvSha256 : null, 'signal'), execution: load(args['execution-file'], stage === 'discovery' ? config.sourceArtifact.executionCsvSha256 : null, 'execution') };
  const apiKey = process.env.KITE_API_KEY, accessToken = process.env.KITE_ACCESS_TOKEN;
  const executionInstrument = await verifyKiteInstrument({ apiKey, accessToken, expected: { exchange: 'NSE', kiteSegment: 'NSE', tradingSymbol: 'NIFTYBEES', instrumentType: 'EQ' } });
  const signalInstrument = await verifyKiteInstrument({ apiKey, accessToken, expected: { exchange: 'NSE', kiteSegment: 'INDICES', tradingSymbol: 'NIFTY 50', instrumentType: 'EQ' } });
  const start = shiftDays(period.start, -500);
  const signalFetched = await fetchKiteMinuteCandles({ apiKey, accessToken, instrumentToken: signalInstrument.instrumentToken, start, end: period.end });
  const executionFetched = await fetchKiteMinuteCandles({ apiKey, accessToken, instrumentToken: executionInstrument.instrumentToken, start, end: period.end });
  const signalText = candlesToCsv(signalFetched.candles), executionText = candlesToCsv(executionFetched.candles);
  return { source: 'Zerodha Kite Connect', signal: { text: signalText, candles: signalFetched.candles, sha256: sha256(signalText) }, execution: { text: executionText, candles: executionFetched.candles, sha256: sha256(executionText) }, instruments: { signal: signalInstrument, execution: executionInstrument } };
}

async function main() {
  const opened = candidates(), period = { ...config.periods[stage] }; if (period.end === 'LATEST_FULL_SESSION') period.end = shiftDays(todayIndia(), -1);
  write('config.json', `${JSON.stringify(config, null, 2)}\n`); write('cost-schedules.json', `${JSON.stringify({ intraday: COST_SCHEDULE, delivery: DELIVERY_COST_SCHEDULE }, null, 2)}\n`); write('opened-candidates.json', `${JSON.stringify({ stage, candidates: opened }, null, 2)}\n`);
  let acquired;
  try { acquired = await acquire(period); } catch (error) { write('status.json', `${JSON.stringify({ stage, status: 'DATA_BLOCKED', error: error.message }, null, 2)}\n`); checksums(); process.stdout.write(`DATA_BLOCKED: ${error.message}\n`); return; }
  if (acquired.instruments) write('instruments.json', `${JSON.stringify(acquired.instruments, null, 2)}\n`);
  const start = shiftDays(period.start, -500), signalAudit = auditCandles(acquired.signal.candles, { start, end: period.end, source: `${acquired.source} NIFTY 50 one-minute candles` }), executionAudit = auditCandles(acquired.execution.candles, { start, end: period.end, source: `${acquired.source} NIFTYBEES one-minute candles` });
  const observed = groupSessions(executionAudit.candles).filter((row) => row.date >= period.start && row.date <= period.end).length;
  write('data-integrity.json', `${JSON.stringify({ requested: period, signal: signalAudit.report, execution: executionAudit.report, stageObservedSessions: observed, ignoredOpeningWindow: '09:15-09:19' }, null, 2)}\n`);
  write('data/nifty-50-1m.csv.gz', zlib.gzipSync(acquired.signal.text, { level: 9 })); write('data/niftybees-1m.csv.gz', zlib.gzipSync(acquired.execution.text, { level: 9 }));
  write('data-manifest.json', `${JSON.stringify({ source: acquired.source, period, signalBars: signalAudit.candles.length, executionBars: executionAudit.candles.length, signalCsvSha256: acquired.signal.sha256, executionCsvSha256: acquired.execution.sha256, sourceArtifact: args['signal-file'] ? config.sourceArtifact : null, sourceCommitSha: process.env.GITHUB_SHA ?? null, workflowRun: process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null }, null, 2)}\n`);
  const results = {};
  if (opened.includes('ST1')) results.ST1 = runST1(signalAudit.candles, executionAudit.candles, config, period);
  if (opened.includes('OR1')) results.OR1 = runIntraday('OR1', signalAudit.candles, executionAudit.candles, config, period);
  if (opened.includes('VP1')) results.VP1 = runIntraday('VP1', signalAudit.candles, executionAudit.candles, config, period);
  const gates = {};
  for (const [id, result] of Object.entries(results)) {
    gates[id] = evaluateGates(id, result, observed, config, stage);
    write(`summaries/${id}.json`, `${JSON.stringify({ summary: result.summary, bootstrap: result.bootstrap, concentration: result.concentration, rejectedSessions: result.rejectedSessions, noSignalSessions: result.noSignalSessions }, null, 2)}\n`);
    for (const [scenario, rows] of Object.entries(result.trades)) write(`trades/${id}-${scenario}.csv`, csv(rows));
  }
  const gate = { stage, strategies: gates, allPassed: Object.values(gates).every((value) => value.decision === 'PASS') }; write('gate.json', `${JSON.stringify(gate, null, 2)}\n`);
  const statuses = Object.fromEntries(Object.entries(gates).map(([id, value]) => [id, value.decision === 'DATA_BLOCKED' ? 'DATA_BLOCKED' : value.decision === 'PASS' ? (stage === 'holdout' ? 'RESEARCH_PASSED_NOT_AUTHORIZED' : `${stage.toUpperCase()}_PASSED`) : `${stage.toUpperCase()}_REJECTED`]));
  write('status.json', `${JSON.stringify({ stage, strategies: statuses, generatedAt: new Date().toISOString() }, null, 2)}\n`); write('REPORT.md', `# NIFTYBEES post-open edge ${stage}\n\n${Object.entries(statuses).map(([id, status]) => `- **${id}: ${status}**`).join('\n')}\n\nNo paper or live trading was activated.\n`); checksums(); process.stdout.write(`${JSON.stringify(statuses)}\n`);
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
