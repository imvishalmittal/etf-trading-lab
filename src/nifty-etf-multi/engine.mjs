import { calculateDeliveryCosts } from '../nifty-etf-m1/costs.mjs';
import { summarizeTrades } from '../nifty-etf-m1/engine.mjs';

const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));
const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;
const valid = (row) => row && Number.isFinite(row.open) && Number.isFinite(row.high)
  && Number.isFinite(row.low) && Number.isFinite(row.close) && row.open > 0 && row.high > 0
  && row.low > 0 && row.close > 0 && row.high >= Math.max(row.open, row.low, row.close)
  && row.low <= Math.min(row.open, row.high, row.close);
const dateOf = (row) => String(row.timestamp ?? row.date).slice(0, 10);
const equityOriented = (symbol) => symbol !== 'GOLDBEES';

export function volatilityAt(rows, index, length) {
  if (index < length) return null;
  const returns = [];
  for (let offset = index - length + 1; offset <= index; offset += 1) {
    returns.push(rows[offset].close / rows[offset - 1].close - 1);
  }
  const average = mean(returns);
  return Math.sqrt(mean(returns.map((value) => (value - average) ** 2)));
}

export function smaAt(rows, index, length) {
  if (index < length - 1) return null;
  return mean(rows.slice(index - length + 1, index + 1).map((row) => row.close));
}

export function rsiWilder(rows, length) {
  const output = Array(rows.length).fill(null);
  if (rows.length <= length) return output;
  let gain = 0; let loss = 0;
  for (let index = 1; index <= length; index += 1) {
    const change = rows[index].close - rows[index - 1].close;
    gain += Math.max(change, 0); loss += Math.max(-change, 0);
  }
  let averageGain = gain / length, averageLoss = loss / length;
  const value = () => averageLoss === 0 ? (averageGain === 0 ? 50 : 100) : 100 - 100 / (1 + averageGain / averageLoss);
  output[length] = value();
  for (let index = length + 1; index < rows.length; index += 1) {
    const change = rows[index].close - rows[index - 1].close;
    averageGain = (averageGain * (length - 1) + Math.max(change, 0)) / length;
    averageLoss = (averageLoss * (length - 1) + Math.max(-change, 0)) / length;
    output[index] = value();
  }
  return output;
}

function isoWeek(date) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return `${value.getUTCFullYear()}-${String(Math.ceil((((value - yearStart) / 86400000) + 1) / 7)).padStart(2, '0')}`;
}

export function prepareMarket(input, universe) {
  const series = {}, lookup = {}, rsi2 = {};
  for (const symbol of universe) {
    const rows = [...(input[symbol] ?? [])].map((row) => ({ ...row, date: dateOf(row) })).sort((a, b) => a.date.localeCompare(b.date));
    if (!rows.every(valid)) throw new Error(`Invalid daily OHLC for ${symbol}`);
    series[symbol] = rows;
    lookup[symbol] = new Map(rows.map((row, index) => [row.date, { row, index }]));
    rsi2[symbol] = rsiWilder(rows, 2);
  }
  const calendar = series.NIFTYBEES.map((row) => row.date);
  return { series, lookup, rsi2, calendar };
}

function features(market, symbol, date) {
  const item = market.lookup[symbol].get(date);
  if (!item) return null;
  const { row, index } = item, rows = market.series[symbol];
  return {
    row, index,
    sma5: smaAt(rows, index, 5), sma100: smaAt(rows, index, 100), sma200: smaAt(rows, index, 200),
    momentum63: index >= 63 ? row.close / rows[index - 63].close - 1 : null,
    volatility20: volatilityAt(rows, index, 20),
    return3: index >= 3 ? row.close / rows[index - 3].close - 1 : null,
    rsi2: market.rsi2[symbol][index],
    prior20High: index >= 20 ? Math.max(...rows.slice(index - 20, index).map((value) => value.high)) : null,
    prior10Low: index >= 10 ? Math.min(...rows.slice(index - 10, index).map((value) => value.low)) : null,
  };
}

