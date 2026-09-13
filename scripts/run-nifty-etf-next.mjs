import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { auditCandles, candlesToCsv } from '../src/nifty-etf-m1/data.mjs';
import { COST_SCHEDULE, DELIVERY_COST_SCHEDULE } from '../src/nifty-etf-m1/costs.mjs';
import { fetchKiteMinuteCandles, verifyKiteInstrument } from '../src/nifty-etf-m1/kite-data.mjs';
import { evaluateIntradayGates, evaluatePositionalGates, runIntradayStrategies, runPositionalStrategies } from '../src/nifty-etf-next/engine.mjs';

const config = JSON.parse(fs.readFileSync('research/nifty-etf-next/frozen-config.json', 'utf8'));
const args = Object.fromEntries(process.argv.slice(2).filter((x) => x.startsWith('--')).map((x) => {
  const [key, ...value] = x.slice(2).split('='); return [key, value.join('=')];
}));
const stage = args.stage ?? 'discovery';
if (!['discovery', 'validation', 'holdout'].includes(stage)) throw new Error(`Unknown stage ${stage}`);
const outDir = args.out ?? `artifacts/nifty-etf-next/${stage}`;

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
  const escape = (value) => { const text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
  return `${[keys.join(','), ...rows.map((row) => keys.map((key) => escape(row[key])).join(','))].join('\n')}\n`;
}
function writeChecksums() {
  const files = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file); else if (!file.endsWith('checksums.sha256')) files.push(file);
  });
  walk(outDir);
  write('checksums.sha256', `${files.sort().map((file) => `${sha256(fs.readFileSync(file))}  ${path.relative(outDir, file)}`).join('\n')}\n`);
}
function priorPassingCandidates() {
  if (stage === 'discovery') return ['T1', 'G1', 'P1'];
  const prior = stage === 'validation' ? 'discovery' : 'validation';
  const file = `research/nifty-etf-next/evidence/${prior}/gate.json`;
  if (!fs.existsSync(file)) throw new Error(`SEALED_STAGE_BLOCKED: missing ${file}`);
  const gate = JSON.parse(fs.readFileSync(file, 'utf8'));
  const passing = Object.entries(gate.strategies ?? {}).filter(([, value]) => value.decision === 'PASS').map(([id]) => id);
  if (!passing.length) throw new Error(`SEALED_STAGE_BLOCKED: no candidate passed ${prior}`);
  return passing;
}

