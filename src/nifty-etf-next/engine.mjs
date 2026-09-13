import { calculateDeliveryCosts, calculateIntradayCosts } from '../nifty-etf-m1/costs.mjs';
import { concentration, groupSessions, monthlyBootstrap, summarizeTrades, validBar } from '../nifty-etf-m1/engine.mjs';

const clock = (row) => row.timestamp.slice(11, 16);
const date = (row) => row.timestamp.slice(0, 10);
const round = (value, digits = 6) => Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
const minuteNumber = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const minuteClock = (value) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

function exactBar(bars, at) { return bars.find((row) => clock(row) === at); }
function completedClose(session) { return exactBar(session?.bars ?? [], '15:29')?.close ?? null; }
function sessionMap(candles) { return new Map(groupSessions(candles).map((row) => [row.date, row])); }

export function simpleMovingAverage(values, length) {
  if (values.length < length) return null;
  const slice = values.slice(-length);
  return slice.reduce((total, value) => total + value, 0) / length;
}

export function buildSignalContext(signalCandles) {
  const sessions = groupSessions(signalCandles);
  const closes = [];
  const context = new Map();
  for (const session of sessions) {
    const closeValue = completedClose(session);
    context.set(session.date, {
      session,
      previousClose: closes.at(-1)?.close ?? null,
      previousSma50: simpleMovingAverage(closes.map((row) => row.close), 50),
      previousSma200: simpleMovingAverage(closes.map((row) => row.close), 200),
    });
    if (Number.isFinite(closeValue)) closes.push({ date: session.date, close: closeValue });
  }
  return { sessions, context, closes };
}

function openingRange(bars, start, end) {
  const selected = bars.filter((row) => clock(row) >= start && clock(row) <= end);
  const expected = minuteNumber(end) - minuteNumber(start) + 1;
  if (selected.length !== expected || selected.some((row) => !validBar(row))) return null;
  return { high: Math.max(...selected.map((row) => row.high)), low: Math.min(...selected.map((row) => row.low)) };
}

function hardStopExit(executionBars, signalBars, { entryTime, entryReference, rangeHigh, forcedExitTime, hardStopFraction }) {
  const stop = entryReference * (1 - hardStopFraction);
  const startMinute = minuteNumber(entryTime), endMinute = minuteNumber(forcedExitTime);
  for (let minute = startMinute; minute <= endMinute; minute += 1) {
    const at = minuteClock(minute);
    const bar = exactBar(executionBars, at);
    if (!validBar(bar)) return { eligible: false, reason: `MISSING_OR_INVALID_EXECUTION_${at.replace(':', '_')}` };
    if (minute > startMinute && bar.open < stop) return { eligible: true, exitReference: bar.open, exitTime: at, exitReason: 'GAP_STOP' };
    if (bar.low <= stop) return { eligible: true, exitReference: stop, exitTime: at, exitReason: 'HARD_STOP' };
    if (minute === endMinute) return { eligible: true, exitReference: bar.open, exitTime: at, exitReason: 'FORCED_EXIT' };
    if (minute > startMinute) {
      const priorSignal = exactBar(signalBars, minuteClock(minute - 1));
      if (!validBar(priorSignal)) return { eligible: false, reason: 'MISSING_SIGNAL_BAR_DURING_POSITION', timestamp: `${date(bar)}T${minuteClock(minute - 1)}` };
      if (priorSignal.close <= rangeHigh) return { eligible: true, exitReference: bar.open, exitTime: at, exitReason: 'SIGNAL_INVALIDATED' };
    }
  }
  return { eligible: false, reason: 'NO_EXIT' };
}