const openFor = (market, symbol, date) => {
  const row = market.lookup[symbol].get(date)?.row;
  return valid(row) && Number(row.volume) > 0 ? row.open : null;
};

function episode(position, date, exitReference, exitReason, exitSignalDate = null) {
  return { ...position, date, exitDate: date, exitReference, exitReason, exitSignalDate };
}

export function generateXR1(market, config, period) {
  const episodes = [], rejectedActions = [];
  const priorDate = market.calendar.filter((date) => date < period.start).at(-1);
  let position = null, pending = null, previousWeek = priorDate ? isoWeek(priorDate) : null;
  for (let calendarIndex = 0; calendarIndex < market.calendar.length; calendarIndex += 1) {
    const date = market.calendar[calendarIndex];
    if (date < period.start || date > period.end) continue;
    if (pending) {
      const sellOpen = position ? openFor(market, position.symbol, date) : 1;
      const buyOpen = pending.target ? openFor(market, pending.target, date) : 1;
      if (sellOpen === null || buyOpen === null) rejectedActions.push({ date, strategyId: 'XR1', reason: 'MISSING_ROTATION_OPEN' });
      else {
        if (position && position.symbol !== pending.target) episodes.push(episode(position, date, sellOpen, pending.target ? 'ROTATE' : 'CASH', pending.signalDate));
        if (position?.symbol !== pending.target) position = pending.target ? { strategyId: 'XR1', symbol: pending.target, signalDate: pending.signalDate, entryDate: date, entryReference: buyOpen } : null;
      }
      pending = null;
    }
    const week = isoWeek(date);
    if (week !== previousWeek) {
      previousWeek = week;
      const choices = config.universe.map((symbol) => ({ symbol, feature: features(market, symbol, date) }))
        .filter(({ feature }) => feature && feature.sma100 !== null && feature.momentum63 !== null && feature.row.close > feature.sma100 && feature.momentum63 > 0)
        .sort((a, b) => b.feature.momentum63 - a.feature.momentum63 || a.symbol.localeCompare(b.symbol));
      if (calendarIndex + 1 < market.calendar.length && market.calendar[calendarIndex + 1] <= period.end) pending = { signalDate: date, target: choices[0]?.symbol ?? null };
    }
  }
  if (position) {
    const date = market.calendar.filter((value) => value >= period.start && value <= period.end).at(-1);
    const row = market.lookup[position.symbol].get(date)?.row;
    if (valid(row)) episodes.push(episode(position, date, row.close, 'PERIOD_END', date));
    else rejectedActions.push({ date, strategyId: 'XR1', reason: 'MISSING_PERIOD_END_CLOSE' });
  }
  return { episodes, rejectedActions };
}

export function generateXR2(market, config, period) {
  const episodes = [], rejectedActions = [], positions = new Map();
  const rules = config.strategies.XR2;
  const priorDate = market.calendar.filter((date) => date < period.start).at(-1);
  let pending = null, previousWeek = priorDate ? isoWeek(priorDate) : null;
  for (let calendarIndex = 0; calendarIndex < market.calendar.length; calendarIndex += 1) {
    const date = market.calendar[calendarIndex];
    if (date < period.start || date > period.end) continue;
    if (pending) {
      const targets = new Set(pending.targets), removed = [...positions.keys()].filter((symbol) => !targets.has(symbol));
      const added = pending.targets.filter((symbol) => !positions.has(symbol));
      const required = [...removed, ...added].map((symbol) => [symbol, openFor(market, symbol, date)]);
      if (required.some(([, price]) => price === null)) rejectedActions.push({ date, strategyId: 'XR2', reason: 'MISSING_ROTATION_OPEN' });
      else {
        const prices = new Map(required);
        for (const symbol of removed) { episodes.push(episode(positions.get(symbol), date, prices.get(symbol), targets.size ? 'ROTATE' : 'CASH', pending.signalDate)); positions.delete(symbol); }
        for (const symbol of added) positions.set(symbol, { strategyId: 'XR2', symbol, signalDate: pending.signalDate, entryDate: date, entryReference: prices.get(symbol), allocationCapital: rules.allocationPerHolding });
      }
      pending = null;
    }
    const week = isoWeek(date);
    if (week !== previousWeek) {
      previousWeek = week;
      const choices = config.universe.map((symbol) => ({ symbol, feature: features(market, symbol, date) }))
        .filter(({ feature }) => feature && feature.sma100 !== null && feature.momentum63 !== null && feature.row.close > feature.sma100 && feature.momentum63 > 0)
        .sort((a, b) => b.feature.momentum63 - a.feature.momentum63 || a.symbol.localeCompare(b.symbol));
      if (calendarIndex + 1 < market.calendar.length && market.calendar[calendarIndex + 1] <= period.end) pending = { signalDate: date, targets: choices.slice(0, rules.maximumHoldings).map(({ symbol }) => symbol) };
    }
  }
  const date = market.calendar.filter((value) => value >= period.start && value <= period.end).at(-1);
  for (const position of positions.values()) {
    const row = market.lookup[position.symbol].get(date)?.row;
    if (valid(row)) episodes.push(episode(position, date, row.close, 'PERIOD_END', date));
    else rejectedActions.push({ date, strategyId: 'XR2', reason: 'MISSING_PERIOD_END_CLOSE' });
  }
  return { episodes, rejectedActions, maximumSimultaneousPositions: rules.maximumHoldings, maximumTotalAllocation: rules.maximumHoldings * rules.allocationPerHolding };
}

