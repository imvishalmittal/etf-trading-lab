import { calculateDeliveryCosts, calculateIntradayCosts } from '../nifty-etf-m1/costs.mjs';
import { concentration, groupSessions, monthlyBootstrap, summarizeTrades, validBar } from '../nifty-etf-m1/engine.mjs';

const round = (value, digits = 6) => Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
const clock = (row) => row.timestamp.slice(11, 16);
const minute = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const clockFromMinute = (value) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const exact = (bars, at) => bars.find((row) => clock(row) === at);
const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;

export function sma(values, length) {
  return values.length >= length ? mean(values.slice(-length)) : null;
}

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function completeMinuteSession(session, end = '15:29') {
  if (!session) return false;
  const startMinute = minute('09:15'), endMinute = minute(end);
  const bars = session.bars.filter((row) => clock(row) >= '09:15' && clock(row) <= end);
  if (bars.length !== endMinute - startMinute + 1) return false;
  return bars.every((row, index) => clock(row) === clockFromMinute(startMinute + index) && validBar(row));
}

export function buildDaily(candles) {
  const daily = [];
  let previousClose = null;
  for (const session of groupSessions(candles)) {
    const openBar = exact(session.bars, '09:15'), closeBar = exact(session.bars, '15:29');
    if (!validBar(openBar) || !validBar(closeBar)) continue;
    const rows = session.bars.filter(validBar);
    const high = Math.max(...rows.map((row) => row.high));
    const low = Math.min(...rows.map((row) => row.low));
    const closeValue = closeBar.close;
    const trueRange = previousClose === null ? high - low : Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
    daily.push({
      date: session.date, open: openBar.open, high, low, close: closeValue,
      markOpen: closeBar.open, volume: rows.reduce((total, row) => total + Math.max(0, Number(row.volume) || 0), 0),
      trueRange, session, complete: completeMinuteSession(session),
    });
    previousClose = closeValue;
  }
  return daily;
}

function indexByDate(rows) { return new Map(rows.map((row, index) => [row.date, { row, index }])); }

export function crossGapInvalidDates(signalCandles, executionCandles, threshold) {
  const market = buildDaily(signalCandles), asset = buildDaily(executionCandles), marketLookup = indexByDate(market);
  const invalid = [];
  for (let index = 1; index < asset.length; index += 1) {
    const item = marketLookup.get(asset[index].date);
    if (!item || item.index < 1) continue;
    const assetGap = asset[index].open / asset[index - 1].close - 1;
    const marketGap = item.row.open / market[item.index - 1].close - 1;
    const divergence = assetGap - marketGap;
    if (Math.abs(divergence) > threshold) invalid.push({ date: asset[index].date, assetGap, marketGap, divergence });
  }
  return invalid;
}

export function s1Signal(assetRows, marketRows, assetIndex, marketIndex, config) {
  const p = config.shortTerm.s1;
  if (assetIndex < Math.max(p.assetSma, p.downSessions, p.atrSessions) - 1 || marketIndex < p.marketSma - 1) return null;
  const asset = assetRows[assetIndex], market = marketRows[marketIndex];
  const assetSma = sma(assetRows.slice(0, assetIndex + 1).map((row) => row.close), p.assetSma);
  const marketSma = sma(marketRows.slice(0, marketIndex + 1).map((row) => row.close), p.marketSma);
  const consecutiveDown = Array.from({ length: p.downSessions }, (_, offset) => assetRows[assetIndex - offset].close < assetRows[assetIndex - offset - 1].close).every(Boolean);
  const cumulative = asset.close / assetRows[assetIndex - p.downSessions].close - 1;
  if (!(market.close > marketSma && asset.close > assetSma && consecutiveDown && cumulative <= p.minimumCumulativeDecline)) return null;
  return { signalDate: asset.date, atr: mean(assetRows.slice(assetIndex - p.atrSessions + 1, assetIndex + 1).map((row) => row.trueRange)), cumulativeDecline: cumulative };
}

