import { calculateDeliveryCosts, calculateIntradayCosts } from '../nifty-etf-m1/costs.mjs';
import { concentration, groupSessions, monthlyBootstrap, summarizeTrades, validBar } from '../nifty-etf-m1/engine.mjs';

const clock = (row) => row.timestamp.slice(11, 16);
const minute = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const clockFromMinute = (value) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const exact = (bars, at) => bars.find((row) => clock(row) === at);
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
export const sma = (values, length) => values.length >= length ? mean(values.slice(-length)) : null;

export function completeWindow(session, start = '09:20', end = '15:15') {
  if (!session) return false;
  const rows = session.bars.filter((row) => clock(row) >= start && clock(row) <= end);
  const count = minute(end) - minute(start) + 1;
  return rows.length === count && rows.every((row, index) => validBar(row) && clock(row) === clockFromMinute(minute(start) + index));
}

export function buildPostOpenDaily(candles) {
  const output = [];
  let previousClose = null;
  for (const session of groupSessions(candles)) {
    const entry = exact(session.bars, '09:20'), closeBar = exact(session.bars, '15:29');
    const rows = session.bars.filter((row) => clock(row) >= '09:20' && clock(row) <= '15:29' && validBar(row));
    if (!validBar(entry) || !validBar(closeBar) || !rows.length) continue;
    const high = Math.max(...rows.map((row) => row.high)), low = Math.min(...rows.map((row) => row.low));
    const trueRange = previousClose === null ? high - low : Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
    output.push({ date: session.date, open: entry.open, high, low, close: closeBar.close, trueRange, session, complete: completeWindow(session) });
    previousClose = closeBar.close;
  }
  return output;
}

const byDate = (rows) => new Map(rows.map((row, index) => [row.date, { row, index }]));

export function st1Signal(asset, market, assetIndex, marketIndex, config) {
  const p = config.st1;
  if (assetIndex < Math.max(p.assetSma - 1, p.downSessions, p.atrSessions - 1) || marketIndex < p.marketSma - 1) return null;
  const a = asset[assetIndex], m = market[marketIndex];
  const down = Array.from({ length: p.downSessions }, (_, offset) => asset[assetIndex - offset].close < asset[assetIndex - offset - 1].close).every(Boolean);
  const decline = a.close / asset[assetIndex - p.downSessions].close - 1;
  const assetAverage = sma(asset.slice(0, assetIndex + 1).map((row) => row.close), p.assetSma);
  const marketAverage = sma(market.slice(0, marketIndex + 1).map((row) => row.close), p.marketSma);
  if (!(a.close > assetAverage && m.close > marketAverage && down && decline <= p.minimumCumulativeDecline)) return null;
  return { signalDate: a.date, atr: mean(asset.slice(assetIndex - p.atrSessions + 1, assetIndex + 1).map((row) => row.trueRange)), cumulativeDecline: decline };
}

function stopExit(session, stop, start, end) {
  for (const bar of session.bars.filter((row) => clock(row) >= start && clock(row) <= end)) {
    if (bar.open < stop) return { exitReference: bar.open, exitTime: clock(bar), exitReason: 'GAP_STOP' };
    if (bar.low <= stop) return { exitReference: stop, exitTime: clock(bar), exitReason: 'STOP' };
  }
  return null;
}

const deliveryTrade = (base, scenario, bps) => ({ ...base, scenario, slippageBps: bps, ...calculateDeliveryCosts({ entryReference: base.entryReference, exitReference: base.exitReference, quantity: base.quantity, slippageBps: bps }) });
const intradayTrade = (base, scenario, bps) => ({ ...base, scenario, slippageBps: bps, ...calculateIntradayCosts({ entryReference: base.entryReference, exitReference: base.exitReference, quantity: base.quantity, slippageBps: bps }) });

function summarize(scenarios, rejectedSessions, noSignalSessions, config) {
  const summary = Object.fromEntries(Object.entries(scenarios).map(([key, rows]) => [key, summarizeTrades(rows, config.capital.modelRupees)]));
  for (const item of Object.values(summary)) delete item.ladderUsage;
  return { trades: scenarios, rejectedSessions, noSignalSessions, summary, bootstrap: monthlyBootstrap(summary.normal.monthly, config.bootstrap.resamples, config.bootstrap.seed), concentration: concentration(scenarios.normal, summary.normal) };
}