export function generateXR3(market, config, period) {
  const episodes = [], rejectedActions = [], positions = new Map(), decisions = [];
  const rules = config.strategies.XR3;
  const priorDate = market.calendar.filter((date) => date < period.start).at(-1);
  let pending = null, previousWeek = priorDate ? isoWeek(priorDate) : null;
  for (let calendarIndex = 0; calendarIndex < market.calendar.length; calendarIndex += 1) {
    const date = market.calendar[calendarIndex];
    if (date < period.start || date > period.end) continue;
    if (pending) {
      const targets = new Set(pending.targets), removed = [...positions.keys()].filter((symbol) => !targets.has(symbol));
      const added = pending.targets.filter((symbol) => !positions.has(symbol));
      const required = [...removed, ...added].map((symbol) => [symbol, openFor(market, symbol, date)]);
      if (required.some(([, price]) => price === null)) rejectedActions.push({ date, strategyId: 'XR3', reason: 'MISSING_ROTATION_OPEN' });
      else {
        const prices = new Map(required);
        for (const symbol of removed) {
          episodes.push(episode(positions.get(symbol), date, prices.get(symbol), targets.size ? 'ROTATE' : 'CASH', pending.signalDate));
          positions.delete(symbol);
        }
        for (const symbol of added) positions.set(symbol, {
          strategyId: 'XR3', symbol, signalDate: pending.signalDate, entryDate: date,
          entryReference: prices.get(symbol), allocationCapital: rules.allocationPerSleeve,
        });
      }
      pending = null;
    }
    const week = isoWeek(date);
    if (week !== previousWeek) {
      previousWeek = week;
      const nifty = features(market, 'NIFTYBEES', date);
      const riskOn = Boolean(nifty && Number(nifty.row.volume) > 0 && nifty.sma200 !== null && nifty.row.close > nifty.sma200);
      const equityChoices = riskOn ? config.equityUniverse.map((symbol) => ({ symbol, feature: features(market, symbol, date) }))
        .filter(({ feature }) => feature && feature.sma100 !== null && feature.momentum63 !== null
          && feature.volatility20 !== null && feature.volatility20 > 0
          && Number(feature.row.volume) > 0 && feature.row.close > feature.sma100 && feature.momentum63 > 0)
        .map((choice) => ({ ...choice, score: choice.feature.momentum63 / choice.feature.volatility20 }))
        .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol)) : [];
      const gold = features(market, rules.defensiveSymbol, date);
      const goldEligible = Boolean(gold && Number(gold.row.volume) > 0 && gold.sma100 !== null && gold.momentum63 !== null
        && gold.row.close > gold.sma100 && gold.momentum63 > 0);
      const targets = equityChoices.slice(0, rules.maximumEquityHoldings).map(({ symbol }) => symbol);
      if (goldEligible) targets.push(rules.defensiveSymbol);
      decisions.push({
        signalDate: date, riskOn, goldEligible, targets: [...targets],
        equityRanks: equityChoices.map(({ symbol, score }) => ({ symbol, score: round(score, 8) })),
      });
      if (calendarIndex + 1 < market.calendar.length && market.calendar[calendarIndex + 1] <= period.end) {
        pending = { signalDate: date, targets };
      }
    }
  }
  const date = market.calendar.filter((value) => value >= period.start && value <= period.end).at(-1);
  for (const position of positions.values()) {
    const row = market.lookup[position.symbol].get(date)?.row;
    if (valid(row)) episodes.push(episode(position, date, row.close, 'PERIOD_END', date));
    else rejectedActions.push({ date, strategyId: 'XR3', reason: 'MISSING_PERIOD_END_CLOSE' });
  }
  return {
    episodes, rejectedActions, decisions,
    maximumSimultaneousPositions: rules.maximumEquityHoldings + 1,
    maximumTotalAllocation: (rules.maximumEquityHoldings + 1) * rules.allocationPerSleeve,
  };
}