export function determineT1(signalContext, executionSession, config) {
  const signal = signalContext?.session;
  if (!signal || !executionSession) return { status: 'REJECTED', reason: 'MISSING_SIGNAL_OR_EXECUTION_SESSION' };
  const range = openingRange(signal.bars, config.intraday.openingRangeStart, config.intraday.openingRangeEnd);
  const confirmation = exactBar(signal.bars, config.intraday.trendConfirmationEnd);
  const entryBar = exactBar(executionSession.bars, config.intraday.trendEntryTime);
  const exitBar = exactBar(executionSession.bars, config.intraday.forcedExitTime);
  if (!range || !validBar(confirmation) || !validBar(entryBar) || !validBar(exitBar)) return { status: 'REJECTED', reason: 'MISSING_REQUIRED_T1_BAR' };
  if (!Number.isFinite(signalContext.previousClose) || !Number.isFinite(signalContext.previousSma50)) return { status: 'NO_SIGNAL', reason: 'INSUFFICIENT_SMA50_HISTORY' };
  if (!(signalContext.previousClose > signalContext.previousSma50 && confirmation.close > range.high)) return { status: 'NO_SIGNAL', reason: 'T1_FILTER_FALSE' };
  const exit = hardStopExit(executionSession.bars, signal.bars, {
    entryTime: config.intraday.trendEntryTime, entryReference: entryBar.open, rangeHigh: range.high,
    forcedExitTime: config.intraday.forcedExitTime, hardStopFraction: config.intraday.hardStopFraction,
  });
  if (!exit.eligible) return { status: 'REJECTED', ...exit };
  return { status: 'TRADE', entryReference: entryBar.open, entryTime: config.intraday.trendEntryTime, range, ...exit };
}

export function determineG1(signalContext, executionSession, config) {
  const signal = signalContext?.session;
  if (!signal || !executionSession) return { status: 'REJECTED', reason: 'MISSING_SIGNAL_OR_EXECUTION_SESSION' };
  const range = openingRange(signal.bars, config.intraday.openingRangeStart, config.intraday.openingRangeEnd);
  const openBar = exactBar(signal.bars, config.intraday.openingRangeStart);
  const forced = exactBar(executionSession.bars, config.intraday.forcedExitTime);
  if (!range || !validBar(openBar) || !validBar(forced)) return { status: 'REJECTED', reason: 'MISSING_REQUIRED_G1_BAR' };
  if (!Number.isFinite(signalContext.previousClose)) return { status: 'NO_SIGNAL', reason: 'NO_PREVIOUS_CLOSE' };
  const gap = openBar.open / signalContext.previousClose - 1;
  if (gap > config.intraday.gapDownThresholdFraction) return { status: 'NO_SIGNAL', reason: 'GAP_FILTER_FALSE', gap };
  const signalBar = signal.bars.find((row) => clock(row) >= '09:30'
    && clock(row) <= config.intraday.latestGapSignalTime && row.close > range.high);
  if (!signalBar) return { status: 'NO_SIGNAL', reason: 'NO_RECOVERY', gap };
  const entryTime = minuteClock(minuteNumber(clock(signalBar)) + 1);
  const entryBar = exactBar(executionSession.bars, entryTime);
  if (!validBar(entryBar)) return { status: 'REJECTED', reason: 'MISSING_G1_ENTRY_BAR', entryTime };
  const exit = hardStopExit(executionSession.bars, signal.bars, {
    entryTime, entryReference: entryBar.open, rangeHigh: range.high,
    forcedExitTime: config.intraday.forcedExitTime, hardStopFraction: config.intraday.hardStopFraction,
  });
  if (!exit.eligible) return { status: 'REJECTED', ...exit };
  return { status: 'TRADE', entryReference: entryBar.open, entryTime, gap, range, ...exit };
}

function scenarioTrade(base, scenario, bps) {
  return { ...base, scenario, slippageBps: bps, ...calculateIntradayCosts({
    entryReference: base.entryReference, exitReference: base.exitReference, quantity: base.quantity, slippageBps: bps,
  }) };
}