export function runST1(signalCandles, executionCandles, config, period) {
  const market = buildPostOpenDaily(signalCandles), asset = buildPostOpenDaily(executionCandles), marketLookup = byDate(market);
  const scenarios = Object.fromEntries(Object.keys(config.slippageScenarios).map((key) => [key, []]));
  const rejectedSessions = [], noSignalSessions = [];
  let pending = null, pendingExit = false, position = null;
  for (let index = 0; index < asset.length; index += 1) {
    const day = asset[index]; if (day.date < period.start || day.date > period.end) continue;
    const marketItem = marketLookup.get(day.date);
    if (!day.complete || !marketItem?.row.complete) {
      rejectedSessions.push({ date: day.date, reason: 'INCOMPLETE_POST_OPEN_WINDOW', openTradeInvalidated: Boolean(position) });
      if (position) { position = null; pendingExit = false; }
      continue;
    }
    const entryBar = exact(day.session.bars, config.st1.entryTime);
    if (position && pendingExit) {
      const base = { ...position, date: day.date, exitDate: day.date, exitReference: entryBar.open, exitTime: config.st1.entryTime, exitReason: 'DAILY_SIGNAL' };
      for (const [scenario, bps] of Object.entries(config.slippageScenarios)) scenarios[scenario].push(deliveryTrade(base, scenario, bps));
      position = null; pendingExit = false;
    }
    if (!position && pending) {
      const quantity = Math.floor(config.capital.fixedAllocationRupees / entryBar.open);
      if (quantity > 0) position = { strategyId: 'ST1', signalDate: pending.signalDate, entryDate: day.date, entryReference: entryBar.open, entryTime: config.st1.entryTime, stopReference: entryBar.open - config.st1.atrStopMultiple * pending.atr, requestedAllocation: config.capital.fixedAllocationRupees, deployedCapital: quantity * entryBar.open, quantity, holdingSessions: 0, signal: pending };
      pending = null;
    }
    if (position) {
      position.holdingSessions += 1;
      const stopped = stopExit(day.session, position.stopReference, config.st1.entryTime, config.session.intradayExit);
      if (stopped || position.holdingSessions >= config.st1.maximumHoldingSessions) {
        const outcome = stopped ?? { exitReference: exact(day.session.bars, config.session.intradayExit).open, exitTime: config.session.intradayExit, exitReason: 'TIME_EXIT' };
        const base = { ...position, date: day.date, exitDate: day.date, ...outcome };
        for (const [scenario, bps] of Object.entries(config.slippageScenarios)) scenarios[scenario].push(deliveryTrade(base, scenario, bps));
        position = null; pendingExit = false;
      } else {
        const average = sma(asset.slice(0, index + 1).map((row) => row.close), config.st1.exitSma);
        if (average !== null && day.close > average) pendingExit = true;
      }
    }
    if (!position && !pending) {
      const signal = st1Signal(asset, market, index, marketItem.index, config);
      if (signal) pending = signal; else noSignalSessions.push({ date: day.date, reason: 'ST1_FILTER_FALSE' });
    }
  }
  if (position) {
    const day = asset.filter((row) => row.date >= period.start && row.date <= period.end && row.complete).at(-1);
    if (day) {
      const base = { ...position, date: day.date, exitDate: day.date, exitReference: exact(day.session.bars, config.session.intradayExit).open, exitTime: config.session.intradayExit, exitReason: 'PERIOD_END' };
      for (const [scenario, bps] of Object.entries(config.slippageScenarios)) scenarios[scenario].push(deliveryTrade(base, scenario, bps));
    }
  }
  return summarize(scenarios, rejectedSessions, noSignalSessions, config);
}

export function fiveMinutePostOpen(session, lastEnd) {
  const rows = session?.bars.filter((row) => clock(row) >= '09:20' && clock(row) <= lastEnd) ?? [];
  const blocks = []; let pv = 0, volumeTotal = 0;
  for (let cursor = 0; cursor + 4 < rows.length; cursor += 5) {
    const slice = rows.slice(cursor, cursor + 5), expected = minute('09:20') + cursor;
    if (!slice.every((row, index) => validBar(row) && clock(row) === clockFromMinute(expected + index))) return [];
    for (const row of slice) { const volume = Math.max(0, Number(row.volume) || 0); pv += ((row.high + row.low + row.close) / 3) * volume; volumeTotal += volume; }
    blocks.push({ start: clock(slice[0]), end: clock(slice.at(-1)), high: Math.max(...slice.map((row) => row.high)), low: Math.min(...slice.map((row) => row.low)), close: slice.at(-1).close, vwap: volumeTotal > 0 ? pv / volumeTotal : null });
  }
  return blocks;
}