export function s2Signal(assetRows, assetIndex, config) {
  const p = config.shortTerm.s2;
  const history = Math.max(p.breakoutSessions, p.assetSma - 1, p.volumeMedianSessions, p.atrSessions - 1);
  if (assetIndex < history) return null;
  const asset = assetRows[assetIndex];
  const priorCloses = assetRows.slice(assetIndex - p.breakoutSessions, assetIndex).map((row) => row.close);
  const assetSma = sma(assetRows.slice(0, assetIndex + 1).map((row) => row.close), p.assetSma);
  const priorMedianVolume = median(assetRows.slice(assetIndex - p.volumeMedianSessions, assetIndex).map((row) => row.volume));
  if (!(asset.close > Math.max(...priorCloses) && asset.close > assetSma && priorMedianVolume > 0 && asset.volume >= p.minimumVolumeMultiple * priorMedianVolume)) return null;
  return { signalDate: asset.date, atr: mean(assetRows.slice(assetIndex - p.atrSessions + 1, assetIndex + 1).map((row) => row.trueRange)), volumeMultiple: asset.volume / priorMedianVolume };
}

function shortTermExitSignal(id, assetRows, index, config) {
  if (id === 'S1') {
    const length = config.shortTerm.s1.exitSma;
    const average = sma(assetRows.slice(0, index + 1).map((row) => row.close), length);
    return average !== null && assetRows[index].close > average;
  }
  const length = config.shortTerm.s2.exitLowSessions;
  if (index < length) return false;
  return assetRows[index].close < Math.min(...assetRows.slice(index - length, index).map((row) => row.close));
}

export function stopOutcome(session, stop) {
  for (const bar of session.bars.filter((row) => clock(row) >= '09:15' && clock(row) <= '15:29')) {
    if (bar.open < stop) return { exitReference: bar.open, exitTime: clock(bar), exitReason: 'GAP_STOP' };
    if (bar.low <= stop) return { exitReference: stop, exitTime: clock(bar), exitReason: 'ATR_STOP' };
  }
  return null;
}

function deliveryTrade(base, scenario, bps) {
  return { ...base, scenario, slippageBps: bps, ...calculateDeliveryCosts({
    entryReference: base.entryReference, exitReference: base.exitReference,
    quantity: base.quantity, slippageBps: bps,
  }) };
}