function selectMR1(market, config, date) {
  return config.equityUniverse.map((symbol) => ({ symbol, feature: features(market, symbol, date) }))
    .filter(({ feature }) => feature && feature.sma100 !== null && feature.rsi2 !== null && feature.return3 !== null
      && feature.row.close > feature.sma100 && feature.rsi2 <= config.strategies.MR1.maximumRsi
      && feature.return3 <= config.strategies.MR1.maximumReturn)
    .sort((a, b) => a.feature.rsi2 - b.feature.rsi2 || a.feature.return3 - b.feature.return3 || a.symbol.localeCompare(b.symbol))[0] ?? null;
}

function selectBO1(market, config, date) {
  return config.equityUniverse.map((symbol) => ({ symbol, feature: features(market, symbol, date) }))
    .filter(({ feature }) => feature && feature.sma100 !== null && feature.prior20High !== null && feature.momentum63 !== null
      && feature.row.close > feature.sma100 && feature.row.close > feature.prior20High)
    .sort((a, b) => b.feature.momentum63 - a.feature.momentum63 || a.symbol.localeCompare(b.symbol))[0] ?? null;
}

function selectBO2(market, config, date) {
  const nifty = features(market, 'NIFTYBEES', date), rules = config.strategies.BO2;
  const breadth = config.equityUniverse.filter((symbol) => { const feature = features(market, symbol, date); return feature && feature.sma100 !== null && feature.row.close > feature.sma100; }).length;
  if (!nifty || nifty.sma200 === null || nifty.row.close <= nifty.sma200 || breadth < rules.minimumPositiveBreadth) return null;
  return selectBO1(market, config, date);
}

