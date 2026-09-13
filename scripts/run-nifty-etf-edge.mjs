import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { COST_SCHEDULE, DELIVERY_COST_SCHEDULE } from '../src/nifty-etf-m1/costs.mjs';
import { auditCandles, candlesToCsv, parseCsv } from '../src/nifty-etf-m1/data.mjs';
import { fetchKiteMinuteCandles, verifyKiteInstrument } from '../src/nifty-etf-m1/kite-data.mjs';
import { crossGapInvalidDates, evaluateEdgeGates, runI1, runShortTerm } from '../src/nifty-etf-edge/engine.mjs';
import { groupSessions } from '../src/nifty-etf-m1/engine.mjs';

const config = JSON.parse(fs.readFileSync('research/nifty-etf-edge/frozen-config.json', 'utf8'));
const args = Object.fromEntries(process.argv.slice(2).filter((value) => value.startsWith('--')).map((value) => {
  const [key, ...rest] = value.slice(2).split('='); return [key, rest.join('=')];
}));
const stage = args.stage ?? 'discovery';
if (!['discovery', 'validation', 'holdout'].includes(stage)) throw new Error(`Unknown stage ${stage}`);
const outDir = args.out ?? `artifacts/nifty-etf-edge/${stage}`;

function shiftDays(text, amount) {
  const value = new Date(`${text}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
function todayIndia() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function write(relative, value) {
  const file = path.join(outDir, relative); fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value); return file;
}
function csv(rows) {
  if (!rows.length) return '\n';
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value) => {
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return `${[keys.join(','), ...rows.map((row) => keys.map((key) => escape(row[key])).join(','))].join('\n')}\n`;
}
function writeChecksums() {
  const files = [];
  const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file); else if (!file.endsWith('checksums.sha256')) files.push(file);
  });
  walk(outDir);
  write('checksums.sha256', `${files.sort().map((file) => `${sha256(fs.readFileSync(file))}  ${path.relative(outDir, file)}`).join('\n')}\n`);
}
function parseCandles(text) {
  return parseCsv(text).map((row) => ({
    timestamp: row.timestamp, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume ?? 0),
  }));
}
function loadGzip(file, expectedSha, label) {
  const text = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');
  const actual = sha256(text);
  if (expectedSha && actual !== expectedSha) throw new Error(`${label} CSV checksum mismatch: ${actual} != ${expectedSha}`);
  return { text, candles: parseCandles(text), sha256: actual };
}
function priorPassingCandidates() {
  if (stage === 'discovery') return ['S1', 'S2', 'I1'];
  const prior = stage === 'validation' ? 'discovery' : 'validation';
  const file = `research/nifty-etf-edge/evidence/${prior}/gate.json`;
  if (!fs.existsSync(file)) throw new Error(`SEALED_STAGE_BLOCKED: missing ${file}`);
  const gate = JSON.parse(fs.readFileSync(file, 'utf8'));
  const passing = Object.entries(gate.strategies ?? {}).filter(([, value]) => value.decision === 'PASS').map(([id]) => id);
  if (!passing.length) throw new Error(`SEALED_STAGE_BLOCKED: no candidate passed ${prior}`);
  return passing;
}

async function acquire(period) {
  if (args['signal-file'] && args['execution-file']) {
    return {
      source: 'Checksummed Zerodha Kite artifact replay',
      signal: loadGzip(args['signal-file'], stage === 'discovery' ? config.sourceArtifact.signalCsvSha256 : null, 'signal'),
      execution: loadGzip(args['execution-file'], stage === 'discovery' ? config.sourceArtifact.executionCsvSha256 : null, 'execution'),
      instruments: null,
    };
  }
  const apiKey = process.env.KITE_API_KEY, accessToken = process.env.KITE_ACCESS_TOKEN;
  const executionInstrument = await verifyKiteInstrument({ apiKey, accessToken, expected: { exchange: 'NSE', kiteSegment: 'NSE', tradingSymbol: 'NIFTYBEES', instrumentType: 'EQ' } });
  const signalInstrument = await verifyKiteInstrument({ apiKey, accessToken, expected: { exchange: 'NSE', kiteSegment: 'INDICES', tradingSymbol: 'NIFTY 50', instrumentType: 'EQ' } });
  const prehistoryStart = shiftDays(period.start, -500);
  const signalFetched = await fetchKiteMinuteCandles({ apiKey, accessToken, instrumentToken: signalInstrument.instrumentToken, start: prehistoryStart, end: period.end });
  const executionFetched = await fetchKiteMinuteCandles({ apiKey, accessToken, instrumentToken: executionInstrument.instrumentToken, start: prehistoryStart, end: period.end });
  const signalText = candlesToCsv(signalFetched.candles), executionText = candlesToCsv(executionFetched.candles);
  return {
    source: 'Zerodha Kite Connect', instruments: { signal: signalInstrument, execution: executionInstrument },
    signal: { text: signalText, candles: signalFetched.candles, sha256: sha256(signalText), chunks: signalFetched.chunks },
    execution: { text: executionText, candles: executionFetched.candles, sha256: sha256(executionText), chunks: executionFetched.chunks },
  };
}

async function main() {
  const candidates = priorPassingCandidates();
  const period = { ...config.periods[stage] };
  if (period.end === 'LATEST_FULL_SESSION') period.end = shiftDays(todayIndia(), -1);
  fs.mkdirSync(outDir, { recursive: true });
  write('config.json', `${JSON.stringify(config, null, 2)}\n`);
  write('cost-schedules.json', `${JSON.stringify({ intraday: COST_SCHEDULE, delivery: DELIVERY_COST_SCHEDULE }, null, 2)}\n`);
  write('opened-candidates.json', `${JSON.stringify({ stage, candidates }, null, 2)}\n`);
  let acquired;
  try { acquired = await acquire(period); }
  catch (error) {
    write('status.json', `${JSON.stringify({ stage, status: 'DATA_BLOCKED', error: error.message }, null, 2)}\n`);
    writeChecksums(); process.stdout.write(`DATA_BLOCKED: ${error.message}\n`); return;
  }
  if (acquired.instruments) write('instruments.json', `${JSON.stringify(acquired.instruments, null, 2)}\n`);
  const prehistoryStart = shiftDays(period.start, -500);
  const signalAudit = auditCandles(acquired.signal.candles, { start: prehistoryStart, end: period.end, source: `${acquired.source} NIFTY 50 one-minute candles` });
  const executionAudit = auditCandles(acquired.execution.candles, { start: prehistoryStart, end: period.end, source: `${acquired.source} NIFTYBEES one-minute candles` });
  const divergence = crossGapInvalidDates(signalAudit.candles, executionAudit.candles, config.integrity.maximumCrossInstrumentOpenGapDivergence);
  const stageSessions = groupSessions(executionAudit.candles).filter((row) => row.date >= period.start && row.date <= period.end);
  const integrity = {
    requested: period, signal: { ...signalAudit.report, chunks: acquired.signal.chunks ?? null }, execution: { ...executionAudit.report, chunks: acquired.execution.chunks ?? null },
    stageObservedSessions: stageSessions.length, crossInstrumentOpenGapDivergence: { threshold: config.integrity.maximumCrossInstrumentOpenGapDivergence, count: divergence.filter((row) => row.date >= period.start && row.date <= period.end).length, rows: divergence.filter((row) => row.date >= period.start && row.date <= period.end) },
  };
  write('data-integrity.json', `${JSON.stringify(integrity, null, 2)}\n`);
  write('data/nifty-50-1m.csv.gz', zlib.gzipSync(acquired.signal.text, { level: 9 }));
  write('data/niftybees-1m.csv.gz', zlib.gzipSync(acquired.execution.text, { level: 9 }));
  write('data-manifest.json', `${JSON.stringify({
    source: acquired.source, period, signalBars: signalAudit.candles.length, executionBars: executionAudit.candles.length,
    signalCsvSha256: acquired.signal.sha256, executionCsvSha256: acquired.execution.sha256,
    sourceArtifact: args['signal-file'] ? config.sourceArtifact : null, sourceCommitSha: process.env.GITHUB_SHA ?? null,
    workflowRun: process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
  }, null, 2)}\n`);
  const invalidDates = new Set(divergence.map((row) => row.date));
  const results = {};
  if (candidates.includes('S1')) results.S1 = runShortTerm('S1', signalAudit.candles, executionAudit.candles, config, period, invalidDates);
  if (candidates.includes('S2')) results.S2 = runShortTerm('S2', signalAudit.candles, executionAudit.candles, config, period, invalidDates);
  if (candidates.includes('I1')) results.I1 = runI1(signalAudit.candles, executionAudit.candles, config, period, invalidDates);
  const gates = {};
  for (const [id, result] of Object.entries(results)) {
    gates[id] = evaluateEdgeGates(id, result, stageSessions.length, config, stage);
    write(`summaries/${id}.json`, `${JSON.stringify({ summary: result.summary, bootstrap: result.bootstrap, concentration: result.concentration, rejectedSessions: result.rejectedSessions, noSignalSessions: result.noSignalSessions }, null, 2)}\n`);
    for (const [scenario, rows] of Object.entries(result.trades)) write(`trades/${id}-${scenario}.csv`, csv(rows));
  }
  const gate = { stage, strategies: gates, allPassed: Object.values(gates).every((value) => value.decision === 'PASS') };
  write('gate.json', `${JSON.stringify(gate, null, 2)}\n`);
  const statuses = Object.fromEntries(Object.entries(gates).map(([id, value]) => [id, value.decision === 'DATA_BLOCKED'
    ? 'DATA_BLOCKED'
    : value.decision === 'PASS' ? (stage === 'holdout' ? 'RESEARCH_PASSED_NOT_AUTHORIZED' : `${stage.toUpperCase()}_PASSED`)
      : `${stage.toUpperCase()}_REJECTED`]));
  write('status.json', `${JSON.stringify({ stage, strategies: statuses, generatedAt: new Date().toISOString() }, null, 2)}\n`);
  write('REPORT.md', `# NIFTYBEES short-term edge ${stage}\n\n${Object.entries(statuses).map(([id, status]) => `- **${id}: ${status}**`).join('\n')}\n\nNo paper or live trading was activated.\n`);
  writeChecksums(); process.stdout.write(`${JSON.stringify(statuses)}\n`);
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