export function runShortTerm(id, signalCandles, executionCandles, config, period, invalidDates = new Set()) {
  const marketRows = buildDaily(signalCandles), assetRows = buildDaily(executionCandles);
  const marketLookup = indexByDate(marketRows);
  const scenarios = Object.fromEntries(Object.keys(config.slippageScenarios).map((key) => [key, []]));
  const rejectedSessions = [], noSignalSessions = [];
  let pendingEntry = null, pendingExit = false, position = null;
  const maximumHolding = id === 'S1' ? config.shortTerm.s1.maximumHoldingSessions : config.shortTerm.s2.maximumHoldingSessions;
  for (let index = 0; index < assetRows.length; index += 1) {
    const day = assetRows[index];
    if (day.date < period.start || day.date > period.end) continue;
    const marketItem = marketLookup.get(day.date);
    if (!day.complete || !marketItem?.row.complete || invalidDates.has(day.date)) {
      rejectedSessions.push({ date: day.date, reason: invalidDates.has(day.date) ? 'CROSS_INSTRUMENT_GAP_DIVERGENCE' : 'INCOMPLETE_MINUTE_SESSION' });
      if (position) { position = null; pendingExit = false; rejectedSessions.at(-1).openTradeInvalidated = true; }
      continue;
    }
    const openBar = exact(day.session.bars, config.shortTerm.executionTime);
    if (position && pendingExit) {
      const base = { ...position, exitDate: day.date, date: day.date, exitReference: openBar.open, exitTime: config.shortTerm.executionTime, exitReason: 'DAILY_SIGNAL' };
      for (const [scenario, bps] of Object.entries(config.slippageScenarios)) scenarios[scenario].push(deliveryTrade(base, scenario, bps));
      position = null; pendingExit = false;
    }
    if (!position && pendingEntry) {
      const quantity = Math.floor(config.capital.fixedAllocationRupees / openBar.open);
      if (quantity > 0) position = {
        strategyId: id, signalDate: pendingEntry.signalDate, entryDate: day.date,
        entryReference: openBar.open, entryTime: config.shortTerm.executionTime,
        stopReference: openBar.open - (id === 'S1' ? config.shortTerm.s1.atrStopMultiple : config.shortTerm.s2.atrStopMultiple) * pendingEntry.atr,
        requestedAllocation: config.capital.fixedAllocationRupees, deployedCapital: quantity * openBar.open,
        quantity, holdingSessions: 0, signal: pendingEntry,
      };
      pendingEntry = null;
    }
    if (position) {
      position.holdingSessions += 1;
      const stopped = stopOutcome(day.session, position.stopReference);
      if (stopped) {
        const base = { ...position, exitDate: day.date, date: day.date, ...stopped };
        for (const [scenario, bps] of Object.entries(config.slippageScenarios)) scenarios[scenario].push(deliveryTrade(base, scenario, bps));
        position = null; pendingExit = false;
      } else if (position.holdingSessions >= maximumHolding) {
        const base = { ...position, exitDate: day.date, date: day.date, exitReference: day.markOpen, exitTime: config.shortTerm.dailyMarkTime, exitReason: 'TIME_EXIT' };
        for (const [scenario, bps] of Object.entries(config.slippageScenarios)) scenarios[scenario].push(deliveryTrade(base, scenario, bps));
        position = null; pendingExit = false;
      } else if (shortTermExitSignal(id, assetRows, index, config)) pendingExit = true;
    }
    if (!position && !pendingEntry) {
      const signal = id === 'S1'
        ? s1Signal(assetRows, marketRows, index, marketItem.index, config)
        : s2Signal(assetRows, index, config);
      if (signal) pendingEntry = signal;
      else noSignalSessions.push({ date: day.date, reason: `${id}_FILTER_FALSE` });
    }
  }
  if (position) {
    const day = assetRows.filter((row) => row.date >= period.start && row.date <= period.end && row.complete).at(-1);
    if (day) {
      const base = { ...position, exitDate: day.date, date: day.date, exitReference: day.markOpen, exitTime: config.shortTerm.dailyMarkTime, exitReason: 'PERIOD_END' };
      for (const [scenario, bps] of Object.entries(config.slippageScenarios)) scenarios[scenario].push(deliveryTrade(base, scenario, bps));
    }
  }
  return summarizeResult(scenarios, rejectedSessions, noSignalSessions, config);
}

export function fiveMinuteBlocks(session, through = '11:59') {
  const bars = session.bars.filter((row) => clock(row) >= '09:15' && clock(row) <= through);
  const blocks = [];
  let cumulativePv = 0, cumulativeVolume = 0;
  for (let cursor = 0; cursor + 4 < bars.length; cursor += 5) {
    const rows = bars.slice(cursor, cursor + 5);
    const expectedStart = minute('09:15') + cursor;
    if (!rows.every((row, index) => clock(row) === clockFromMinute(expectedStart + index) && validBar(row))) return [];
    for (const row of rows) {
      const volume = Math.max(0, Number(row.volume) || 0);
      cumulativePv += ((row.high + row.low + row.close) / 3) * volume;
      cumulativeVolume += volume;
    }
    blocks.push({
      start: clock(rows[0]), end: clock(rows.at(-1)), close: rows.at(-1).close,
      low: Math.min(...rows.map((row) => row.low)), vwap: cumulativeVolume > 0 ? cumulativePv / cumulativeVolume : null,
      minimumLow: Math.min(...bars.slice(0, cursor + 5).map((row) => row.low)),
    });
  }
  return blocks;
}

