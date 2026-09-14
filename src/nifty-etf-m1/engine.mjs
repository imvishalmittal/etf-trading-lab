import { calculateIntradayCosts } from './costs.mjs';

const sum = (rows) => rows.reduce((total, value) => total + value, 0);
const round = (value, digits = 6) => Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
const clockOf = (timestamp) => String(timestamp).slice(11, 16);
const dateOf = (timestamp) => String(timestamp).slice(0, 10);

export function validBar(bar) {
  if (!bar || !bar.timestamp) return false;
  const values = [bar.open, bar.high, bar.low, bar.close];
  return values.every((v) => Number.isFinite(v) && v > 0)
    && bar.high >= Math.max(bar.open, bar.close, bar.low)
    && bar.low <= Math.min(bar.open, bar.close, bar.high);
}

export function groupSessions(candles) {
  const groups = new Map();
  for (const bar of candles) {
    const date = dateOf(bar.timestamp);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(bar);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bars]) => ({ date, bars: bars.sort((a, b) => a.timestamp.localeCompare(b.timestamp)) }));
}

function initialStop(entry, variant, config) {
  return variant.hardStop ? entry * (1 - config.execution.initialHardStopFraction) : null;
}

export function determineExit(bars, variant, config) {
  const entryBar = bars.find((bar) => clockOf(bar.timestamp) === config.execution.entryTime);
  const exitBar = bars.find((bar) => clockOf(bar.timestamp) === config.execution.forcedExitTime);
  if (!validBar(entryBar)) return { eligible: false, reason: 'MISSING_OR_INVALID_09_15' };
  if (!validBar(exitBar)) return { eligible: false, reason: 'MISSING_OR_INVALID_15_29' };

  const entry = entryBar.open;
  let stop = initialStop(entry, variant, config);
  let activated = false;
  let highestAfterActivation = null;
  const relevant = bars.filter((bar) => clockOf(bar.timestamp) >= config.execution.entryTime
    && clockOf(bar.timestamp) <= config.execution.forcedExitTime);

  for (const bar of relevant) {
    const clock = clockOf(bar.timestamp);
    if (!validBar(bar)) return { eligible: false, reason: 'INVALID_INTRADAY_BAR', timestamp: bar.timestamp };

    if (clock === config.execution.forcedExitTime) {
      if (stop !== null && bar.open < stop) {
        return { eligible: true, entryReference: entry, exitReference: bar.open, exitReason: 'GAP_STOP', exitTimestamp: bar.timestamp, finalStop: stop };
      }
      return { eligible: true, entryReference: entry, exitReference: bar.open, exitReason: 'FORCED_15_29', exitTimestamp: bar.timestamp, finalStop: stop };
    }

    // The initial stop is live during the entry bar. Later stop changes are only
    // calculated after this already-active stop has been tested.
    if (stop !== null) {
      if (clock !== config.execution.entryTime && bar.open < stop) {
        return { eligible: true, entryReference: entry, exitReference: bar.open, exitReason: 'GAP_STOP', exitTimestamp: bar.timestamp, finalStop: stop };
      }
      if (bar.low <= stop) {
        return { eligible: true, entryReference: entry, exitReference: stop, exitReason: 'STOP', exitTimestamp: bar.timestamp, finalStop: stop };
      }
    }

    if (variant.breakevenTrail) {
      const activation = entry * (1 + config.execution.breakevenActivationFraction);
      if (!activated && bar.high >= activation) {
        activated = true;
        highestAfterActivation = bar.high;
      } else if (activated) {
        highestAfterActivation = Math.max(highestAfterActivation, bar.high);
      }
      if (activated) {
        const trailing = highestAfterActivation * (1 - config.execution.trailingDistanceFraction);
        stop = Math.max(entry, stop ?? -Infinity, trailing);
      }
    }
  }
  return { eligible: false, reason: 'NO_FORCED_EXIT_REACHED' };
}

export function nextMultiplier(current, netPnl, allowed = [1, 2, 4, 8]) {
  if (netPnl > 0) return { next: allowed[0], cycleEnded: true, unrecovered: false };
  const index = allowed.indexOf(current);
  if (index < 0) throw new Error(`Unknown multiplier ${current}`);
  if (index === allowed.length - 1) return { next: allowed[0], cycleEnded: true, unrecovered: true };
  return { next: allowed[index + 1], cycleEnded: false, unrecovered: false };
}

