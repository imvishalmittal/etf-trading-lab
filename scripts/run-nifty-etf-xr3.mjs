import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { parseCsv } from '../src/nifty-etf-m1/data.mjs';
import { DELIVERY_COST_SCHEDULE } from '../src/nifty-etf-m1/costs.mjs';
import { prepareMarket, runBenchmark, runCandidate } from '../src/nifty-etf-multi/engine.mjs';

const configPath = 'research/nifty-etf-xr3/frozen-config.json';
const basePath = 'research/nifty-etf-multi/frozen-config.json';
const parentPath = 'research/nifty-etf-multi/combined/frozen-config.json';
const configText = fs.readFileSync(configPath, 'utf8'), baseText = fs.readFileSync(basePath, 'utf8'), parentText = fs.readFileSync(parentPath, 'utf8');
const config = JSON.parse(configText), base = JSON.parse(baseText), parentProtocol = JSON.parse(parentText);
const parentConfig = {
  ...base,
  strategies: { ...base.strategies, XR2: parentProtocol.strategies.XR2 },
  bootstrap: { resamples: config.bootstrap.resamples, seed: config.bootstrap.seed, familyLowerConfidence: config.bootstrap.familyLowerConfidence },
};
const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => {
  const [key, ...rest] = arg.slice(2).split('='); return [key, rest.join('=')];
}));
const dataDir = args['data-dir'], outDir = args.out ?? 'artifacts/nifty-etf-xr3/results';
if (!dataDir) throw new Error('--data-dir is required');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const write = (relative, value) => {
  const file = path.join(outDir, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value);
};
const pf = (value) => value === 'Infinity' ? Infinity : Number(value ?? 0);
const csv = (rows) => {
  if (!rows.length) return '\n';
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value) => {
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return `${[keys.join(','), ...rows.map((row) => keys.map((key) => escape(row[key])).join(','))].join('\n')}\n`;
};

function verify(directory) {
  const lines = fs.readFileSync(path.join(directory, 'checksums.sha256'), 'utf8').trim().split('\n');
  for (const line of lines) {
    const [expected, relative] = line.trim().split(/\s{2,}/), file = path.join(directory, relative);
    if (sha256(fs.readFileSync(file)) !== expected) throw new Error(`Source artifact checksum mismatch: ${file}`);
  }
}

function load(symbol) {
  const text = zlib.gunzipSync(fs.readFileSync(path.join(dataDir, 'data', `${symbol.toLowerCase()}.csv.gz`))).toString('utf8');
  return parseCsv(text).map((row) => ({
    timestamp: row.timestamp, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume),
  }));
}

function noCurve(result) {
  return Object.fromEntries(Object.entries(result.summary).map(([scenario, value]) => {
    const { equityCurve, ...summary } = value; return [scenario, summary];
  }));
}