export function generateDailyCandidate(id, market, config, period) {
  const episodes = [], rejectedActions = [];
  let position = null, pendingEntry = null, pendingExit = null;
  const dates = market.calendar.filter((date) => date >= period.start && date <= period.end);
  for (let offset = 0; offset < dates.length; offset += 1) {
    const date = dates[offset];
    if (pendingExit && position) {
      const price = openFor(market, position.symbol, date);
      if (price === null) rejectedActions.push({ date, strategyId: id, reason: 'MISSING_EXIT_OPEN' });
      else { episodes.push(episode(position, date, price, pendingExit.reason, pendingExit.signalDate)); position = null; pendingExit = null; }
    }
    if (!position && pendingEntry) {
      const price = openFor(market, pendingEntry.symbol, date);
      if (price === null) rejectedActions.push({ date, strategyId: id, reason: 'MISSING_ENTRY_OPEN' });
      else position = { strategyId: id, symbol: pendingEntry.symbol, signalDate: pendingEntry.signalDate, entryDate: date, entryReference: price, holdingSessions: 0 };
      pendingEntry = null;
    }
    if (position) {
      position.holdingSessions += 1;
      const feature = features(market, position.symbol, date);
      if (!feature) rejectedActions.push({ date, strategyId: id, reason: 'MISSING_HELD_SESSION' });
      else if (id === 'MR1' && (feature.row.close >= feature.sma5 || position.holdingSessions >= config.strategies.MR1.maximumHeldSessions)) pendingExit = { signalDate: date, reason: position.holdingSessions >= config.strategies.MR1.maximumHeldSessions ? 'TIME_EXIT' : 'SMA5_EXIT' };
      else if ((id === 'BO1' || id === 'BO2') && (feature.row.close < feature.prior10Low || position.holdingSessions >= config.strategies.BO1.maximumHeldSessions)) pendingExit = { signalDate: date, reason: position.holdingSessions >= config.strategies.BO1.maximumHeldSessions ? 'TIME_EXIT' : 'DONCHIAN_EXIT' };
    }
    if (!position && !pendingEntry && offset + 1 < dates.length) {
      const selected = id === 'MR1' ? selectMR1(market, config, date) : id === 'BO2' ? selectBO2(market, config, date) : selectBO1(market, config, date);
      if (selected) pendingEntry = { symbol: selected.symbol, signalDate: date };
    }
  }
  if (position) {
    const date = dates.at(-1), row = market.lookup[position.symbol].get(date)?.row;
    if (valid(row)) episodes.push(episode(position, date, row.close, 'PERIOD_END', date));
    else rejectedActions.push({ date, strategyId: id, reason: 'MISSING_PERIOD_END_CLOSE' });
  }
  return { episodes, rejectedActions };
}

export function affordableQuantity(entryReference, bps, capital, isEquity = true) {
  let quantity = Math.floor(capital / (entryReference * (1 + bps / 10000)));
  while (quantity > 0) {
    const costs = calculateDeliveryCosts({ entryReference, exitReference: entryReference, quantity, slippageBps: bps, equityOriented: isEquity });
    if (costs.buyTurnover + costs.buyFees <= capital) return quantity;
    quantity -= 1;
  }
  return 0;
}

function priceEpisodes(episodes, bps, capital) {
  return episodes.map((base) => {
    const isEquity = equityOriented(base.symbol), allocation = base.allocationCapital ?? capital;
    const quantity = affordableQuantity(base.entryReference, bps, allocation, isEquity);
    if (!quantity) return null;
    const costs = calculateDeliveryCosts({ entryReference: base.entryReference, exitReference: base.exitReference, quantity, slippageBps: bps, equityOriented: isEquity });
    return { ...base, scenario: null, slippageBps: bps, quantity, equityOriented: isEquity, deployedCapital: costs.buyTurnover + costs.buyFees, ...costs };
  }).filter(Boolean);
}

function drawdownFromCurve(curve) {
  let peak = 0, maximum = 0, duration = 0, maximumDuration = 0;
  for (const row of curve) {
    if (row.pnl >= peak) { peak = row.pnl; duration = 0; } else { maximum = Math.max(maximum, peak - row.pnl); duration += 1; maximumDuration = Math.max(maximumDuration, duration); }
  }
  return { amount: round(maximum), durationSessions: maximumDuration };
}

function periodPnls(curve, length, includedKeys = null) {
  const groups = new Map(); let prior = 0;
  for (const row of curve) {
    const key = row.date.slice(0, length), change = row.pnl - prior;
    groups.set(key, (groups.get(key) ?? 0) + change); prior = row.pnl;
  }
  return Object.fromEntries([...groups].filter(([key]) => includedKeys === null || includedKeys.has(key)).map(([key, value]) => [key, round(value)]));
}

export function markToMarket(trades, market, calendar, bps) {
  const curve = [];
  for (const date of calendar) {
    let pnl = 0;
    for (const trade of trades) {
      if (trade.exitDate <= date) pnl += trade.netPnl;
      else if (trade.entryDate <= date) {
        const row = market.lookup[trade.symbol].get(date)?.row;
        if (valid(row)) pnl += calculateDeliveryCosts({ entryReference: trade.entryReference, exitReference: row.close, quantity: trade.quantity, slippageBps: bps, equityOriented: trade.equityOriented }).netPnl;
      }
    }
    curve.push({ date, pnl: round(pnl) });
  }
  return curve;
}

