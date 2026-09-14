import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateDeliveryCosts } from '../../src/nifty-etf-m1/costs.mjs';
import { affordableQuantity, generateDailyCandidate, generateXR1, markToMarket, prepareMarket, rsiWilder, smaAt } from '../../src/nifty-etf-multi/engine.mjs';

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

test('mark-to-market drawdown sees losses before an episode closes', () => {
  const input = Object.fromEntries(config.universe.map((symbol) => [symbol, rows([100, 80, 110], '2020-01-01')]));
  const market = prepareMarket(input, config.universe);
  const trade = { symbol: 'NIFTYBEES', entryDate: '2020-01-01', exitDate: '2020-01-03', entryReference: 100, exitReference: 110, quantity: 10, netPnl: 100, equityOriented: true };
  const curve = markToMarket([trade], market, market.calendar, 0);
  assert.ok(curve[1].pnl < 0);
  assert.equal(curve[2].pnl, 100);
});