function scenarioTrade(base, scenario, bps) {
  const costs = calculateIntradayCosts({
    entryReference: base.entryReference,
    exitReference: base.exitReference,
    quantity: base.quantity,
    slippageBps: bps,
  });
  return { ...base, scenario, slippageBps: bps, ...costs };
}

export function runVariant(sessions, variantId, variant, config) {
  const scenarios = Object.keys(config.slippageScenarios);
  const trades = Object.fromEntries(scenarios.map((name) => [name, []]));
  const rejectedSessions = [];
  let multiplier = 1;
  let cycleId = 1;
  let cyclesAt8x = 0;
  let cyclesUnrecovered = 0;
  let maxMultiplier = 1;
  let maxAllocation = 0;

  for (const session of sessions) {
    const outcome = determineExit(session.bars, variant, config);
    if (!outcome.eligible) {
      rejectedSessions.push({ date: session.date, reason: outcome.reason, timestamp: outcome.timestamp ?? null });
      continue;
    }
    const usedMultiplier = variant.ladder ? multiplier : 1;
    const requestedAllocation = config.capital.baseAllocationRupees * usedMultiplier;
    const quantity = Math.floor(requestedAllocation / outcome.entryReference);
    if (quantity < 1 || requestedAllocation > config.capital.modelRupees) {
      rejectedSessions.push({ date: session.date, reason: 'CAPITAL_OR_QUANTITY_INVALID', requestedAllocation });
      continue;
    }
    const base = {
      strategyId: config.strategyId, variant: variantId, date: session.date, cycleId,
      multiplier: usedMultiplier, requestedAllocation, deployedCapital: quantity * outcome.entryReference,
      quantity, entryTimestamp: session.bars.find((b) => clockOf(b.timestamp) === config.execution.entryTime).timestamp,
      ...outcome,
    };
    for (const [scenario, bps] of Object.entries(config.slippageScenarios)) {
      trades[scenario].push(scenarioTrade(base, scenario, bps));
    }
    maxMultiplier = Math.max(maxMultiplier, usedMultiplier);
    maxAllocation = Math.max(maxAllocation, requestedAllocation);
    if (variant.ladder) {
      const normal = trades.normal.at(-1);
      if (usedMultiplier === 8) cyclesAt8x += 1;
      const transition = nextMultiplier(usedMultiplier, normal.netPnl, config.capital.multipliers);
      multiplier = transition.next;
      if (transition.unrecovered) cyclesUnrecovered += 1;
      if (transition.cycleEnded) cycleId += 1;
    }
  }
  return { trades, rejectedSessions, ladder: { cyclesAt8x, cyclesUnrecovered, maxMultiplier, maxAllocation, endingMultiplier: multiplier } };
}

function drawdown(values) {
  let equity = 0, peak = 0, peakIndex = -1, max = 0, duration = 0, maxDuration = 0;
  for (let i = 0; i < values.length; i += 1) {
    equity += values[i];
    if (equity >= peak) { peak = equity; peakIndex = i; duration = 0; }
    else {
      duration = i - peakIndex;
      const dd = peak - equity;
      if (dd > max) { max = dd; maxDuration = duration; }
    }
  }
  return { amount: max, durationTrades: maxDuration };
}

function negativeStreaks(values) {
  const streaks = [];
  let current = 0;
  for (const value of values) {
    if (value <= 0) current += 1;
    else if (current) { streaks.push(current); current = 0; }
  }
  if (current) streaks.push(current);
  return { maximum: Math.max(0, ...streaks), average: streaks.length ? sum(streaks) / streaks.length : 0 };
}

export function aggregateBy(trades, keyFn) {
  const groups = new Map();
  for (const trade of trades) {
    const key = keyFn(trade);
    groups.set(key, (groups.get(key) ?? 0) + trade.netPnl);
  }
  return Object.fromEntries([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, round(v)]));
}