export function runIntradayStrategies(signalCandles, executionCandles, config, period, strategyIds = ['T1', 'G1']) {
  const built = buildSignalContext(signalCandles);
  const executions = sessionMap(executionCandles);
  const definitions = { T1: determineT1, G1: determineG1 };
  const results = {};
  for (const [strategyId, determine] of Object.entries(definitions)) {
    if (!strategyIds.includes(strategyId)) continue;
    const trades = Object.fromEntries(Object.keys(config.slippageScenarios).map((key) => [key, []]));
    const rejectedSessions = [], noSignalSessions = [];
    for (const session of built.sessions.filter((row) => row.date >= period.start && row.date <= period.end)) {
      const outcome = determine(built.context.get(session.date), executions.get(session.date), config);
      if (outcome.status === 'REJECTED') { rejectedSessions.push({ date: session.date, reason: outcome.reason }); continue; }
      if (outcome.status !== 'TRADE') { noSignalSessions.push({ date: session.date, reason: outcome.reason }); continue; }
      const requestedAllocation = config.capital.fixedAllocationRupees;
      const quantity = Math.floor(requestedAllocation / outcome.entryReference);
      if (quantity < 1) { rejectedSessions.push({ date: session.date, reason: 'QUANTITY_ZERO' }); continue; }
      const base = {
        strategyId, date: session.date, requestedAllocation, quantity,
        deployedCapital: quantity * outcome.entryReference, ...outcome,
      };
      for (const [scenario, bps] of Object.entries(config.slippageScenarios)) trades[scenario].push(scenarioTrade(base, scenario, bps));
    }
    const summary = Object.fromEntries(Object.entries(trades).map(([key, rows]) => [key, summarizeTrades(rows, config.capital.modelRupees)]));
    results[strategyId] = {
      trades, rejectedSessions, noSignalSessions, summary,
      bootstrap: monthlyBootstrap(summary.normal.monthly, config.bootstrap.resamples, config.bootstrap.seed),
      concentration: concentration(trades.normal, summary.normal),
    };
  }
  return results;
}

export function evaluateIntradayGates(result, observedSessions, config, stage) {
  const normal = result.summary.normal, stress = result.summary.stress, severe = result.summary.severe;
  const activeMonths = Object.values(normal.monthly), years = Object.values(normal.yearly);
  const g = config.intradayGates, stageGate = g[stage];
  const rejectedRate = observedSessions ? result.rejectedSessions.length / observedSessions : 1;
  const tests = [
    ['minimum_trades', normal.trades >= stageGate.minimumTrades, normal.trades, `>= ${stageGate.minimumTrades}`],
    ['rejected_session_rate', rejectedRate <= g.maximumRejectedSessionRate, rejectedRate, `<= ${g.maximumRejectedSessionRate}`],
    ['normal_net_pnl', normal.netPnl > g.minimumNormalNetPnl, normal.netPnl, `> ${g.minimumNormalNetPnl}`],
    ['normal_profit_factor', Number(normal.profitFactor ?? 0) >= g.minimumNormalProfitFactor, normal.profitFactor, `>= ${g.minimumNormalProfitFactor}`],
    ['stress_net_pnl', stress.netPnl > g.minimumStressNetPnl, stress.netPnl, `> ${g.minimumStressNetPnl}`],
    ['stress_profit_factor', Number(stress.profitFactor ?? 0) >= g.minimumStressProfitFactor, stress.profitFactor, `>= ${g.minimumStressProfitFactor}`],
    ['severe_net_pnl', severe.netPnl > g.minimumSevereNetPnl, severe.netPnl, `> ${g.minimumSevereNetPnl}`],
    ['maximum_drawdown', normal.maximumDrawdown <= g.maximumDrawdownRupees, normal.maximumDrawdown, `<= ${g.maximumDrawdownRupees}`],
    ['profitable_years', years.filter((v) => v > 0).length >= stageGate.minimumProfitableYears, years.filter((v) => v > 0).length, `>= ${stageGate.minimumProfitableYears}`],
    ['profitable_active_month_fraction', activeMonths.length > 0 && activeMonths.filter((v) => v > 0).length / activeMonths.length >= g.minimumProfitableActiveMonthFraction, activeMonths.length ? activeMonths.filter((v) => v > 0).length / activeMonths.length : 0, `>= ${g.minimumProfitableActiveMonthFraction}`],
    ['bootstrap_lower_95_mean', result.bootstrap.lower95MeanPnl > g.minimumBootstrapLower95MeanPnl, result.bootstrap.lower95MeanPnl, `> ${g.minimumBootstrapLower95MeanPnl}`],
    ['single_year_concentration', result.concentration.maximumSingleYearPositiveContribution !== null && result.concentration.maximumSingleYearPositiveContribution <= g.maximumSingleYearPositiveContribution, result.concentration.maximumSingleYearPositiveContribution, `<= ${g.maximumSingleYearPositiveContribution}`],
    ['top_winner_concentration', result.concentration.top10PercentWinnerContribution !== null && result.concentration.top10PercentWinnerContribution <= g.maximumTopWinnerContribution, result.concentration.top10PercentWinnerContribution, `<= ${g.maximumTopWinnerContribution}`],
  ].map(([id, passed, value, requirement]) => ({ id, passed: Boolean(passed), value, requirement }));
  return { decision: tests.every((row) => row.passed) ? 'PASS' : 'REJECT', tests, failed: tests.filter((row) => !row.passed).map((row) => row.id) };
}