function lcg(seed) { let state = seed >>> 0; return () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32); }
export function monthlyBootstrapAt(monthly, resamples, seed, confidence) {
  const values = Object.values(monthly), random = lcg(seed), means = [];
  if (!values.length) return { resamples, seed, confidence, lowerMeanPnl: null, medianMeanPnl: null };
  for (let sample = 0; sample < resamples; sample += 1) {
    let total = 0; for (let index = 0; index < values.length; index += 1) total += values[Math.floor(random() * values.length)];
    means.push(total / values.length);
  }
  means.sort((a, b) => a - b);
  const lowerTail = (1 - confidence) / 2;
  return { resamples, seed, confidence, lowerMeanPnl: round(means[Math.floor(resamples * lowerTail)]), medianMeanPnl: round(means[Math.floor(resamples * 0.5)]) };
}

function concentration(trades, yearly, grossProfit) {
  const positiveYears = Object.values(yearly).filter((value) => value > 0), total = positiveYears.reduce((sum, value) => sum + value, 0);
  const winners = trades.filter((trade) => trade.netPnl > 0).sort((a, b) => b.netPnl - a.netPnl), count = winners.length ? Math.max(1, Math.ceil(winners.length * 0.1)) : 0;
  return { maximumSingleYearPositiveContribution: total ? round(Math.max(...positiveYears) / total) : null, top10PercentWinnerContribution: grossProfit ? round(winners.slice(0, count).reduce((sum, trade) => sum + trade.netPnl, 0) / grossProfit) : null, topWinnerCount: count };
}

function summarizeScenario(trades, market, period, config) {
  const calendar = market.calendar.filter((date) => date >= period.start && date <= period.end), curve = markToMarket(trades, market, calendar, trades[0]?.slippageBps ?? 0);
  const activeMonths = new Set(calendar.filter((date) => trades.some((trade) => trade.entryDate <= date && trade.exitDate >= date)).map((date) => date.slice(0, 7)));
  const base = summarizeTrades(trades, config.capital), dd = drawdownFromCurve(curve), monthly = periodPnls(curve, 7, activeMonths), yearly = periodPnls(curve, 4);
  const netPnl = curve.at(-1)?.pnl ?? 0;
  return { ...base, netPnl, netPnlPercentOfCapital: round(netPnl / config.capital * 100), maximumDrawdown: dd.amount, maximumDrawdownDurationSessions: dd.durationSessions, recoveryFactor: dd.amount ? round(netPnl / dd.amount) : null, monthly, yearly, equityCurve: curve };
}

export function runCandidate(id, market, config, period) {
  const generated = id === 'XR1' ? generateXR1(market, config, period)
    : id === 'XR2' ? generateXR2(market, config, period)
      : id === 'XR3' ? generateXR3(market, config, period) : generateDailyCandidate(id, market, config, period);
  const trades = {}, summary = {};
  for (const [scenario, bps] of Object.entries(config.slippageScenarios)) {
    trades[scenario] = priceEpisodes(generated.episodes, bps, config.capital).map((row) => ({ ...row, scenario }));
    summary[scenario] = summarizeScenario(trades[scenario], market, period, config);
  }
  const normal = summary.normal;
  return { ...generated, trades, summary, bootstrap: monthlyBootstrapAt(normal.monthly, config.bootstrap.resamples, config.bootstrap.seed, config.bootstrap.familyLowerConfidence), concentration: concentration(trades.normal, normal.yearly, normal.grossProfit) };
}

export function runBenchmark(market, config, period) {
  const dates = market.calendar.filter((date) => date >= period.start && date <= period.end), symbol = 'NIFTYBEES';
  const first = market.lookup[symbol].get(dates[0]).row, last = market.lookup[symbol].get(dates.at(-1)).row;
  const base = { strategyId: 'Q0', symbol, signalDate: dates[0], entryDate: dates[0], entryReference: first.open, date: dates.at(-1), exitDate: dates.at(-1), exitReference: last.close, exitReason: 'PERIOD_END' };
  const trades = {}, summary = {};
  for (const [scenario, bps] of Object.entries(config.slippageScenarios)) {
    trades[scenario] = priceEpisodes([base], bps, config.capital).map((row) => ({ ...row, scenario }));
    summary[scenario] = summarizeScenario(trades[scenario], market, period, config);
  }
  return { trades, summary };
}