function executeIntraday(session, entryBar, stop, target, end) {
  for (const bar of session.bars.filter((row) => clock(row) >= clock(entryBar) && clock(row) <= end)) {
    if (bar.open < stop) return { exitReference: bar.open, exitTime: clock(bar), exitReason: 'GAP_STOP' };
    if (bar.open > target) return { exitReference: bar.open, exitTime: clock(bar), exitReason: 'GAP_TARGET' };
    if (bar.low <= stop) return { exitReference: stop, exitTime: clock(bar), exitReason: 'STOP' };
    if (bar.high >= target) return { exitReference: target, exitTime: clock(bar), exitReason: 'TARGET' };
    if (clock(bar) === end) return { exitReference: bar.open, exitTime: end, exitReason: 'FORCED_EXIT' };
  }
  return null;
}

export function determineIntraday(id, marketSession, assetSession, priorMarketClose, priorMarketSma, config) {
  if (!completeWindow(marketSession) || !completeWindow(assetSession)) return { status: 'REJECTED', reason: 'INCOMPLETE_POST_OPEN_WINDOW' };
  if (!(priorMarketClose > priorMarketSma)) return { status: 'NO_SIGNAL', reason: 'MARKET_REGIME_FALSE' };
  const p = config[id.toLowerCase()], blocks = fiveMinutePostOpen(assetSession, p.lastSignalBlockEnd);
  const rangeBlocks = blocks.filter((row) => row.end <= p.rangeEnd);
  if (rangeBlocks.length !== 3) return { status: 'REJECTED', reason: 'INCOMPLETE_OPENING_RANGE' };
  const rangeHigh = Math.max(...rangeBlocks.map((row) => row.high)), rangeLow = Math.min(...rangeBlocks.map((row) => row.low));
  let trendEstablished = false;
  for (let index = 3; index < blocks.length; index += 1) {
    const current = blocks[index], previous = blocks[index - 1];
    if (current.end < p.firstSignalBlockEnd || current.end > p.lastSignalBlockEnd) continue;
    const signal = id === 'OR1' ? current.close > rangeHigh : trendEstablished && Number.isFinite(current.vwap) && current.low <= current.vwap && current.close > current.vwap && current.close > previous.close;
    if (id === 'VP1' && current.close > rangeHigh) trendEstablished = true;
    if (!signal) continue;
    const entryTime = clockFromMinute(minute(current.end) + 1), entryBar = exact(assetSession.bars, entryTime);
    if (!validBar(entryBar)) return { status: 'REJECTED', reason: 'MISSING_ENTRY_BAR' };
    const stop = id === 'OR1' ? rangeLow : current.low, risk = entryBar.open - stop, fraction = risk / entryBar.open;
    if (!(risk > 0 && fraction >= p.minimumRiskFraction && fraction <= p.maximumRiskFraction)) return { status: 'NO_SIGNAL', reason: 'RISK_FILTER_FALSE' };
    const target = entryBar.open + p.rewardRiskMultiple * risk;
    const outcome = executeIntraday(assetSession, entryBar, stop, target, config.session.intradayExit);
    return outcome ? { status: 'TRADE', entryReference: entryBar.open, entryTime, stop, target, ...outcome } : { status: 'REJECTED', reason: 'NO_EXIT_BAR' };
  }
  return { status: 'NO_SIGNAL', reason: `${id}_FILTER_FALSE` };
}

export function runIntraday(id, signalCandles, executionCandles, config, period) {
  const signalSessions = groupSessions(signalCandles), execution = new Map(groupSessions(executionCandles).map((row) => [row.date, row]));
  const daily = buildPostOpenDaily(signalCandles), lookup = byDate(daily);
  const scenarios = Object.fromEntries(Object.keys(config.slippageScenarios).map((key) => [key, []]));
  const rejectedSessions = [], noSignalSessions = [];
  for (const session of signalSessions.filter((row) => row.date >= period.start && row.date <= period.end)) {
    const item = lookup.get(session.date), priorIndex = item?.index - 1, p = config[id.toLowerCase()];
    const priorClose = priorIndex >= 0 ? daily[priorIndex].close : null;
    const priorSma = priorIndex >= p.marketSma - 1 ? sma(daily.slice(0, priorIndex + 1).map((row) => row.close), p.marketSma) : null;
    const outcome = determineIntraday(id, session, execution.get(session.date), priorClose, priorSma, config);
    if (outcome.status === 'REJECTED') { rejectedSessions.push({ date: session.date, reason: outcome.reason }); continue; }
    if (outcome.status !== 'TRADE') { noSignalSessions.push({ date: session.date, reason: outcome.reason }); continue; }
    const quantity = Math.floor(config.capital.fixedAllocationRupees / outcome.entryReference);
    if (quantity < 1) { rejectedSessions.push({ date: session.date, reason: 'QUANTITY_ZERO' }); continue; }
    const base = { strategyId: id, date: session.date, requestedAllocation: config.capital.fixedAllocationRupees, deployedCapital: quantity * outcome.entryReference, quantity, ...outcome };
    for (const [scenario, bps] of Object.entries(config.slippageScenarios)) scenarios[scenario].push(intradayTrade(base, scenario, bps));
  }
  return summarize(scenarios, rejectedSessions, noSignalSessions, config);
}