function deliveryScenario({ strategyId, signals, executionSessions, config, period, bps, buyAndHold = false }) {
  const dates = [...executionSessions.keys()].filter((value) => value >= period.start && value <= period.end).sort();
  const transactions = [], daily = [];
  let position = null, realized = 0, previousCumulative = 0, investedSessions = 0;
  let pendingDesired = buyAndHold;
  for (let index = 0; index < dates.length; index += 1) {
    const day = dates[index], session = executionSessions.get(day);
    const entryBar = exactBar(session.bars, config.positional.executionTime);
    const markBar = exactBar(session.bars, config.positional.dailyMarkTime);
    if (!validBar(entryBar) || !validBar(markBar)) continue;
    if (!buyAndHold) {
      const signal = signals.context.get(day);
      if (Number.isFinite(signal?.previousClose) && Number.isFinite(signal?.previousSma200)) {
        if (signal.previousClose > signal.previousSma200) pendingDesired = true;
        else if (signal.previousClose < signal.previousSma200) pendingDesired = false;
      }
    }
    if (pendingDesired && !position) {
      const quantity = Math.floor(config.capital.fixedAllocationRupees / entryBar.open);
      const fill = entryBar.open * (1 + bps / 10_000);
      const provisional = calculateDeliveryCosts({ entryReference: entryBar.open, exitReference: entryBar.open, quantity, slippageBps: bps });
      position = { entryDate: day, entryReference: entryBar.open, entryFill: fill, quantity, buyFees: provisional.buyFees };
      transactions.push({ strategyId, date: day, action: 'BUY', referencePrice: entryBar.open, fillPrice: fill, quantity, fees: provisional.buyFees });
    } else if (!pendingDesired && position) {
      const costs = calculateDeliveryCosts({ entryReference: position.entryReference, exitReference: entryBar.open, quantity: position.quantity, slippageBps: bps });
      realized += costs.netPnl;
      transactions.push({ strategyId, date: day, action: 'SELL', referencePrice: entryBar.open, fillPrice: costs.exitFill, quantity: position.quantity, fees: costs.sellFees, tradeNetPnl: costs.netPnl });
      position = null;
    }
    if (position) investedSessions += 1;
    let cumulative = realized;
    if (position) cumulative += (markBar.open - position.entryFill) * position.quantity - position.buyFees;
    const delta = cumulative - previousCumulative;
    daily.push({ strategyId, date: day, netPnl: delta, deployedCapital: position ? position.quantity * position.entryReference : 0 });
    previousCumulative = cumulative;
  }
  const finalDay = dates.at(-1), finalSession = executionSessions.get(finalDay), finalBar = exactBar(finalSession?.bars ?? [], config.positional.periodEndExitTime);
  if (position && validBar(finalBar)) {
    const costs = calculateDeliveryCosts({ entryReference: position.entryReference, exitReference: finalBar.open, quantity: position.quantity, slippageBps: bps });
    const finalNet = realized + costs.netPnl;
    const adjustment = finalNet - previousCumulative;
    if (daily.length) daily.at(-1).netPnl += adjustment;
    realized = finalNet;
    transactions.push({ strategyId, date: finalDay, action: 'SELL_PERIOD_END', referencePrice: finalBar.open, fillPrice: costs.exitFill, quantity: position.quantity, fees: costs.sellFees, tradeNetPnl: costs.netPnl });
    position = null;
  }
  const synthetic = daily.map((row) => ({
    ...row, brokerage: 0, stt: 0, transactionCharges: 0, sebiCharges: 0, stampDuty: 0, ipft: 0, gst: 0, fees: 0, slippageCost: 0, multiplier: 1,
  }));
  const summary = summarizeTrades(synthetic, config.capital.modelRupees);
  summary.netPnl = round(daily.reduce((total, row) => total + row.netPnl, 0));
  summary.investedSessions = investedSessions;
  summary.roundTrips = transactions.filter((row) => row.action.startsWith('SELL')).length;
  summary.transactionFees = round(transactions.reduce((total, row) => total + (row.fees ?? 0), 0));
  return { daily, transactions, summary };
}