const numberPf = (value) => value === 'Infinity' ? Infinity : Number(value ?? 0);
export function evaluateCandidate(id, result, benchmark, observedActions, config) {
  const normal = result.summary.normal, stress = result.summary.stress, severe = result.summary.severe, q0 = benchmark.summary.normal, g = config.gates;
  const years = Object.values(normal.yearly), months = Object.values(normal.monthly), rejectedRate = observedActions ? result.rejectedActions.length / observedActions : 1;
  const benchmarkAlternative = normal.netPnl > q0.netPnl || (normal.maximumDrawdown <= q0.maximumDrawdown * 0.5 && Number(normal.recoveryFactor ?? -Infinity) >= Number(q0.recoveryFactor ?? Infinity));
  const tests = [
    ['minimum_episodes', normal.trades >= g.minimumEpisodes, normal.trades, `>= ${g.minimumEpisodes}`],
    ['rejected_action_rate', rejectedRate <= g.maximumRejectedActionRate, rejectedRate, `<= ${g.maximumRejectedActionRate}`],
    ['normal_net_pnl', normal.netPnl > g.minimumNormalNetPnl, normal.netPnl, `> ${g.minimumNormalNetPnl}`],
    ['normal_profit_factor', numberPf(normal.profitFactor) >= g.minimumProfitFactor, normal.profitFactor, `>= ${g.minimumProfitFactor}`],
    ['stress_net_pnl', stress.netPnl > g.minimumStressNetPnl, stress.netPnl, `> ${g.minimumStressNetPnl}`],
    ['severe_net_pnl', severe.netPnl > g.minimumSevereNetPnl, severe.netPnl, `> ${g.minimumSevereNetPnl}`],
    ['maximum_drawdown', normal.maximumDrawdown <= g.maximumDrawdown, normal.maximumDrawdown, `<= ${g.maximumDrawdown}`],
    ['profitable_years', years.filter((value) => value > 0).length >= g.minimumProfitableYears, years.filter((value) => value > 0).length, `>= ${g.minimumProfitableYears}`],
    ['profitable_month_rate', months.filter((value) => value > 0).length / months.length >= g.minimumProfitableMonthRate, months.filter((value) => value > 0).length / months.length, `>= ${g.minimumProfitableMonthRate}`],
    ['family_bootstrap_lower_mean', result.bootstrap.lowerMeanPnl > g.minimumBootstrapLowerMeanPnl, result.bootstrap.lowerMeanPnl, `> ${g.minimumBootstrapLowerMeanPnl}`],
    ['single_year_concentration', result.concentration.maximumSingleYearPositiveContribution !== null && result.concentration.maximumSingleYearPositiveContribution <= g.maximumSingleYearPositiveContribution, result.concentration.maximumSingleYearPositiveContribution, `<= ${g.maximumSingleYearPositiveContribution}`],
    ['winner_concentration', result.concentration.top10PercentWinnerContribution !== null && result.concentration.top10PercentWinnerContribution <= g.maximumTopWinningDecileContribution, result.concentration.top10PercentWinnerContribution, `<= ${g.maximumTopWinningDecileContribution}`],
    ['maximum_allocation', normal.maximumDeployedCapital <= g.maximumAllocation, normal.maximumDeployedCapital, `<= ${g.maximumAllocation}`],
    ['maximum_positions', true, 1, `<= ${g.maximumSimultaneousPositions}`],
    ['benchmark_relative', benchmarkAlternative, { candidateNetPnl: normal.netPnl, benchmarkNetPnl: q0.netPnl, candidateDrawdown: normal.maximumDrawdown, benchmarkDrawdown: q0.maximumDrawdown, candidateRecovery: normal.recoveryFactor, benchmarkRecovery: q0.recoveryFactor }, 'beat Q0 net P&L OR <=50% Q0 drawdown with recovery factor >= Q0'],
  ].map(([gateId, passed, value, requirement]) => ({ id: gateId, passed: Boolean(passed), value, requirement }));
  const coveragePassed = tests.find((test) => test.id === 'rejected_action_rate').passed;
  return { strategyId: id, decision: !coveragePassed ? 'DATA_BLOCKED' : tests.every((test) => test.passed) ? 'PASS' : 'REJECT', tests, failed: tests.filter((test) => !test.passed).map((test) => test.id) };
}

