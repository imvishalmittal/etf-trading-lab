import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { calculateDeliveryCosts } from '../../src/nifty-etf-m1/costs.mjs';
import { buildSignalContext, determineG1, determineT1, runIntradayStrategies, runPositionalStrategies } from '../../src/nifty-etf-next/engine.mjs';

const config = JSON.parse(fs.readFileSync('research/nifty-etf-next/frozen-config.json', 'utf8'));
const bar = (date, at, open, high = open, low = open, close = open) => ({ timestamp: `${date}T${at}:00+05:30`, open, high, low, close, volume: 1 });
const minutes = (date, start = '09:15', end = '15:29', value = 100) => {
  const parse = (x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
  const fmt = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
  return Array.from({ length: parse(end) - parse(start) + 1 }, (_, i) => bar(date, fmt(parse(start) + i), value));
};

test('T1 requires trend regime and fixed 09:34 confirmation, then enters 09:35', () => {
  const day = '2024-01-02';
  const signalBars = minutes(day);
  signalBars.find((x) => x.timestamp.includes('09:34')).close = 101;
  signalBars.find((x) => x.timestamp.includes('09:34')).high = 101;
  const executionBars = minutes(day);
  executionBars.find((x) => x.timestamp.includes('09:35')).open = 200;
  executionBars.find((x) => x.timestamp.includes('09:35')).high = 200;
  executionBars.find((x) => x.timestamp.includes('09:35')).low = 200;
  executionBars.find((x) => x.timestamp.includes('09:35')).close = 200;
  const result = determineT1({ session: { date: day, bars: signalBars }, previousClose: 105, previousSma50: 100 }, { date: day, bars: executionBars }, config);
  assert.equal(result.status, 'TRADE');
  assert.equal(result.entryTime, '09:35');
  assert.equal(result.entryReference, 200);
});

test('T1 signal invalidation executes on next ETF bar, not the same signal bar', () => {
  const day = '2024-01-02';
  const signalBars = minutes(day, '09:15', '15:29', 100);
  const confirmation = signalBars.find((x) => x.timestamp.includes('09:34'));
  Object.assign(confirmation, { open: 101, high: 101, low: 101, close: 101 });
  Object.assign(signalBars.find((x) => x.timestamp.includes('09:35')), { open: 101, high: 101, low: 101, close: 101 });
  Object.assign(signalBars.find((x) => x.timestamp.includes('09:36')), { open: 101, high: 101, low: 100, close: 100 });
  const executionBars = minutes(day, '09:15', '15:29', 200);
  Object.assign(executionBars.find((x) => x.timestamp.includes('09:36')), { open: 205, high: 205, low: 205, close: 205 });
  Object.assign(executionBars.find((x) => x.timestamp.includes('09:37')), { open: 203, high: 203, low: 203, close: 203 });
  const result = determineT1({ session: { date: day, bars: signalBars }, previousClose: 105, previousSma50: 100 }, { date: day, bars: executionBars }, config);
  assert.equal(result.exitReason, 'SIGNAL_INVALIDATED');
  assert.equal(result.exitTime, '09:37');
  assert.equal(result.exitReference, 203);
});

test('G1 requires a 0.75% gap down and enters one minute after recovery close', () => {
  const day = '2024-01-02';
  const signalBars = minutes(day);
  Object.assign(signalBars[0], { open: 99, high: 99.5, low: 98.5, close: 99 });
  Object.assign(signalBars.find((x) => x.timestamp.includes('09:40')), { open: 100, high: 100.2, low: 100, close: 100.1 });
  const executionBars = minutes(day, '09:15', '15:29', 200);
  const result = determineG1({ session: { date: day, bars: signalBars }, previousClose: 100 }, { date: day, bars: executionBars }, config);
  assert.equal(result.status, 'TRADE');
  assert.equal(result.entryTime, '09:41');
  assert.ok(result.gap <= -0.0075);
});

test('intraday strategies use fixed allocation and never a loss ladder', () => {
  const pre = [];
  for (let i = 0; i < 51; i += 1) {
    const day = `2023-11-${String(i + 1).padStart(2, '0')}`;
    pre.push(bar(day, '15:29', 50 + i, 50 + i, 50 + i, 50 + i));
  }
  const day = '2024-01-02';
  const signal = minutes(day);
  Object.assign(signal.find((x) => x.timestamp.includes('09:34')), { open: 101, high: 101, low: 101, close: 101 });
  const execution = minutes(day, '09:15', '15:29', 200);
  const result = runIntradayStrategies([...pre, ...signal], execution, config, { start: day, end: day });
  assert.equal(result.T1.trades.normal[0].requestedAllocation, 40000);
  assert.equal(result.T1.trades.normal[0].quantity, 200);
  assert.equal('multiplier' in result.T1.trades.normal[0], false);
});

test('delivery cost model applies ETF sell-side STT, DP charge, and zero brokerage', () => {
  const result = calculateDeliveryCosts({ entryReference: 100, exitReference: 110, quantity: 100, slippageBps: 2 });
  assert.equal(result.brokerage, 0);
  assert.equal(result.sttBuy, 0);
  assert.ok(result.sttSell > 0);
  assert.equal(result.dpCharge, 15.34);
  assert.ok(result.netPnl < result.referenceGrossPnl);
});

test('P1 enters next session from prior completed 200-session signal and is compared with B1', () => {
  const signals = [];
  const executions = [];
  const start = new Date('2023-01-01T00:00:00Z');
  for (let i = 0; i < 205; i += 1) {
    const date = new Date(start); date.setUTCDate(date.getUTCDate() + i);
    const day = date.toISOString().slice(0, 10);
    const price = i < 200 ? 100 : 110;
    signals.push(bar(day, '15:29', price, price, price, price));
    executions.push(bar(day, '09:15', price, price, price, price), bar(day, '15:29', price, price, price, price));
  }
  const period = { start: '2023-07-20', end: '2023-07-24' };
  const result = runPositionalStrategies(signals, executions, config, period);
  assert.ok(result.P1.scenarios.normal.transactions.some((row) => row.action === 'BUY'));
  assert.ok(result.P1.scenarios.normal.transactions.some((row) => row.action === 'SELL_PERIOD_END'));
  assert.ok(result.B1.scenarios.normal.transactions.some((row) => row.action === 'BUY'));
  const summary = result.P1.scenarios.normal.summary;
  assert.equal(summary.markedSessions, 5);
  assert.equal('trades' in summary, false);
  assert.equal('ladderUsage' in summary, false);
  assert.ok(summary.fees.fees > 0);
  assert.ok(summary.fees.dpCharge > 0);
  assert.ok(summary.fees.slippageCost > 0);
  assert.equal(summary.fees.fees, summary.transactionFees);
});

test('signal context uses only completed prior sessions for SMA inputs', () => {
  const rows = [];
  for (let i = 1; i <= 51; i += 1) rows.push(bar(`2024-01-${String(i).padStart(2, '0')}`, '15:29', i, i, i, i));
  const built = buildSignalContext(rows);
  const context = built.context.get('2024-01-51');
  assert.equal(context.previousClose, 50);
  assert.equal(context.previousSma50, 25.5);
});