export function determineI1(signalSession, executionSession, previousMarketClose, previousMarketSma, config) {
  if (!completeMinuteSession(signalSession, config.intraday.forcedExitTime) || !completeMinuteSession(executionSession, config.intraday.forcedExitTime)) return { status: 'REJECTED', reason: 'INCOMPLETE_MINUTE_SESSION' };
  if (!(previousMarketClose > previousMarketSma)) return { status: 'NO_SIGNAL', reason: 'MARKET_REGIME_FALSE' };
  const openBar = exact(executionSession.bars, config.intraday.sessionOpen);
  const signalBlocks = fiveMinuteBlocks(signalSession, config.intraday.lastSignalBlockEnd);
  const assetBlocks = fiveMinuteBlocks(executionSession, config.intraday.lastSignalBlockEnd);
  for (let index = 1; index < assetBlocks.length; index += 1) {
    const current = assetBlocks[index], previous = assetBlocks[index - 1], market = signalBlocks[index];
    if (current.end < config.intraday.firstSignalBlockEnd || current.end > config.intraday.lastSignalBlockEnd) continue;
    const dropped = current.minimumLow / openBar.open - 1 <= config.intraday.minimumDropFromOpen;
    const reclaimed = Number.isFinite(previous.vwap) && Number.isFinite(current.vwap) && previous.close <= previous.vwap && current.close > current.vwap;
    if (!(dropped && reclaimed && market?.close > previousMarketClose)) continue;
    const entryTime = clockFromMinute(minute(current.end) + 1);
    const entryBar = exact(executionSession.bars, entryTime);
    if (!validBar(entryBar)) return { status: 'REJECTED', reason: 'MISSING_ENTRY_BAR' };
    const risk = entryBar.open - current.low;
    if (!(risk > 0)) return { status: 'NO_SIGNAL', reason: 'NON_POSITIVE_RISK' };
    const stop = current.low, target = entryBar.open + config.intraday.rewardRiskMultiple * risk;
    for (const bar of executionSession.bars.filter((row) => clock(row) >= entryTime && clock(row) <= config.intraday.forcedExitTime)) {
      if (bar.open < stop) return { status: 'TRADE', entryReference: entryBar.open, entryTime, exitReference: bar.open, exitTime: clock(bar), exitReason: 'GAP_STOP', stop, target };
      if (bar.open > target) return { status: 'TRADE', entryReference: entryBar.open, entryTime, exitReference: bar.open, exitTime: clock(bar), exitReason: 'GAP_TARGET', stop, target };
      if (bar.low <= stop) return { status: 'TRADE', entryReference: entryBar.open, entryTime, exitReference: stop, exitTime: clock(bar), exitReason: 'STOP', stop, target };
      if (bar.high >= target) return { status: 'TRADE', entryReference: entryBar.open, entryTime, exitReference: target, exitTime: clock(bar), exitReason: 'TARGET', stop, target };
      if (clock(bar) === config.intraday.forcedExitTime) return { status: 'TRADE', entryReference: entryBar.open, entryTime, exitReference: bar.open, exitTime: clock(bar), exitReason: 'FORCED_EXIT', stop, target };
    }
  }
  return { status: 'NO_SIGNAL', reason: 'I1_FILTER_FALSE' };
}

function intradayTrade(base, scenario, bps) {
  return { ...base, scenario, slippageBps: bps, ...calculateIntradayCosts({ entryReference: base.entryReference, exitReference: base.exitReference, quantity: base.quantity, slippageBps: bps }) };
}