export function summarizeTrades(trades, modelCapital) {
  const values = trades.map((t) => t.netPnl);
  const wins = values.filter((v) => v > 0);
  const losses = values.filter((v) => v < 0);
  const breakeven = values.length - wins.length - losses.length;
  const grossProfit = sum(wins), grossLoss = Math.abs(sum(losses)), netPnl = sum(values);
  const dd = drawdown(values), streaks = negativeStreaks(values);
  const feeKeys = ['brokerage', 'stt', 'transactionCharges', 'sebiCharges', 'stampDuty', 'ipft', 'gst', 'dpCharge', 'fees', 'slippageCost'];
  const fees = Object.fromEntries(feeKeys.map((key) => [key, round(sum(trades.map((t) => t[key]))) ]));
  const ladderUsage = Object.fromEntries([1, 2, 4, 8].map((level) => [String(level), trades.filter((t) => t.multiplier === level).length]));
  return {
    trades: trades.length, wins: wins.length, losses: losses.length, breakeven,
    winRate: trades.length ? round(wins.length / trades.length) : null,
    grossProfit: round(grossProfit), grossLoss: round(grossLoss), netPnl: round(netPnl),
    netPnlPercentOfCapital: round(netPnl / modelCapital * 100),
    profitFactor: grossLoss ? round(grossProfit / grossLoss) : (grossProfit ? 'Infinity' : null),
    averageTrade: trades.length ? round(netPnl / trades.length) : null,
    averageWin: wins.length ? round(grossProfit / wins.length) : null,
    averageLoss: losses.length ? round(-grossLoss / losses.length) : null,
    maximumDrawdown: round(dd.amount), maximumDrawdownDurationTrades: dd.durationTrades,
    recoveryFactor: dd.amount ? round(netPnl / dd.amount) : null,
    maximumConsecutiveLosses: streaks.maximum, averageNegativeStreak: round(streaks.average),
    maximumDeployedCapital: round(Math.max(0, ...trades.map((t) => t.deployedCapital))),
    ladderUsage, fees,
    monthly: aggregateBy(trades, (t) => t.date.slice(0, 7)),
    yearly: aggregateBy(trades, (t) => t.date.slice(0, 4)),
  };
}

function lcg(seed) {
  let state = seed >>> 0;
  return () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32);
}

export function monthlyBootstrap(monthly, resamples, seed) {
  const values = Object.values(monthly);
  if (!values.length) return { resamples, seed, lower95MeanPnl: null, medianMeanPnl: null };
  const random = lcg(seed), means = [];
  for (let r = 0; r < resamples; r += 1) {
    let total = 0;
    for (let i = 0; i < values.length; i += 1) total += values[Math.floor(random() * values.length)];
    means.push(total / values.length);
  }
  means.sort((a, b) => a - b);
  return {
    resamples, seed,
    lower95MeanPnl: round(means[Math.floor(resamples * 0.025)]),
    medianMeanPnl: round(means[Math.floor(resamples * 0.5)]),
  };
}

export function concentration(trades, summary) {
  const positiveYears = Object.values(summary.yearly).filter((v) => v > 0);
  const positiveYearTotal = sum(positiveYears);
  const winners = trades.filter((t) => t.netPnl > 0).sort((a, b) => b.netPnl - a.netPnl);
  const topCount = winners.length ? Math.max(1, Math.ceil(winners.length * 0.1)) : 0;
  const topProfit = sum(winners.slice(0, topCount).map((t) => t.netPnl));
  return {
    maximumSingleYearPositiveContribution: positiveYearTotal ? round(Math.max(...positiveYears) / positiveYearTotal) : null,
    top10PercentWinnerContribution: summary.grossProfit ? round(topProfit / summary.grossProfit) : null,
    topWinnerCount: topCount,
  };
}

export function runBacktest(candles, config) {
  const sessions = groupSessions(candles);
  const variants = {};
  for (const [id, definition] of Object.entries(config.variants)) {
    const run = runVariant(sessions, id, definition, config);
    const scenarioSummaries = {};
    for (const scenario of Object.keys(config.slippageScenarios)) {
      scenarioSummaries[scenario] = summarizeTrades(run.trades[scenario], config.capital.modelRupees);
    }
    const normal = scenarioSummaries.normal;
    variants[id] = {
      ...run,
      summary: scenarioSummaries,
      bootstrap: monthlyBootstrap(normal.monthly, config.bootstrap.resamples, config.bootstrap.seed),
      concentration: concentration(run.trades.normal, normal),
    };
  }
  return { sessions, variants };
}