const gateRows = (rows) => rows.map(([id, passed, value, requirement]) => ({ id, passed: Boolean(passed), value, requirement }));
function stageGate(stage, result, observed) {
  const normal = result.summary.normal, stress = result.summary.stress, severe = result.summary.severe, gates = config.gates[stage];
  const rejectedRate = observed ? result.rejectedActions.length / observed : 1;
  const rows = [
    ['minimum_episodes', normal.trades >= gates.minimumEpisodes, normal.trades, `>= ${gates.minimumEpisodes}`],
    ['normal_net_pnl', normal.netPnl > gates.minimumNormalNetPnl, normal.netPnl, `> ${gates.minimumNormalNetPnl}`],
    ['stress_net_pnl', stress.netPnl > gates.minimumStressNetPnl, stress.netPnl, `> ${gates.minimumStressNetPnl}`],
    ['severe_net_pnl', severe.netPnl > gates.minimumSevereNetPnl, severe.netPnl, `> ${gates.minimumSevereNetPnl}`],
    ['maximum_drawdown', normal.maximumDrawdown <= gates.maximumDrawdown, normal.maximumDrawdown, `<= ${gates.maximumDrawdown}`],
  ];
  if (stage === 'discovery') rows.splice(1, 0, ['rejected_action_rate', rejectedRate <= gates.maximumRejectedActionRate, rejectedRate, `<= ${gates.maximumRejectedActionRate}`]);
  if (gates.minimumNormalProfitFactor !== undefined) rows.push(['normal_profit_factor', pf(normal.profitFactor) >= gates.minimumNormalProfitFactor, normal.profitFactor, `>= ${gates.minimumNormalProfitFactor}`]);
  if (gates.minimumStressProfitFactor !== undefined) rows.push(['stress_profit_factor', pf(stress.profitFactor) >= gates.minimumStressProfitFactor, stress.profitFactor, `>= ${gates.minimumStressProfitFactor}`]);
  if (gates.minimumProfitableYears !== undefined) {
    const count = Object.values(normal.yearly).filter((value) => value > 0).length;
    rows.push(['profitable_years', count >= gates.minimumProfitableYears, count, `>= ${gates.minimumProfitableYears}`]);
  }
  if (gates.minimumProfitableMonthRate !== undefined) {
    const months = Object.values(normal.monthly), rate = months.length ? months.filter((value) => value > 0).length / months.length : 0;
    rows.push(['profitable_month_rate', rate >= gates.minimumProfitableMonthRate, rate, `>= ${gates.minimumProfitableMonthRate}`]);
  }
  if (stage === 'discovery') rows.push(
    ['bootstrap_lower_mean', result.bootstrap.lowerMeanPnl > gates.minimumBootstrapLowerMeanPnl, result.bootstrap.lowerMeanPnl, `> ${gates.minimumBootstrapLowerMeanPnl}`],
    ['single_year_concentration', result.concentration.maximumSingleYearPositiveContribution !== null && result.concentration.maximumSingleYearPositiveContribution <= gates.maximumSingleYearPositiveContribution, result.concentration.maximumSingleYearPositiveContribution, `<= ${gates.maximumSingleYearPositiveContribution}`],
    ['winner_concentration', result.concentration.top10PercentWinnerContribution !== null && result.concentration.top10PercentWinnerContribution <= gates.maximumTopWinningDecileContribution, result.concentration.top10PercentWinnerContribution, `<= ${gates.maximumTopWinningDecileContribution}`],
  );
  const tests = gateRows(rows);
  return { stage, decision: tests.every((test) => test.passed) ? 'PASS' : 'REJECT', tests, failed: tests.filter((test) => !test.passed).map((test) => test.id) };
}

function wholeGate(result, parent) {
  const candidate = result.summary.normal, control = parent.summary.normal, gates = config.gates.wholeStudy;
  const improved = candidate.netPnl > control.netPnl
    || (candidate.maximumDrawdown <= control.maximumDrawdown * (1 - gates.minimumDrawdownReductionVersusParent)
      && pf(candidate.profitFactor) >= pf(control.profitFactor));
  const tests = gateRows([
    ['minimum_episodes', candidate.trades >= gates.minimumEpisodes, candidate.trades, `>= ${gates.minimumEpisodes}`],
    ['maximum_allocation', result.maximumTotalAllocation <= gates.maximumAllocation, result.maximumTotalAllocation, `<= ${gates.maximumAllocation}`],
    ['maximum_positions', result.maximumSimultaneousPositions <= gates.maximumSimultaneousPositions, result.maximumSimultaneousPositions, `<= ${gates.maximumSimultaneousPositions}`],
    ['recovery_factor_vs_parent', Number(candidate.recoveryFactor ?? -Infinity) > Number(control.recoveryFactor ?? Infinity), { candidate: candidate.recoveryFactor, parent: control.recoveryFactor }, 'XR3 > XR2'],
    ['parent_improvement', improved, { candidateNetPnl: candidate.netPnl, parentNetPnl: control.netPnl, candidateDrawdown: candidate.maximumDrawdown, parentDrawdown: control.maximumDrawdown, candidateProfitFactor: candidate.profitFactor, parentProfitFactor: control.profitFactor }, 'higher net P&L OR >=25% lower drawdown without lower PF'],
  ]);
  return { stage: 'wholeStudy', decision: tests.every((test) => test.passed) ? 'PASS' : 'REJECT', tests, failed: tests.filter((test) => !test.passed).map((test) => test.id) };
}

function checksums() {
  const files = [];
  const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file); else if (!file.endsWith('checksums.sha256')) files.push(file);
  });
  walk(outDir);
  write('checksums.sha256', `${files.sort().map((file) => `${sha256(fs.readFileSync(file))}  ${path.relative(outDir, file)}`).join('\n')}\n`);
}

