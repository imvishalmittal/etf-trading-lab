import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { parseCsv } from '../src/nifty-etf-m1/data.mjs';
import { DELIVERY_COST_SCHEDULE } from '../src/nifty-etf-m1/costs.mjs';
import { evaluateCandidate, prepareMarket, runBenchmark, runCandidate } from '../src/nifty-etf-multi/engine.mjs';

const config = JSON.parse(fs.readFileSync('research/nifty-etf-multi/frozen-config.json', 'utf8'));
const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => { const [key, ...rest] = arg.slice(2).split('='); return [key, rest.join('=')]; }));
const stage = args.stage ?? 'discovery';
if (stage !== 'discovery') throw new Error(`SEALED_STAGE_BLOCKED: ${stage} data have not been acquired`);
const dataDir = args['data-dir'];
if (!dataDir) throw new Error('--data-dir is required');
const outDir = args.out ?? `artifacts/nifty-etf-multi/${stage}`;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const write = (relative, value) => { const file = path.join(outDir, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
const csv = (rows) => {
  if (!rows.length) return '\n';
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value) => { const text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
  return `${[keys.join(','), ...rows.map((row) => keys.map((key) => escape(row[key])).join(','))].join('\n')}\n`;
};

function verifySourceArtifact() {
  const lines = fs.readFileSync(path.join(dataDir, 'checksums.sha256'), 'utf8').trim().split('\n');
  for (const line of lines) {
    const [expected, relative] = line.trim().split(/\s{2,}/);
    const actual = sha256(fs.readFileSync(path.join(dataDir, relative)));
    if (actual !== expected) throw new Error(`Source artifact checksum mismatch: ${relative}`);
  }
}

function loadSymbol(symbol) {
  const file = path.join(dataDir, 'data', `${symbol.toLowerCase()}.csv.gz`);
  const text = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');
  return parseCsv(text).map((row) => ({ timestamp: row.timestamp, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume) }));
}

function outputChecksums() {
  const files = [];
  const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => { const file = path.join(directory, entry.name); if (entry.isDirectory()) walk(file); else if (!file.endsWith('checksums.sha256')) files.push(file); });
  walk(outDir);
  write('checksums.sha256', `${files.sort().map((file) => `${sha256(fs.readFileSync(file))}  ${path.relative(outDir, file)}`).join('\n')}\n`);
}

function summaryWithoutCurve(result) {
  return Object.fromEntries(Object.entries(result.summary).map(([scenario, value]) => { const { equityCurve, ...summary } = value; return [scenario, summary]; }));
}

function statusFor(decision) { return decision === 'PASS' ? 'DISCOVERY_PASSED' : decision === 'DATA_BLOCKED' ? 'DATA_BLOCKED' : 'DISCOVERY_REJECTED'; }

function main() {
  verifySourceArtifact();
  const input = Object.fromEntries(config.universe.map((symbol) => [symbol, loadSymbol(symbol)]));
  const market = prepareMarket(input, config.universe), period = { start: config.periods.discovery[0], end: config.periods.discovery[1] };
  const dates = market.calendar.filter((date) => date >= period.start && date <= period.end);
  const benchmark = runBenchmark(market, config, period), results = {}, gates = {};
  for (const id of ['XR1', 'MR1', 'BO1']) {
    results[id] = runCandidate(id, market, config, period);
    gates[id] = evaluateCandidate(id, results[id], benchmark, dates.length, config);
  }
  write('config.json', `${JSON.stringify(config, null, 2)}\n`);
  write('cost-schedule.json', `${JSON.stringify(DELIVERY_COST_SCHEDULE, null, 2)}\n`);
  write('source-manifest.json', fs.readFileSync(path.join(dataDir, 'manifest.json')));
  write('source-checksums.sha256', fs.readFileSync(path.join(dataDir, 'checksums.sha256')));
  write('benchmark/Q0.json', `${JSON.stringify(summaryWithoutCurve(benchmark), null, 2)}\n`);
  for (const [scenario, rows] of Object.entries(benchmark.trades)) write(`benchmark/Q0-${scenario}.csv`, csv(rows));
  for (const [id, result] of Object.entries(results)) {
    write(`summaries/${id}.json`, `${JSON.stringify({ summary: summaryWithoutCurve(result), bootstrap: result.bootstrap, concentration: result.concentration, rejectedActions: result.rejectedActions }, null, 2)}\n`);
    for (const [scenario, rows] of Object.entries(result.trades)) {
      write(`trades/${id}-${scenario}.csv`, csv(rows));
      write(`equity/${id}-${scenario}.csv`, csv(result.summary[scenario].equityCurve));
    }
  }
  for (const [scenario, value] of Object.entries(benchmark.summary)) write(`equity/Q0-${scenario}.csv`, csv(value.equityCurve));
  const gate = { stage, strategies: gates, anyPassed: Object.values(gates).some((value) => value.decision === 'PASS') };
  const statuses = Object.fromEntries(Object.entries(gates).map(([id, value]) => [id, statusFor(value.decision)]));
  write('gate.json', `${JSON.stringify(gate, null, 2)}\n`);
  write('status.json', `${JSON.stringify({ stage, strategies: statuses, generatedAt: new Date().toISOString(), sourceRun: config.dataArtifact.runId, sourceArtifact: config.dataArtifact.artifactId, sourceCommitSha: process.env.GITHUB_SHA ?? null, workflowRun: process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null }, null, 2)}\n`);
  const lines = Object.entries(statuses).map(([id, value]) => `- **${id}: ${value}**`);
  write('REPORT.md', `# Multi-ETF short-term discovery\n\n${lines.join('\n')}\n\nValidation remains sealed unless an individual candidate passes every frozen discovery gate. No paper or live trading was activated.\n`);
  outputChecksums();
  process.stdout.write(`${JSON.stringify(statuses)}\n`);
}

try { main(); } catch (error) {
  write('status.json', `${JSON.stringify({ stage, status: 'DATA_BLOCKED', error: error.message }, null, 2)}\n`);
  outputChecksums(); console.error(error.stack || error.message); process.exit(1);
}