export function evaluateGates(id, result, observedSessions, config, stage) {
  const normal = result.summary.normal, stress = result.summary.stress, severe = result.summary.severe, g = config.gates;
  const months = Object.values(normal.monthly), years = Object.values(normal.yearly), rejectedRate = observedSessions ? result.rejectedSessions.length / observedSessions : 1;
  const tests = [
    ['minimum_trades', normal.trades >= g.minimumTrades[stage][id], normal.trades, `>= ${g.minimumTrades[stage][id]}`],
    ['rejected_session_rate', rejectedRate <= g.maximumRejectedSessionRate, rejectedRate, `<= ${g.maximumRejectedSessionRate}`],
    ['normal_net_pnl', normal.netPnl > g.minimumNormalNetPnl, normal.netPnl, `> ${g.minimumNormalNetPnl}`],
    ['normal_profit_factor', Number(normal.profitFactor ?? 0) >= g.minimumNormalProfitFactor, normal.profitFactor, `>= ${g.minimumNormalProfitFactor}`],
    ['stress_net_pnl', stress.netPnl > g.minimumStressNetPnl, stress.netPnl, `> ${g.minimumStressNetPnl}`],
    ['stress_profit_factor', Number(stress.profitFactor ?? 0) >= g.minimumStressProfitFactor, stress.profitFactor, `>= ${g.minimumStressProfitFactor}`],
    ['severe_net_pnl', severe.netPnl > g.minimumSevereNetPnl, severe.netPnl, `> ${g.minimumSevereNetPnl}`],
    ['maximum_drawdown', normal.maximumDrawdown <= g.maximumDrawdownRupees, normal.maximumDrawdown, `<= ${g.maximumDrawdownRupees}`],
    ['profitable_years', years.filter((value) => value > 0).length >= g.minimumProfitableYears[stage], years.filter((value) => value > 0).length, `>= ${g.minimumProfitableYears[stage]}`],
    ['profitable_active_month_fraction', months.length > 0 && months.filter((value) => value > 0).length / months.length >= g.minimumProfitableActiveMonthFraction, months.length ? months.filter((value) => value > 0).length / months.length : 0, `>= ${g.minimumProfitableActiveMonthFraction}`],
    ['bootstrap_lower_95_mean', result.bootstrap.lower95MeanPnl > g.minimumBootstrapLower95MeanPnl, result.bootstrap.lower95MeanPnl, `> ${g.minimumBootstrapLower95MeanPnl}`],
    ['single_year_concentration', result.concentration.maximumSingleYearPositiveContribution !== null && result.concentration.maximumSingleYearPositiveContribution <= g.maximumSingleYearPositiveContribution, result.concentration.maximumSingleYearPositiveContribution, `<= ${g.maximumSingleYearPositiveContribution}`],
    ['top_winner_concentration', result.concentration.top10PercentWinnerContribution !== null && result.concentration.top10PercentWinnerContribution <= g.maximumTopWinnerContribution, result.concentration.top10PercentWinnerContribution, `<= ${g.maximumTopWinnerContribution}`],
    ['maximum_allocation', normal.maximumDeployedCapital <= g.maximumAllocationRupees, normal.maximumDeployedCapital, `<= ${g.maximumAllocationRupees}`],
  ].map(([gateId, passed, value, requirement]) => ({ id: gateId, passed: Boolean(passed), value, requirement }));
  const coverage = tests.find((row) => row.id === 'rejected_session_rate').passed;
  return { decision: !coverage ? 'DATA_BLOCKED' : tests.every((row) => row.passed) ? 'PASS' : 'REJECT', tests, failed: tests.filter((row) => !row.passed).map((row) => row.id) };
}