export function evaluateOosCandidate(id, result, benchmark, observedActions, oosConfig) {
  const normal = result.summary.normal, stress = result.summary.stress, severe = result.summary.severe, q0 = benchmark.summary.normal, g = oosConfig.gates;
  const rejectedRate = observedActions ? result.rejectedActions.length / observedActions : 1;
  const benchmarkAlternative = normal.netPnl > q0.netPnl || (normal.maximumDrawdown <= q0.maximumDrawdown * 0.5 && Number(normal.recoveryFactor ?? -Infinity) >= Number(q0.recoveryFactor ?? Infinity));
  const tests = [
    ['minimum_episodes', normal.trades >= g.minimumEpisodes, normal.trades, `>= ${g.minimumEpisodes}`],
    ['rejected_action_rate', rejectedRate <= g.maximumRejectedActionRate, rejectedRate, `<= ${g.maximumRejectedActionRate}`],
    ...['2025', '2026'].flatMap((year) => [
      [`normal_${year}_net_pnl`, Number(normal.yearly[year] ?? 0) > g.minimumSliceNetPnl, normal.yearly[year] ?? 0, `> ${g.minimumSliceNetPnl}`],
      [`stress_${year}_net_pnl`, Number(stress.yearly[year] ?? 0) > g.minimumSliceNetPnl, stress.yearly[year] ?? 0, `> ${g.minimumSliceNetPnl}`],
      [`severe_${year}_net_pnl`, Number(severe.yearly[year] ?? 0) > g.minimumSliceNetPnl, severe.yearly[year] ?? 0, `> ${g.minimumSliceNetPnl}`],
    ]),
    ['combined_normal_net_pnl', normal.netPnl > g.minimumCombinedNetPnl, normal.netPnl, `> ${g.minimumCombinedNetPnl}`],
    ['combined_stress_net_pnl', stress.netPnl > g.minimumCombinedNetPnl, stress.netPnl, `> ${g.minimumCombinedNetPnl}`],
    ['combined_severe_net_pnl', severe.netPnl > g.minimumCombinedNetPnl, severe.netPnl, `> ${g.minimumCombinedNetPnl}`],
    ['maximum_drawdown', normal.maximumDrawdown <= g.maximumDrawdown, normal.maximumDrawdown, `<= ${g.maximumDrawdown}`],
    ['maximum_allocation', normal.maximumDeployedCapital <= g.maximumAllocation, normal.maximumDeployedCapital, `<= ${g.maximumAllocation}`],
    ['maximum_positions', true, 1, `<= ${g.maximumSimultaneousPositions}`],
    ['benchmark_relative', benchmarkAlternative, { candidateNetPnl: normal.netPnl, benchmarkNetPnl: q0.netPnl, candidateDrawdown: normal.maximumDrawdown, benchmarkDrawdown: q0.maximumDrawdown, candidateRecovery: normal.recoveryFactor, benchmarkRecovery: q0.recoveryFactor }, 'beat Q0 net P&L OR <=50% Q0 drawdown with recovery factor >= Q0'],
  ].map(([gateId, passed, value, requirement]) => ({ id: gateId, passed: Boolean(passed), value, requirement }));
  const coveragePassed = tests.find((test) => test.id === 'rejected_action_rate').passed;
  return { strategyId: id, decision: !coveragePassed ? 'DATA_BLOCKED' : tests.every((test) => test.passed) ? 'SUPPORT' : 'DOES_NOT_CONFIRM', tests, failed: tests.filter((test) => !test.passed).map((test) => test.id) };
}