export function runI1(signalCandles, executionCandles, config, period, invalidDates = new Set()) {
  const signalSessions = groupSessions(signalCandles), executionSessions = new Map(groupSessions(executionCandles).map((row) => [row.date, row]));
  const marketDaily = buildDaily(signalCandles), marketLookup = indexByDate(marketDaily);
  const scenarios = Object.fromEntries(Object.keys(config.slippageScenarios).map((key) => [key, []]));
  const rejectedSessions = [], noSignalSessions = [];
  for (const signal of signalSessions.filter((row) => row.date >= period.start && row.date <= period.end)) {
    if (invalidDates.has(signal.date)) { rejectedSessions.push({ date: signal.date, reason: 'CROSS_INSTRUMENT_GAP_DIVERGENCE' }); continue; }
    const item = marketLookup.get(signal.date), priorIndex = item?.index - 1;
    const priorClose = priorIndex >= 0 ? marketDaily[priorIndex].close : null;
    const priorSma = priorIndex >= config.intraday.marketSma - 1 ? sma(marketDaily.slice(0, priorIndex + 1).map((row) => row.close), config.intraday.marketSma) : null;
    const outcome = determineI1(signal, executionSessions.get(signal.date), priorClose, priorSma, config);
    if (outcome.status === 'REJECTED') { rejectedSessions.push({ date: signal.date, reason: outcome.reason }); continue; }
    if (outcome.status !== 'TRADE') { noSignalSessions.push({ date: signal.date, reason: outcome.reason }); continue; }
    const quantity = Math.floor(config.capital.fixedAllocationRupees / outcome.entryReference);
    if (quantity < 1) { rejectedSessions.push({ date: signal.date, reason: 'QUANTITY_ZERO' }); continue; }
    const base = { strategyId: 'I1', date: signal.date, requestedAllocation: config.capital.fixedAllocationRupees, deployedCapital: quantity * outcome.entryReference, quantity, ...outcome };
    for (const [scenario, bps] of Object.entries(config.slippageScenarios)) scenarios[scenario].push(intradayTrade(base, scenario, bps));
  }
  return summarizeResult(scenarios, rejectedSessions, noSignalSessions, config);
}

function summarizeResult(scenarios, rejectedSessions, noSignalSessions, config) {
  const summary = Object.fromEntries(Object.entries(scenarios).map(([key, rows]) => [key, summarizeTrades(rows, config.capital.modelRupees)]));
  for (const value of Object.values(summary)) delete value.ladderUsage;
  const bootstrap = monthlyBootstrap(summary.normal.monthly, config.bootstrap.resamples, config.bootstrap.seed);
  const concentrated = concentration(scenarios.normal, summary.normal);
  return { trades: scenarios, rejectedSessions, noSignalSessions, summary, bootstrap, concentration: concentrated };
}

export function evaluateEdgeGates(id, result, observedSessions, config, stage) {
  const normal = result.summary.normal, stress = result.summary.stress, severe = result.summary.severe;
  const activeMonths = Object.values(normal.monthly), years = Object.values(normal.yearly), g = config.gates;
  const rejectedRate = observedSessions ? result.rejectedSessions.length / observedSessions : 1;
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
    ['profitable_active_month_fraction', activeMonths.length > 0 && activeMonths.filter((value) => value > 0).length / activeMonths.length >= g.minimumProfitableActiveMonthFraction, activeMonths.length ? activeMonths.filter((value) => value > 0).length / activeMonths.length : 0, `>= ${g.minimumProfitableActiveMonthFraction}`],
    ['bootstrap_lower_95_mean', result.bootstrap.lower95MeanPnl > g.minimumBootstrapLower95MeanPnl, result.bootstrap.lower95MeanPnl, `> ${g.minimumBootstrapLower95MeanPnl}`],
    ['single_year_concentration', result.concentration.maximumSingleYearPositiveContribution !== null && result.concentration.maximumSingleYearPositiveContribution <= g.maximumSingleYearPositiveContribution, result.concentration.maximumSingleYearPositiveContribution, `<= ${g.maximumSingleYearPositiveContribution}`],
    ['top_winner_concentration', result.concentration.top10PercentWinnerContribution !== null && result.concentration.top10PercentWinnerContribution <= g.maximumTopWinnerContribution, result.concentration.top10PercentWinnerContribution, `<= ${g.maximumTopWinnerContribution}`],
    ['maximum_allocation', normal.maximumDeployedCapital <= g.maximumAllocationRupees, normal.maximumDeployedCapital, `<= ${g.maximumAllocationRupees}`],
  ].map(([gateId, passed, value, requirement]) => ({ id: gateId, passed: Boolean(passed), value, requirement }));
  const coveragePassed = tests.find((row) => row.id === 'rejected_session_rate')?.passed;
  return { decision: !coveragePassed ? 'DATA_BLOCKED' : (tests.every((row) => row.passed) ? 'PASS' : 'REJECT'), tests, failed: tests.filter((row) => !row.passed).map((row) => row.id) };
}
