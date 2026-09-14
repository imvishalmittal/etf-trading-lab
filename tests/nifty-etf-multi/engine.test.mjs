import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateDeliveryCosts } from '../../src/nifty-etf-m1/costs.mjs';
import { affordableQuantity, evaluateOosCandidate, generateDailyCandidate, generateXR1, generateXR2, generateXR3, markToMarket, prepareMarket, rsiWilder, smaAt, volatilityAt } from '../../src/nifty-etf-multi/engine.mjs';

const dates = (count, start = '2019-01-01') => Array.from({ length: count }, (_, index) => { const date = new Date(`${start}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + index); return date.toISOString().slice(0, 10); });
const rows = (values, start) => dates(values.length, start).map((date, index) => ({ timestamp: `${date}T00:00:00+05:30`, open: values[index], high: values[index] + 1, low: values[index] - 1, close: values[index], volume: 1000 }));
const config = {
  capital: 50000, universe: ['NIFTYBEES', 'BANKBEES', 'JUNIORBEES', 'ITBEES', 'GOLDBEES'], equityUniverse: ['NIFTYBEES', 'BANKBEES', 'JUNIORBEES', 'ITBEES'],
  strategies: { MR1: { maximumRsi: 10, maximumReturn: -0.02, maximumHeldSessions: 5 }, BO1: { maximumHeldSessions: 20 } },
};

test('SMA includes only the completed current and prior sessions', () => {
  const input = rows([1, 2, 3, 4, 5]);
  assert.equal(smaAt(input, 4, 5), 3);
  assert.equal(smaAt(input, 3, 5), null);
});

test('Wilder RSI is causal and reaches zero after uninterrupted losses', () => {
  const output = rsiWilder(rows([10, 9, 8, 7]), 2);
  assert.deepEqual(output.slice(0, 2), [null, null]);
  assert.equal(output[2], 0);
  assert.equal(output[3], 0);
});

test('non-equity gold ETF delivery does not pay STT', () => {
  const equity = calculateDeliveryCosts({ entryReference: 100, exitReference: 110, quantity: 100, slippageBps: 0 });
  const gold = calculateDeliveryCosts({ entryReference: 100, exitReference: 110, quantity: 100, slippageBps: 0, equityOriented: false });
  assert.ok(equity.stt > 0);
  assert.equal(gold.stt, 0);
  assert.equal(gold.sttSell, 0);
});

test('quantity includes adverse fill and buy fees inside ₹50,000', () => {
  const quantity = affordableQuantity(100, 10, 50000);
  const costs = calculateDeliveryCosts({ entryReference: 100, exitReference: 100, quantity, slippageBps: 10 });
  assert.ok(costs.buyTurnover + costs.buyFees <= 50000);
  const next = calculateDeliveryCosts({ entryReference: 100, exitReference: 100, quantity: quantity + 1, slippageBps: 10 });
  assert.ok(next.buyTurnover + next.buyFees > 50000);
});

test('MR1 signal enters only at the following open', () => {
  const base = Array.from({ length: 105 }, (_, index) => 100 + index * 0.2);
  base.push(118, 112, 108, 109, 110, 111);
  const input = Object.fromEntries(config.universe.map((symbol) => [symbol, rows(symbol === 'NIFTYBEES' ? base : base.map((value) => value + 100), '2020-01-01')]));
  const market = prepareMarket(input, config.universe), period = { start: '2020-04-01', end: dates(base.length, '2020-01-01').at(-1) };
  const result = generateDailyCandidate('MR1', market, { ...config, equityUniverse: ['NIFTYBEES'] }, period);
  assert.ok(result.episodes.length >= 1);
  assert.ok(result.episodes[0].entryDate > result.episodes[0].signalDate);
});

test('XR1 does not create artificial turnover when the weekly winner is unchanged', () => {
  const values = Array.from({ length: 150 }, (_, index) => 100 + index);
  const input = Object.fromEntries(config.universe.map((symbol) => [symbol, rows(symbol === 'NIFTYBEES' ? values : values.map((_, index) => 100 + index * 0.5), '2020-01-01')]));
  const market = prepareMarket(input, config.universe), period = { start: '2020-04-15', end: dates(150, '2020-01-01').at(-1) };
  const result = generateXR1(market, config, period);
  assert.equal(result.episodes.length, 1);
  assert.equal(result.episodes[0].symbol, 'NIFTYBEES');
  assert.ok(result.episodes[0].entryDate >= '2020-04-21');
  assert.equal(result.episodes[0].exitReason, 'PERIOD_END');
});

test('XR2 holds at most two leaders with ₹25,000 allocation each', () => {
  const values = Array.from({ length: 250 }, (_, index) => 100 + index);
  const input = Object.fromEntries(config.universe.map((symbol, rank) => [symbol, rows(values.map((_, index) => 100 + index * (1 - rank * 0.1)), '2020-01-01')]));
  const market = prepareMarket(input, config.universe), period = { start: '2020-08-01', end: dates(250, '2020-01-01').at(-1) };
  const result = generateXR2(market, { ...config, strategies: { ...config.strategies, XR2: { maximumHoldings: 2, allocationPerHolding: 25000 } } }, period);
  assert.equal(result.episodes.length, 2);
  assert.ok(result.episodes.every((trade) => trade.allocationCapital === 25000));
  assert.equal(result.maximumSimultaneousPositions, 2);
  assert.equal(result.maximumTotalAllocation, 50000);
});

test('20-session volatility uses only completed close-to-close returns', () => {
  const input = rows(Array.from({ length: 22 }, (_, index) => 100 + index));
  assert.equal(volatilityAt(input, 19, 20), null);
  const expectedReturns = Array.from({ length: 20 }, (_, index) => input[index + 1].close / input[index].close - 1);
  const average = expectedReturns.reduce((sum, value) => sum + value, 0) / expectedReturns.length;
  const expected = Math.sqrt(expectedReturns.reduce((sum, value) => sum + (value - average) ** 2, 0) / expectedReturns.length);
  assert.equal(volatilityAt(input, 20, 20), expected);
});

test('XR3 uses two ₹16,500 equity sleeves plus independently eligible gold in risk-on', () => {
  const universe = ['NIFTYBEES', 'BANKBEES', 'JUNIORBEES', 'ITBEES', 'GOLDBEES'];
  const values = Array.from({ length: 270 }, (_, index) => 100 + index * 0.5 + Math.sin(index / 7));
  const input = Object.fromEntries(universe.map((symbol, rank) => [symbol, rows(values.map((value, index) => value + index * rank * 0.08), '2019-01-01')]));
  const market = prepareMarket(input, universe), period = { start: '2019-08-15', end: dates(270, '2019-01-01').at(-1) };
  const rules = {
    capital: 50000, universe, equityUniverse: universe.filter((symbol) => symbol !== 'GOLDBEES'),
    strategies: { XR3: { maximumEquityHoldings: 2, defensiveSymbol: 'GOLDBEES', allocationPerSleeve: 16500 } },
  };
  const result = generateXR3(market, rules, period);
  assert.ok(result.episodes.some((trade) => trade.symbol === 'GOLDBEES'));
  assert.ok(result.decisions.some((decision) => decision.riskOn && decision.targets.length === 3));
  assert.ok(result.decisions.every((decision) => decision.equityRanks.every((item, index, ranked) => index === 0 || ranked[index - 1].score >= item.score)));
  assert.ok(result.episodes.every((trade) => trade.allocationCapital === 16500));
  assert.ok(result.episodes.every((trade) => trade.entryDate > trade.signalDate));
  assert.equal(result.maximumSimultaneousPositions, 3);
  assert.equal(result.maximumTotalAllocation, 49500);
});

test('XR3 suppresses every equity sleeve in risk-off and may retain only eligible gold', () => {
  const universe = ['NIFTYBEES', 'BANKBEES', 'JUNIORBEES', 'ITBEES', 'GOLDBEES'];
  const falling = Array.from({ length: 270 }, (_, index) => 400 - index * 0.7 + Math.sin(index / 5));
  const rising = Array.from({ length: 270 }, (_, index) => 100 + index * 0.5 + Math.sin(index / 7));
  const input = Object.fromEntries(universe.map((symbol) => [symbol, rows(symbol === 'NIFTYBEES' ? falling : rising, '2019-01-01')]));
  const market = prepareMarket(input, universe), period = { start: '2019-08-15', end: dates(270, '2019-01-01').at(-1) };
  const rules = {
    capital: 50000, universe, equityUniverse: universe.filter((symbol) => symbol !== 'GOLDBEES'),
    strategies: { XR3: { maximumEquityHoldings: 2, defensiveSymbol: 'GOLDBEES', allocationPerSleeve: 16500 } },
  };
  const result = generateXR3(market, rules, period);
  assert.ok(result.episodes.length > 0);
  assert.ok(result.episodes.every((trade) => trade.symbol === 'GOLDBEES'));
  assert.ok(result.decisions.every((decision) => !decision.riskOn && decision.targets.every((symbol) => symbol === 'GOLDBEES')));
});

test('XR3 rejects an entire scheduled rotation when a required open has zero volume', () => {
  const universe = ['NIFTYBEES', 'BANKBEES', 'JUNIORBEES', 'ITBEES', 'GOLDBEES'];
  const values = Array.from({ length: 270 }, (_, index) => 100 + index * 0.5 + Math.sin(index / 7));
  const input = Object.fromEntries(universe.map((symbol, rank) => [symbol, rows(values.map((value, index) => value + index * rank * 0.08), '2019-01-01')]));
  const rules = {
    capital: 50000, universe, equityUniverse: universe.filter((symbol) => symbol !== 'GOLDBEES'),
    strategies: { XR3: { maximumEquityHoldings: 2, defensiveSymbol: 'GOLDBEES', allocationPerSleeve: 16500 } },
  };
  const period = { start: '2019-08-15', end: dates(270, '2019-01-01').at(-1) };
  const baselineMarket = prepareMarket(input, universe), baseline = generateXR3(baselineMarket, rules, period);
  const first = baseline.decisions.find((decision) => decision.targets.length > 0);
  const executionDate = baselineMarket.calendar[baselineMarket.calendar.indexOf(first.signalDate) + 1];
  const target = first.targets[0], targetRow = input[target].find((row) => row.timestamp.startsWith(executionDate));
  targetRow.volume = 0;
  const result = generateXR3(prepareMarket(input, universe), rules, period);
  assert.ok(result.rejectedActions.some((action) => action.date === executionDate && action.reason === 'MISSING_ROTATION_OPEN'));
  assert.ok(!result.episodes.some((trade) => trade.entryDate === executionDate));
});

test('BO2 suppresses a breakout while NIFTYBEES is below its 200-session SMA', () => {
  const falling = Array.from({ length: 240 }, (_, index) => 400 - index);
  const rising = Array.from({ length: 240 }, (_, index) => 100 + index * 2);
  const input = Object.fromEntries(config.universe.map((symbol) => [symbol, rows(symbol === 'NIFTYBEES' ? falling : rising, '2020-01-01')]));
  const market = prepareMarket(input, config.universe), period = { start: '2020-08-01', end: dates(240, '2020-01-01').at(-1) };
  const rules = { ...config, strategies: { ...config.strategies, BO2: { minimumPositiveBreadth: 2 } } };
  assert.ok(generateDailyCandidate('BO1', market, rules, period).episodes.length > 0);
  assert.equal(generateDailyCandidate('BO2', market, rules, period).episodes.length, 0);
});

test('mark-to-market drawdown sees losses before an episode closes', () => {
  const input = Object.fromEntries(config.universe.map((symbol) => [symbol, rows([100, 80, 110], '2020-01-01')]));
  const market = prepareMarket(input, config.universe);
  const trade = { symbol: 'NIFTYBEES', entryDate: '2020-01-01', exitDate: '2020-01-03', entryReference: 100, exitReference: 110, quantity: 10, netPnl: 100, equityOriented: true };
  const curve = markToMarket([trade], market, market.calendar, 0);
  assert.ok(curve[1].pnl < 0);
  assert.equal(curve[2].pnl, 100);
});

test('OOS confirmation requires both years and all slippage slices to be positive', () => {
  const scenario = (yearly, netPnl = 3000) => ({ trades: 12, yearly, netPnl, maximumDrawdown: 1000, maximumDeployedCapital: 49990, recoveryFactor: 3 });
  const result = { rejectedActions: [], summary: { normal: scenario({ 2025: 1000, 2026: 2000 }), stress: scenario({ 2025: 900, 2026: 1800 }, 2700), severe: scenario({ 2025: 800, 2026: 1600 }, 2400) } };
  const benchmark = { summary: { normal: { netPnl: 2000, maximumDrawdown: 3000, recoveryFactor: 0.67 } } };
  const oos = { gates: { minimumEpisodes: 10, maximumRejectedActionRate: 0.02, minimumSliceNetPnl: 0, minimumCombinedNetPnl: 0, maximumDrawdown: 10000, maximumAllocation: 50000, maximumSimultaneousPositions: 1 } };
  assert.equal(evaluateOosCandidate('XR1', result, benchmark, 400, oos).decision, 'SUPPORT');
  result.summary.severe.yearly[2026] = -1;
  const failed = evaluateOosCandidate('XR1', result, benchmark, 400, oos);
  assert.equal(failed.decision, 'DOES_NOT_CONFIRM');
  assert.ok(failed.failed.includes('severe_2026_net_pnl'));
});