function writeResult(prefix, id, result) {
  write(`${prefix}/summaries/${id}.json`, `${JSON.stringify({
    summary: noCurve(result), bootstrap: result.bootstrap, concentration: result.concentration,
    rejectedActions: result.rejectedActions, maximumSimultaneousPositions: result.maximumSimultaneousPositions,
    maximumTotalAllocation: result.maximumTotalAllocation,
  }, null, 2)}\n`);
  for (const [scenario, rows] of Object.entries(result.trades)) {
    write(`${prefix}/trades/${id}-${scenario}.csv`, csv(rows));
    write(`${prefix}/equity/${id}-${scenario}.csv`, csv(result.summary[scenario].equityCurve));
  }
  if (result.decisions) write(`${prefix}/decisions/${id}.csv`, csv(result.decisions));
}

function main() {
  verify(dataDir);
  const archivedConfig = fs.readFileSync(path.join(dataDir, 'frozen-config.json'));
  if (sha256(archivedConfig) !== sha256(Buffer.from(configText))) throw new Error('INVALID_DATA: acquired data used a different frozen XR3 config');
  const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'manifest.json'), 'utf8'));
  const input = Object.fromEntries(config.universe.map((symbol) => [symbol, load(symbol)]));
  const market = prepareMarket(input, config.universe), stages = {};
  for (const [stage, range] of Object.entries(config.periods).filter(([name]) => name !== 'warmupStart')) {
    const period = { start: range[0], end: range[1] };
    const observed = market.calendar.filter((date) => date >= period.start && date <= period.end).length;
    const benchmark = runBenchmark(market, config, period);
    const xr3 = runCandidate('XR3', market, config, period), xr2 = runCandidate('XR2', market, parentConfig, period);
    stages[stage] = { period, observedSessions: observed, benchmark, xr3, xr2, gate: stageGate(stage, xr3, observed) };
  }
  const combinedPeriod = { start: config.periods.discovery[0], end: config.periods.holdout[1] };
  const combined = {
    benchmark: runBenchmark(market, config, combinedPeriod),
    xr3: runCandidate('XR3', market, config, combinedPeriod),
    xr2: runCandidate('XR2', market, parentConfig, combinedPeriod),
  };
  const whole = wholeGate(combined.xr3, combined.xr2);
  const passed = Object.values(stages).every((stage) => stage.gate.decision === 'PASS') && whole.decision === 'PASS';
  const status = passed ? config.statuses.pass : config.statuses.fail;

  write('frozen-config.json', configText); write('parent-base-config.json', baseText); write('parent-unified-config.json', parentText);
  write('cost-schedule.json', `${JSON.stringify(DELIVERY_COST_SCHEDULE, null, 2)}\n`);
  write('source-provenance.json', `${JSON.stringify({ manifest, sourceCommitSha: process.env.GITHUB_SHA ?? null, workflowRun: process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null }, null, 2)}\n`);
  for (const [stage, data] of Object.entries(stages)) {
    write(`stages/${stage}/gate.json`, `${JSON.stringify(data.gate, null, 2)}\n`);
    write(`stages/${stage}/benchmark.json`, `${JSON.stringify(noCurve(data.benchmark), null, 2)}\n`);
    writeResult(`stages/${stage}`, 'XR3', data.xr3); writeResult(`stages/${stage}`, 'XR2', data.xr2);
  }
  write('combined/gate.json', `${JSON.stringify(whole, null, 2)}\n`);
  write('combined/benchmark.json', `${JSON.stringify(noCurve(combined.benchmark), null, 2)}\n`);
  writeResult('combined', 'XR3', combined.xr3); writeResult('combined', 'XR2', combined.xr2);
  write('status.json', `${JSON.stringify({
    strategy: 'XR3', status,
    stages: Object.fromEntries(Object.entries(stages).map(([stage, data]) => [stage, data.gate.decision])),
    wholeStudy: whole.decision, tradingAuthorized: false, generatedAt: new Date().toISOString(),
  }, null, 2)}\n`);
  write('REPORT.md', `# XR3 defensive multi-ETF rotation\n\n**${status}**\n\n- Discovery: ${stages.discovery.gate.decision}\n- Validation: ${stages.validation.gate.decision}\n- Holdout: ${stages.holdout.gate.decision}\n- Whole-study comparison with XR2: ${whole.decision}\n\nAll periods were calculated in this run and remain separately evaluated. Combined totals cannot override a failed stage. No paper or live trading was activated.\n`);
  checksums();
  process.stdout.write(`${JSON.stringify({ XR3: status })}\n`);
}

try {
  main();
} catch (error) {
  write('status.json', `${JSON.stringify({ status: error.message.startsWith('INVALID_DATA') ? 'INVALID_DATA' : 'DATA_BLOCKED', error: error.message, tradingAuthorized: false }, null, 2)}\n`);
  checksums(); console.error(error.stack || error.message); process.exit(1);
}