async function main() {
  const candidates = priorPassingCandidates();
  const period = { ...config.periods[stage] };
  if (period.end === 'LATEST_FULL_SESSION') period.end = shiftDays(todayIndia(), -1);
  fs.mkdirSync(outDir, { recursive: true });
  write('config.json', `${JSON.stringify(config, null, 2)}\n`);
  write('cost-schedules.json', `${JSON.stringify({ intraday: COST_SCHEDULE, delivery: DELIVERY_COST_SCHEDULE }, null, 2)}\n`);
  write('opened-candidates.json', `${JSON.stringify({ stage, candidates }, null, 2)}\n`);

  let executionInstrument, signalInstrument, signalFetched, executionFetched;
  try {
    executionInstrument = await verifyKiteInstrument({ apiKey: process.env.KITE_API_KEY, accessToken: process.env.KITE_ACCESS_TOKEN, expected: config.instruments.execution });
    signalInstrument = await verifyKiteInstrument({ apiKey: process.env.KITE_API_KEY, accessToken: process.env.KITE_ACCESS_TOKEN, expected: config.instruments.signal });
    write('instruments.json', `${JSON.stringify({ execution: executionInstrument, signal: signalInstrument }, null, 2)}\n`);
    const prehistoryStart = shiftDays(period.start, -450);
    signalFetched = await fetchKiteMinuteCandles({ apiKey: process.env.KITE_API_KEY, accessToken: process.env.KITE_ACCESS_TOKEN, instrumentToken: signalInstrument.instrumentToken, start: prehistoryStart, end: period.end });
    executionFetched = await fetchKiteMinuteCandles({ apiKey: process.env.KITE_API_KEY, accessToken: process.env.KITE_ACCESS_TOKEN, instrumentToken: executionInstrument.instrumentToken, start: period.start, end: period.end });
  } catch (error) {
    const status = { stage, status: 'DATA_BLOCKED', error: error.message };
    write('status.json', `${JSON.stringify(status, null, 2)}\n`); writeChecksums();
    process.stdout.write(`DATA_BLOCKED: ${error.message}\n`); return;
  }
  const signalAudit = auditCandles(signalFetched.candles, { start: shiftDays(period.start, -450), end: period.end, source: 'Zerodha Kite NIFTY 50 one-minute candles' });
  const executionAudit = auditCandles(executionFetched.candles, { ...period, source: 'Zerodha Kite NIFTYBEES one-minute candles' });
  const integrity = { requested: period, signal: { ...signalAudit.report, chunks: signalFetched.chunks }, execution: { ...executionAudit.report, chunks: executionFetched.chunks } };
  write('data-integrity.json', `${JSON.stringify(integrity, null, 2)}\n`);
  const signalCsv = Buffer.from(candlesToCsv(signalAudit.candles));
  const executionCsv = Buffer.from(candlesToCsv(executionAudit.candles));
  write('data/nifty-50-1m.csv.gz', zlib.gzipSync(signalCsv, { level: 9 }));
  write('data/niftybees-1m.csv.gz', zlib.gzipSync(executionCsv, { level: 9 }));
  write('data-manifest.json', `${JSON.stringify({
    source: 'Zerodha Kite Connect', period, prehistoryStart: shiftDays(period.start, -450),
    signalBars: signalAudit.candles.length, executionBars: executionAudit.candles.length,
    signalCsvSha256: sha256(signalCsv), executionCsvSha256: sha256(executionCsv),
    sourceCommitSha: process.env.GITHUB_SHA ?? null,
    workflowRun: process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
  }, null, 2)}\n`);

  const missingRate = executionAudit.report.observedSessions ? executionAudit.report.rejectedSessions / executionAudit.report.observedSessions : 1;
  const signalStartsLate = !signalAudit.report.firstTimestamp || signalAudit.report.firstTimestamp.slice(0, 10) > shiftDays(period.start, -300);
  if (signalAudit.report.criticalIntegrityFailure || executionAudit.report.criticalIntegrityFailure || missingRate > config.intradayGates.maximumRejectedSessionRate || signalStartsLate) {
    const state = signalAudit.report.criticalIntegrityFailure || executionAudit.report.criticalIntegrityFailure ? 'INVALID_DATA' : 'DATA_BLOCKED';
    write('status.json', `${JSON.stringify({ stage, status: state }, null, 2)}\n`); writeChecksums(); process.stdout.write(`${state}\n`); return;
  }

  const intradayIds = candidates.filter((id) => ['T1', 'G1'].includes(id));
  const intraday = runIntradayStrategies(signalAudit.candles, executionAudit.candles, config, period, intradayIds);
  const positional = runPositionalStrategies(signalAudit.candles, executionAudit.candles, config, period, candidates.includes('P1'));
  const strategyGates = {};
  for (const [id, result] of Object.entries(intraday)) {
    strategyGates[id] = evaluateIntradayGates(result, executionAudit.report.observedSessions, config, stage);
    write(`summaries/${id}.json`, `${JSON.stringify({ summary: result.summary, bootstrap: result.bootstrap, concentration: result.concentration, rejectedSessions: result.rejectedSessions, noSignalSessions: result.noSignalSessions }, null, 2)}\n`);
    for (const [scenario, rows] of Object.entries(result.trades)) write(`trades/${id}-${scenario}.csv`, csv(rows));
  }
  if (positional.P1) {
    strategyGates.P1 = evaluatePositionalGates(positional, config, stage);
    for (const id of ['P1', 'B1']) {
      write(`summaries/${id}.json`, `${JSON.stringify(Object.fromEntries(Object.entries(positional[id].scenarios).map(([scenario, value]) => [scenario, value.summary])), null, 2)}\n`);
      for (const [scenario, value] of Object.entries(positional[id].scenarios)) {
        write(`transactions/${id}-${scenario}.csv`, csv(value.transactions));
        write(`daily/${id}-${scenario}.csv`, csv(value.daily));
      }
    }
  }
  const gate = { stage, strategies: strategyGates, allPassed: Object.values(strategyGates).every((value) => value.decision === 'PASS') };
  write('gate.json', `${JSON.stringify(gate, null, 2)}\n`);
  const statuses = Object.fromEntries(Object.entries(strategyGates).map(([id, value]) => [id, value.decision === 'PASS'
    ? (stage === 'holdout' ? 'RESEARCH_PASSED_NOT_AUTHORIZED' : `${stage.toUpperCase()}_PASSED`)
    : `${stage.toUpperCase()}_REJECTED`]));
  write('status.json', `${JSON.stringify({ stage, strategies: statuses, generatedAt: new Date().toISOString() }, null, 2)}\n`);
  write('REPORT.md', `# NIFTY ETF follow-up ${stage}\n\n${Object.entries(statuses).map(([id, status]) => `- **${id}: ${status}**`).join('\n')}\n\nNo paper or live trading was activated.\n`);
  writeChecksums(); process.stdout.write(`${JSON.stringify(statuses)}\n`);
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
