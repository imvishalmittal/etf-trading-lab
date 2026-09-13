import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { COST_SCHEDULE } from '../src/nifty-etf-m1/costs.mjs';
import { auditCandles, candlesToCsv, fetchMinuteCandles, verifyInstrument } from '../src/nifty-etf-m1/data.mjs';
import { evaluateGates, runBacktest } from '../src/nifty-etf-m1/engine.mjs';

const config = JSON.parse(fs.readFileSync('research/nifty-etf-m1/frozen-config.json', 'utf8'));
const args = Object.fromEntries(process.argv.slice(2).filter((x) => x.startsWith('--')).map((x) => {
  const [key, ...value] = x.slice(2).split('='); return [key, value.join('=')];
}));
const stage = args.stage ?? 'discovery';
const outDir = args.out ?? `artifacts/nifty-etf-m1/${stage}`;
const validStages = ['discovery', 'validation', 'holdout'];
if (!validStages.includes(stage)) throw new Error(`Unknown stage ${stage}`);

function addDays(text, days) {
  const date = new Date(`${text}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayIndia() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function requirePriorGate() {
  if (stage === 'discovery') return;
  const prior = stage === 'validation' ? 'discovery' : 'validation';
  const file = `research/nifty-etf-m1/evidence/${prior}/gate.json`;
  if (!fs.existsSync(file)) throw new Error(`SEALED_STAGE_BLOCKED: missing committed ${file}`);
  const gate = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (gate.decision !== 'PASS') throw new Error(`SEALED_STAGE_BLOCKED: ${prior} decision is ${gate.decision}`);
}

function csvEscape(value) {
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function tradesCsv(trades) {
  if (!trades.length) return 'strategyId,variant,scenario,date\n';
  const keys = [...new Set(trades.flatMap((row) => Object.keys(row)))];
  return [keys.join(','), ...trades.map((row) => keys.map((key) => csvEscape(row[key])).join(','))].join('\n') + '\n';
}

function tabularCsv(variants, field) {
  const lines = ['variant,scenario,period,net_pnl'];
  for (const [variant, result] of Object.entries(variants)) {
    for (const [scenario, summary] of Object.entries(result.summary)) {
      for (const [period, pnl] of Object.entries(summary[field])) lines.push([variant, scenario, period, pnl].join(','));
    }
  }
  return `${lines.join('\n')}\n`;
}

function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function write(relative, content) {
  const file = path.join(outDir, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file;
}

function writeChecksums() {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (!file.endsWith('checksums.sha256')) files.push(file);
    }
  }
  walk(outDir);
  const rows = files.sort().map((file) => `${sha256(fs.readFileSync(file))}  ${path.relative(outDir, file)}`);
  write('checksums.sha256', `${rows.join('\n')}\n`);
}

function terminalStatus(gate, dataStatus = null) {
  if (dataStatus) return dataStatus;
  if (gate.decision === 'PASS') {
    if (stage === 'discovery') return 'DISCOVERY_PASSED_VALIDATION_LOCKED';
    if (stage === 'validation') return 'VALIDATION_PASSED_HOLDOUT_LOCKED';
    return 'RESEARCH_PASSED_NOT_AUTHORIZED';
  }
  return `${stage.toUpperCase()}_REJECTED`;
}

function reportMarkdown(status, integrity, gate, summaries) {
  const m1 = summaries?.M1;
  return `# ${config.strategyId} ${stage} result\n\n` +
    `**Terminal status: ${status}**\n\n` +
    `- Source: Groww genuine NIFTYBEES one-minute OHLC\n` +
    `- Period requested: ${integrity.requested.start} through ${integrity.requested.end}\n` +
    `- Actual timestamps: ${integrity.firstTimestamp ?? 'none'} through ${integrity.lastTimestamp ?? 'none'}\n` +
    `- Observed / eligible / rejected sessions: ${integrity.observedSessions} / ${integrity.eligibleSessions} / ${integrity.rejectedSessions}\n` +
    (m1 ? `- M1 normal net P&L / PF / max drawdown: ₹${m1.normal.netPnl} / ${m1.normal.profitFactor} / ₹${m1.normal.maximumDrawdown}\n` : '') +
    (gate ? `- Failed gates: ${gate.failed.length ? gate.failed.join(', ') : 'none'}\n` : '') +
    `\nNo paper or live trading was activated. Even a fully passed result requires separate user authorization.\n`;
}

async function main() {
  requirePriorGate();
  fs.mkdirSync(outDir, { recursive: true });
  const period = { ...config.periods[stage] };
  if (period.end === 'LATEST_FULL_SESSION') period.end = addDays(todayIndia(), -1);
  write('config.json', `${JSON.stringify(config, null, 2)}\n`);
  write('cost-schedule.json', `${JSON.stringify(COST_SCHEDULE, null, 2)}\n`);

  let instrument;
  try {
    instrument = await verifyInstrument(config.instrument);
    write('instrument.json', `${JSON.stringify(instrument, null, 2)}\n`);
  } catch (error) {
    const integrity = { requested: period, observedSessions: 0, eligibleSessions: 0, rejectedSessions: 0, error: error.message };
    const status = 'DATA_BLOCKED';
    write('data-integrity.json', `${JSON.stringify(integrity, null, 2)}\n`);
    write('status.json', `${JSON.stringify({ strategyId: config.strategyId, stage, status }, null, 2)}\n`);
    write('REPORT.md', reportMarkdown(status, integrity, null, null));
    writeChecksums();
    process.stdout.write(`${status}: ${error.message}\n`); return;
  }

  let fetched;
  try {
    fetched = await fetchMinuteCandles({ token: process.env.GROWW_ACCESS_TOKEN, instrument: config.instrument, start: period.start, end: period.end });
  } catch (error) {
    const integrity = { requested: period, observedSessions: 0, eligibleSessions: 0, rejectedSessions: 0, error: error.message };
    const status = 'DATA_BLOCKED';
    write('data-integrity.json', `${JSON.stringify(integrity, null, 2)}\n`);
    write('status.json', `${JSON.stringify({ strategyId: config.strategyId, stage, status }, null, 2)}\n`);
    write('REPORT.md', reportMarkdown(status, integrity, null, null));
    writeChecksums();
    process.stdout.write(`${status}: ${error.message}\n`); return;
  }
  const audited = auditCandles(fetched.candles, period);
  const integrity = { ...audited.report, chunks: fetched.chunks, instrumentMasterSha256: instrument.masterSha256 };
  write('data-integrity.json', `${JSON.stringify(integrity, null, 2)}\n`);
  const rawCsv = Buffer.from(candlesToCsv(audited.candles));
  write('data/niftybees-1m.csv.gz', zlib.gzipSync(rawCsv, { level: 9 }));
  write('data-manifest.json', `${JSON.stringify({
    source: 'Groww', requested: period, rawCsvSha256: sha256(rawCsv), compressedSha256: sha256(zlib.gzipSync(rawCsv, { level: 9 })),
    bars: audited.candles.length, generatedAt: new Date().toISOString(), sourceCommitSha: process.env.GITHUB_SHA ?? null,
    workflowRun: process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
  }, null, 2)}\n`);

  const startTolerance = addDays(period.start, 10);
  const endTolerance = addDays(period.end, -10);
  let dataStatus = null;
  if (!integrity.firstTimestamp || integrity.firstTimestamp.slice(0, 10) > startTolerance
      || integrity.lastTimestamp.slice(0, 10) < endTolerance
      || integrity.eligibleSessions < (stage === 'discovery' ? config.gates.minimumEligibleSessions : 1)) dataStatus = 'DATA_BLOCKED';
  if (integrity.criticalIntegrityFailure) dataStatus = 'INVALID_DATA';

  let gate = null, backtest = null, summaries = null;
  if (!dataStatus) {
    backtest = runBacktest(audited.candles, config);
    gate = evaluateGates(backtest, integrity, config, stage);
    summaries = Object.fromEntries(Object.entries(backtest.variants).map(([id, result]) => [id, result.summary]));
    write('summary.json', `${JSON.stringify({ strategyId: config.strategyId, stage, variants: summaries }, null, 2)}\n`);
    write('gate.json', `${JSON.stringify(gate, null, 2)}\n`);
    write('monthly.csv', tabularCsv(backtest.variants, 'monthly'));
    write('yearly.csv', tabularCsv(backtest.variants, 'yearly'));
    for (const [id, result] of Object.entries(backtest.variants)) {
      write(`diagnostics/${id}.json`, `${JSON.stringify({ ladder: result.ladder, rejectedSessions: result.rejectedSessions, bootstrap: result.bootstrap, concentration: result.concentration }, null, 2)}\n`);
      for (const [scenario, trades] of Object.entries(result.trades)) write(`trades/${id}-${scenario}.csv`, tradesCsv(trades));
    }
  }
  const status = terminalStatus(gate, dataStatus);
  write('status.json', `${JSON.stringify({ strategyId: config.strategyId, stage, status, generatedAt: new Date().toISOString() }, null, 2)}\n`);
  write('REPORT.md', reportMarkdown(status, integrity, gate, summaries));
  writeChecksums();
  process.stdout.write(`${status}\n`);
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
