import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { parseCsv } from '../src/nifty-etf-m1/data.mjs';
import { DELIVERY_COST_SCHEDULE } from '../src/nifty-etf-m1/costs.mjs';
import { prepareMarket, runBenchmark, runCandidate } from '../src/nifty-etf-multi/engine.mjs';

const baseText = fs.readFileSync('research/nifty-etf-multi/frozen-config.json', 'utf8');
const unifiedText = fs.readFileSync('research/nifty-etf-multi/combined/frozen-config.json', 'utf8');
const base = JSON.parse(baseText), unified = JSON.parse(unifiedText);
const config = { ...base, strategies: { ...base.strategies, ...unified.strategies }, bootstrap: { resamples: unified.bootstrap.resamples, seed: unified.bootstrap.seed, familyLowerConfidence: unified.bootstrap.lowerConfidence } };
const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => { const [key, ...rest] = arg.slice(2).split('='); return [key, rest.join('=')]; }));
const sourceDir = args['source-data-dir'], oosDir = args['oos-data-dir'];
const outDir = args.out ?? 'artifacts/nifty-etf-multi/unified';
if (!sourceDir || !oosDir) throw new Error('--source-data-dir and --oos-data-dir are required');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const write = (relative, value) => { const file = path.join(outDir, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
const csv = (rows) => {
  if (!rows.length) return '\n';
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value) => { const text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
  return `${[keys.join(','), ...rows.map((row) => keys.map((key) => escape(row[key])).join(','))].join('\n')}\n`;
};
const pf = (value) => value === 'Infinity' ? Infinity : Number(value ?? 0);

function verify(directory) {
  const lines = fs.readFileSync(path.join(directory, 'checksums.sha256'), 'utf8').trim().split('\n');
  for (const line of lines) {
    const [expected, relative] = line.trim().split(/\s{2,}/), file = path.join(directory, relative);
    if (sha256(fs.readFileSync(file)) !== expected) throw new Error(`Source artifact checksum mismatch: ${file}`);
  }
}

function load(directory, symbol) {
  const text = zlib.gunzipSync(fs.readFileSync(path.join(directory, 'data', `${symbol.toLowerCase()}.csv.gz`))).toString('utf8');
  return parseCsv(text).map((row) => ({ timestamp: row.timestamp, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume) }));
}

function mergeRows(older, newer, symbol) {
  const byDate = new Map();
  for (const row of [...older, ...newer]) {
    const date = row.timestamp.slice(0, 10), prior = byDate.get(date);
    if (prior && ['open', 'high', 'low', 'close', 'volume'].some((key) => prior[key] !== row[key])) throw new Error(`INVALID_DATA: conflicting ${symbol} row on ${date}`);
    byDate.set(date, row);
  }
  return [...byDate.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function noCurve(result) {
  return Object.fromEntries(Object.entries(result.summary).map(([scenario, value]) => { const { equityCurve, ...summary } = value; return [scenario, summary]; }));
}

const gateRows = (rows) => rows.map(([id, passed, value, requirement]) => ({ id, passed: Boolean(passed), value, requirement }));
function stageGate(stage, result, observed) {
  const normal = result.summary.normal, stress = result.summary.stress, severe = result.summary.severe, g = unified.gates[stage];
  const rejectedRate = observed ? result.rejectedActions.length / observed : 1;
  const common = [
    ['minimum_episodes', normal.trades >= g.minimumEpisodes, normal.trades, `>= ${g.minimumEpisodes}`],
    ['normal_net_pnl', normal.netPnl > g.minimumNormalNetPnl, normal.netPnl, `> ${g.minimumNormalNetPnl}`],
    ['stress_net_pnl', stress.netPnl > g.minimumStressNetPnl, stress.netPnl, `> ${g.minimumStressNetPnl}`],
    ['severe_net_pnl', severe.netPnl > g.minimumSevereNetPnl, severe.netPnl, `> ${g.minimumSevereNetPnl}`],
    ['maximum_drawdown', normal.maximumDrawdown <= g.maximumDrawdown, normal.maximumDrawdown, `<= ${g.maximumDrawdown}`],
  ];
  if (stage === 'discovery') common.splice(1, 0, ['rejected_action_rate', rejectedRate <= g.maximumRejectedActionRate, rejectedRate, `<= ${g.maximumRejectedActionRate}`]);
  if (g.minimumNormalProfitFactor !== undefined) common.push(['normal_profit_factor', pf(normal.profitFactor) >= g.minimumNormalProfitFactor, normal.profitFactor, `>= ${g.minimumNormalProfitFactor}`]);
  if (g.minimumStressProfitFactor !== undefined) common.push(['stress_profit_factor', pf(stress.profitFactor) >= g.minimumStressProfitFactor, stress.profitFactor, `>= ${g.minimumStressProfitFactor}`]);
  if (g.minimumProfitableYears !== undefined) common.push(['profitable_years', Object.values(normal.yearly).filter((value) => value > 0).length >= g.minimumProfitableYears, Object.values(normal.yearly).filter((value) => value > 0).length, `>= ${g.minimumProfitableYears}`]);
  if (g.minimumProfitableMonthRate !== undefined) { const months = Object.values(normal.monthly), rate = months.length ? months.filter((value) => value > 0).length / months.length : 0; common.push(['profitable_month_rate', rate >= g.minimumProfitableMonthRate, rate, `>= ${g.minimumProfitableMonthRate}`]); }
  if (stage === 'discovery') common.push(
    ['bootstrap_lower_mean', result.bootstrap.lowerMeanPnl > g.minimumBootstrapLowerMeanPnl, result.bootstrap.lowerMeanPnl, `> ${g.minimumBootstrapLowerMeanPnl}`],
    ['single_year_concentration', result.concentration.maximumSingleYearPositiveContribution !== null && result.concentration.maximumSingleYearPositiveContribution <= g.maximumSingleYearPositiveContribution, result.concentration.maximumSingleYearPositiveContribution, `<= ${g.maximumSingleYearPositiveContribution}`],
    ['winner_concentration', result.concentration.top10PercentWinnerContribution !== null && result.concentration.top10PercentWinnerContribution <= g.maximumTopWinningDecileContribution, result.concentration.top10PercentWinnerContribution, `<= ${g.maximumTopWinningDecileContribution}`],
  );
  const tests = gateRows(common), passed = tests.every((test) => test.passed);
  return { stage, decision: passed ? 'PASS' : 'REJECT', tests, failed: tests.filter((test) => !test.passed).map((test) => test.id) };
}

function wholeGate(id, result, parent) {
  const candidate = result.summary.normal, control = parent.summary.normal, g = unified.gates.wholeStudy;
  const maxPositions = result.maximumSimultaneousPositions ?? 1;
  const maxAllocation = result.maximumTotalAllocation ?? candidate.maximumDeployedCapital;
  const improved = candidate.netPnl > control.netPnl || (candidate.maximumDrawdown <= control.maximumDrawdown * (1 - g.minimumDrawdownReductionVersusParent) && pf(candidate.profitFactor) >= pf(control.profitFactor));
  const tests = gateRows([
    ['minimum_episodes', candidate.trades >= g.minimumEpisodes, candidate.trades, `>= ${g.minimumEpisodes}`],
    ['maximum_allocation', maxAllocation <= g.maximumAllocation, maxAllocation, `<= ${g.maximumAllocation}`],
    ['maximum_positions', maxPositions <= (id === 'XR2' ? 2 : 1), maxPositions, `<= ${id === 'XR2' ? 2 : 1}`],
    ['recovery_factor_vs_parent', Number(candidate.recoveryFactor ?? -Infinity) > Number(control.recoveryFactor ?? Infinity), { candidate: candidate.recoveryFactor, parent: control.recoveryFactor }, 'candidate > parent'],
    ['parent_improvement', improved, { candidateNetPnl: candidate.netPnl, parentNetPnl: control.netPnl, candidateDrawdown: candidate.maximumDrawdown, parentDrawdown: control.maximumDrawdown, candidateProfitFactor: candidate.profitFactor, parentProfitFactor: control.profitFactor }, 'higher net P&L OR >=25% lower drawdown without lower PF'],
  ]);
  return { stage: 'wholeStudy', decision: tests.every((test) => test.passed) ? 'PASS' : 'REJECT', tests, failed: tests.filter((test) => !test.passed).map((test) => test.id) };
}

function checksums() {
  const files = [];
  const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => { const file = path.join(directory, entry.name); if (entry.isDirectory()) walk(file); else if (!file.endsWith('checksums.sha256')) files.push(file); });
  walk(outDir); write('checksums.sha256', `${files.sort().map((file) => `${sha256(fs.readFileSync(file))}  ${path.relative(outDir, file)}`).join('\n')}\n`);
}

function main() {
  verify(sourceDir); verify(oosDir);
  const input = Object.fromEntries(config.universe.map((symbol) => [symbol, mergeRows(load(sourceDir, symbol), load(oosDir, symbol), symbol)]));
  const market = prepareMarket(input, config.universe), stages = {}, candidates = ['XR2', 'BO2'], controls = ['XR1', 'BO1'];
  for (const [stage, range] of Object.entries(unified.periods).filter(([name]) => name !== 'warmupStart')) {
    const period = { start: range[0], end: range[1] }, observed = market.calendar.filter((date) => date >= period.start && date <= period.end).length;
    const benchmark = runBenchmark(market, config, period), results = Object.fromEntries([...controls, ...candidates].map((id) => [id, runCandidate(id, market, config, period)]));
    const gates = Object.fromEntries(candidates.map((id) => [id, stageGate(stage, results[id], observed)]));
    stages[stage] = { period, observedSessions: observed, benchmark, results, gates };
  }
  const combinedPeriod = { start: unified.periods.discovery[0], end: unified.periods.holdout[1] };
  const combinedBenchmark = runBenchmark(market, config, combinedPeriod), combinedResults = Object.fromEntries([...controls, ...candidates].map((id) => [id, runCandidate(id, market, config, combinedPeriod)]));
  const whole = { XR2: wholeGate('XR2', combinedResults.XR2, combinedResults.XR1), BO2: wholeGate('BO2', combinedResults.BO2, combinedResults.BO1) };
  const statuses = Object.fromEntries(candidates.map((id) => { const passed = Object.values(stages).every((stage) => stage.gates[id].decision === 'PASS') && whole[id].decision === 'PASS'; return [id, passed ? unified.statuses.pass : unified.statuses.fail]; }));

  write('base-config.json', baseText); write('unified-config.json', unifiedText); write('cost-schedule.json', `${JSON.stringify(DELIVERY_COST_SCHEDULE, null, 2)}\n`);
  write('source-provenance.json', `${JSON.stringify({ artifacts: unified.sourceArtifacts, sourceCommitSha: process.env.GITHUB_SHA ?? null, workflowRun: process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null }, null, 2)}\n`);
  for (const [stage, data] of Object.entries(stages)) {
    write(`stages/${stage}/gate.json`, `${JSON.stringify(data.gates, null, 2)}\n`);
    write(`stages/${stage}/benchmark.json`, `${JSON.stringify(noCurve(data.benchmark), null, 2)}\n`);
    for (const [id, result] of Object.entries(data.results)) {
      write(`stages/${stage}/summaries/${id}.json`, `${JSON.stringify({ summary: noCurve(result), bootstrap: result.bootstrap, concentration: result.concentration, rejectedActions: result.rejectedActions }, null, 2)}\n`);
      for (const [scenario, rows] of Object.entries(result.trades)) { write(`stages/${stage}/trades/${id}-${scenario}.csv`, csv(rows)); write(`stages/${stage}/equity/${id}-${scenario}.csv`, csv(result.summary[scenario].equityCurve)); }
    }
  }
  write('combined/gate.json', `${JSON.stringify(whole, null, 2)}\n`);
  write('combined/benchmark.json', `${JSON.stringify(noCurve(combinedBenchmark), null, 2)}\n`);
  for (const [id, result] of Object.entries(combinedResults)) write(`combined/summaries/${id}.json`, `${JSON.stringify({ summary: noCurve(result), bootstrap: result.bootstrap, concentration: result.concentration, rejectedActions: result.rejectedActions }, null, 2)}\n`);
  write('status.json', `${JSON.stringify({ strategies: statuses, stages: Object.fromEntries(candidates.map((id) => [id, Object.fromEntries(Object.entries(stages).map(([stage, data]) => [stage, data.gates[id].decision]))])), combinedControl: Object.fromEntries(candidates.map((id) => [id, whole[id].decision])), tradingAuthorized: false, generatedAt: new Date().toISOString() }, null, 2)}\n`);
  write('REPORT.md', `# Unified-run XR2 and BO2 staged research\n\n${candidates.map((id) => `- **${id}: ${statuses[id]}** — discovery ${stages.discovery.gates[id].decision}, validation ${stages.validation.gates[id].decision}, holdout ${stages.holdout.gates[id].decision}, whole-study ${whole[id].decision}`).join('\n')}\n\nAll stages were calculated in this one run and remain separately reported. Combined totals cannot override a failed stage. No paper or live trading was activated.\n`);
  checksums(); process.stdout.write(`${JSON.stringify(statuses)}\n`);
}

try { main(); } catch (error) { write('status.json', `${JSON.stringify({ status: error.message.startsWith('INVALID_DATA') ? 'INVALID_DATA' : 'DATA_BLOCKED', error: error.message, tradingAuthorized: false }, null, 2)}\n`); checksums(); console.error(error.stack || error.message); process.exit(1); }
