import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { completeWindow, determineIntraday, evaluateGates, fiveMinutePostOpen, st1Signal } from '../../src/nifty-etf-edge2/engine.mjs';

const config = JSON.parse(fs.readFileSync('research/nifty-etf-edge2/frozen-config.json', 'utf8'));
const bar = (date, at, value = 100, volume = 100) => ({ timestamp: `${date}T${at}:00+05:30`, open: value, high: value, low: value, close: value, volume });
const session = (date, start = '09:15', end = '15:29', value = 100) => {
  const first = Number(start.slice(0, 2)) * 60 + Number(start.slice(3)), last = Number(end.slice(0, 2)) * 60 + Number(end.slice(3));
  return { date, bars: Array.from({ length: last - first + 1 }, (_, index) => { const m = first + index; return bar(date, `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, value); }) };
};

test('post-open completeness ignores an anomalous or absent 09:15 bar', () => {
  const day = session('2024-01-02');
  day.bars[0] = { ...day.bars[0], open: 150, high: 150, low: 90 };
  assert.equal(completeWindow(day), true);
  day.bars.splice(20, 1);
  assert.equal(completeWindow(day), false);
});

test('post-open five-minute blocks begin at 09:20 and calculate causal VWAP', () => {
  const blocks = fiveMinutePostOpen(session('2024-01-02'), '09:39');
  assert.equal(blocks.length, 4);
  assert.equal(blocks[0].start, '09:20');
  assert.equal(blocks[0].end, '09:24');
  assert.equal(blocks[3].end, '09:39');
  assert.equal(blocks[3].vwap, 100);
});

test('ST1 signal requires three down closes and completed trend filters', () => {
  const asset = Array.from({ length: 101 }, (_, i) => ({ date: `A${i}`, close: 100 + i * 0.1, trueRange: 2 }));
  asset[97].close = 120; asset[98].close = 119; asset[99].close = 118; asset[100].close = 117;
  const market = Array.from({ length: 200 }, (_, i) => ({ date: `M${i}`, close: 100 + i, trueRange: 2 }));
  assert.ok(st1Signal(asset, market, 100, 199, config));
  asset[100].close = 119;
  assert.equal(st1Signal(asset, market, 100, 199, config), null);
});

test('OR1 enters only after the completed 09:39 breakout block', () => {
  const market = session('2024-01-02'), asset = session('2024-01-02');
  for (const row of asset.bars.filter((x) => x.timestamp.slice(11, 16) >= '09:35' && x.timestamp.slice(11, 16) <= '09:39')) Object.assign(row, { open: 100.2, high: 100.6, low: 100.1, close: 100.6 });
  const entry = asset.bars.find((x) => x.timestamp.includes('09:40'));
  Object.assign(entry, { open: 100.5, high: 100.5, low: 100.5, close: 100.5 });
  const targetBar = asset.bars.find((x) => x.timestamp.includes('09:41'));
  Object.assign(targetBar, { open: 100.5, high: 101.3, low: 100.4, close: 101.2 });
  const result = determineIntraday('OR1', market, asset, 101, 100, config);
  assert.equal(result.status, 'TRADE');
  assert.equal(result.entryTime, '09:40');
  assert.equal(result.exitReason, 'TARGET');
});

test('same-bar stop is processed before target', () => {
  const market = session('2024-01-02'), asset = session('2024-01-02');
  for (const row of asset.bars.filter((x) => x.timestamp.slice(11, 16) >= '09:35' && x.timestamp.slice(11, 16) <= '09:39')) Object.assign(row, { open: 100.2, high: 100.6, low: 100.1, close: 100.6 });
  const entry = asset.bars.find((x) => x.timestamp.includes('09:40'));
  Object.assign(entry, { open: 100.5, high: 102, low: 99.5, close: 101 });
  const result = determineIntraday('OR1', market, asset, 101, 100, config);
  assert.equal(result.status, 'TRADE');
  assert.equal(result.exitReason, 'STOP');
});

test('coverage failure is classified DATA_BLOCKED', () => {
  const scenario = { trades: 100, netPnl: 10, profitFactor: 2, maximumDrawdown: 1, maximumDeployedCapital: 39999, monthly: { '2024-01': 10 }, yearly: { '2024': 10 } };
  const result = { summary: { normal: scenario, stress: scenario, severe: scenario }, rejectedSessions: [{ date: '2024-01-01' }], bootstrap: { lower95MeanPnl: 1 }, concentration: { maximumSingleYearPositiveContribution: 0.5, top10PercentWinnerContribution: 0.5 } };
  assert.equal(evaluateGates('OR1', result, 10, config, 'discovery').decision, 'DATA_BLOCKED');
});