export function runPositionalStrategies(signalCandles, executionCandles, config, period, enabled = true) {
  if (!enabled) return {};
  const signals = buildSignalContext(signalCandles), executions = sessionMap(executionCandles);
  const output = { P1: { scenarios: {} }, B1: { scenarios: {} } };
  for (const [scenario, bps] of Object.entries(config.slippageScenarios)) {
    output.P1.scenarios[scenario] = deliveryScenario({ strategyId: 'P1', signals, executionSessions: executions, config, period, bps });
    output.B1.scenarios[scenario] = deliveryScenario({ strategyId: 'B1', signals, executionSessions: executions, config, period, bps, buyAndHold: true });
  }
  return output;
}

export function evaluatePositionalGates(results, config, stage) {
  const p = results.P1.scenarios, b = results.B1.scenarios, g = config.positionalGates;
  const relative = b.normal.summary.netPnl > 0
    && ((p.normal.summary.netPnl > b.normal.summary.netPnl && p.normal.summary.maximumDrawdown <= b.normal.summary.maximumDrawdown)
      || (p.normal.summary.netPnl >= 0.9 * b.normal.summary.netPnl && p.normal.summary.maximumDrawdown <= 0.75 * b.normal.summary.maximumDrawdown));
  const tests = [
    ['normal_net_pnl', p.normal.summary.netPnl > g.minimumNormalNetPnl, p.normal.summary.netPnl, `> ${g.minimumNormalNetPnl}`],
    ['stress_net_pnl', p.stress.summary.netPnl > g.minimumStressNetPnl, p.stress.summary.netPnl, `> ${g.minimumStressNetPnl}`],
    ['severe_net_pnl', p.severe.summary.netPnl > g.minimumSevereNetPnl, p.severe.summary.netPnl, `> ${g.minimumSevereNetPnl}`],
    ['minimum_invested_sessions', p.normal.summary.investedSessions >= g.minimumInvestedSessions[stage], p.normal.summary.investedSessions, `>= ${g.minimumInvestedSessions[stage]}`],
    ['minimum_round_trips', p.normal.summary.roundTrips >= g.minimumRoundTrips[stage], p.normal.summary.roundTrips, `>= ${g.minimumRoundTrips[stage]}`],
    ['relative_to_buy_hold', relative, { p1NetPnl: p.normal.summary.netPnl, p1Drawdown: p.normal.summary.maximumDrawdown, b1NetPnl: b.normal.summary.netPnl, b1Drawdown: b.normal.summary.maximumDrawdown }, g.acceptance],
  ].map(([id, passed, value, requirement]) => ({ id, passed: Boolean(passed), value, requirement }));
  return { decision: tests.every((row) => row.passed) ? 'PASS' : 'REJECT', tests, failed: tests.filter((row) => !row.passed).map((row) => row.id) };
}