const numericProfitFactor = (value) => value === 'Infinity' ? Infinity : Number(value ?? 0);
export function evaluateGates(backtest, integrity, config, stage) {
  const m1 = backtest.variants.M1;
  const normal = m1.summary.normal, stress = m1.summary.stress, severe = m1.summary.severe;
  const activeMonths = Object.values(normal.monthly), years = Object.values(normal.yearly);
  const coverageRate = integrity.observedSessions ? integrity.rejectedSessions / integrity.observedSessions : 1;
  const g = config.gates;
  const tests = [
    ['eligible_sessions', normal.trades >= g.minimumEligibleSessions, normal.trades, `>= ${g.minimumEligibleSessions}`],
    ['missing_invalid_rate', coverageRate <= g.maximumMissingInvalidRate, coverageRate, `<= ${g.maximumMissingInvalidRate}`],
    ['normal_net_pnl', normal.netPnl > g.minimumNormalNetPnl, normal.netPnl, `> ${g.minimumNormalNetPnl}`],
    ['normal_profit_factor', numericProfitFactor(normal.profitFactor) >= g.minimumNormalProfitFactor, normal.profitFactor, `>= ${g.minimumNormalProfitFactor}`],
    ['stress_net_pnl', stress.netPnl > g.minimumStressNetPnl, stress.netPnl, `> ${g.minimumStressNetPnl}`],
    ['stress_profit_factor', numericProfitFactor(stress.profitFactor) >= g.minimumStressProfitFactor, stress.profitFactor, `>= ${g.minimumStressProfitFactor}`],
    ['severe_net_pnl', severe.netPnl > g.minimumSevereNetPnl, severe.netPnl, `> ${g.minimumSevereNetPnl}`],
    ['maximum_drawdown', normal.maximumDrawdown <= g.maximumDrawdownRupees, normal.maximumDrawdown, `<= ${g.maximumDrawdownRupees}`],
    ['profitable_years', years.filter((v) => v > 0).length >= g.minimumProfitableYears, years.filter((v) => v > 0).length, `>= ${g.minimumProfitableYears}`],
    ['profitable_month_fraction', activeMonths.length && activeMonths.filter((v) => v > 0).length / activeMonths.length >= g.minimumProfitableMonthFraction, activeMonths.length ? activeMonths.filter((v) => v > 0).length / activeMonths.length : 0, `>= ${g.minimumProfitableMonthFraction}`],
    ['bootstrap_lower_95_mean', m1.bootstrap.lower95MeanPnl > g.minimumBootstrapLower95MeanPnl, m1.bootstrap.lower95MeanPnl, `> ${g.minimumBootstrapLower95MeanPnl}`],
    ['single_year_concentration', m1.concentration.maximumSingleYearPositiveContribution !== null && m1.concentration.maximumSingleYearPositiveContribution <= g.maximumSingleYearPositiveContribution, m1.concentration.maximumSingleYearPositiveContribution, `<= ${g.maximumSingleYearPositiveContribution}`],
    ['top_winner_concentration', m1.concentration.top10PercentWinnerContribution !== null && m1.concentration.top10PercentWinnerContribution <= g.maximumTopWinnerContribution, m1.concentration.top10PercentWinnerContribution, `<= ${g.maximumTopWinnerContribution}`],
    ['maximum_multiplier', m1.ladder.maxMultiplier <= g.maximumMultiplier, m1.ladder.maxMultiplier, `<= ${g.maximumMultiplier}`],
    ['maximum_allocation', m1.ladder.maxAllocation <= g.maximumPositionAllocationRupees, m1.ladder.maxAllocation, `<= ${g.maximumPositionAllocationRupees}`],
    ...g.mustBeatVariants.map((id) => [`m1_beats_${id.toLowerCase()}`, normal.netPnl > backtest.variants[id].summary.normal.netPnl, normal.netPnl - backtest.variants[id].summary.normal.netPnl, '> 0']),
    ['m1_drawdown_not_above_c1', normal.maximumDrawdown <= backtest.variants.C1.summary.normal.maximumDrawdown, normal.maximumDrawdown - backtest.variants.C1.summary.normal.maximumDrawdown, '<= 0'],
  ].map(([id, passed, value, requirement]) => ({ id, passed: Boolean(passed), value, requirement }));
  const passed = tests.every((test) => test.passed);
  return { strategyId: config.strategyId, stage, decision: passed ? 'PASS' : 'REJECT', tests, failed: tests.filter((t) => !t.passed).map((t) => t.id) };
}
