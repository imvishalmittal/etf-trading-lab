import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { completeMinuteSession, crossGapInvalidDates, determineI1, evaluateEdgeGates, median, s1Signal, s2Signal, stopOutcome } from '../../src/nifty-etf-edge/engine.mjs';

const config = JSON.parse(fs.readFileSync('research/nifty-etf-edge/frozen-config.json', 'utf8'));
const bar = (date, at, open, high = open, low = open, close = open, volume = 100) => ({ timestamp: `${date}T${at}:00+05:30`, open, high, low, close, volume });
const session = (date, end = '15:29', value = 100) => {
  const start = 9 * 60 + 15, finish = Number(end.slice(0, 2)) * 60 + Number(end.slice(3));
  const bars = Array.from({ length: finish - start + 1 }, (_, index) => {
    const at = start + index;
    return bar(date, `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`, value);
  });
  return { date, bars };
};
const daily = (date, close, volume = 1000, trueRange = 2) => ({ date, close, volume, trueRange });

test('median is deterministic for odd and even observations', () => {
  assert.equal(median([4, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test('complete minute session rejects a missing interior bar', () => {
  const full = session('2024-01-02');
  assert.equal(completeMinuteSession(full), true);
  full.bars.splice(100, 1);
  assert.equal(completeMinuteSession(full), false);
});

test('cross-instrument opening-gap audit rejects an isolated ETF opening print', () => {
  const market = [...session('2024-01-01').bars, ...session('2024-01-02', '15:29', 101).bars];
  const assetDay1 = session('2024-01-01', '15:29', 100);
  const assetDay2 = session('2024-01-02', '15:29', 100);
  Object.assign(assetDay2.bars[0], { open: 110, high: 110, low: 100, close: 100 });
  const invalid = crossGapInvalidDates(market, [...assetDay1.bars, ...assetDay2.bars], 0.03);
  assert.equal(invalid.length, 1);
  assert.equal(invalid[0].date, '2024-01-02');
});

test('S1 uses only completed data and requires three down sessions totaling at least 3 percent', () => {
  const asset = Array.from({ length: 101 }, (_, index) => daily(`A${index}`, 100 + index * 0.1));
  asset[97].close = 120;
  asset[98].close = 118.5;
  asset[99].close = 117;
  asset[100].close = 116;
  const market = Array.from({ length: 200 }, (_, index) => daily(`M${index}`, 100 + index));
  const signal = s1Signal(asset, market, 100, 199, config);
  assert.ok(signal);
  assert.ok(signal.cumulativeDecline <= -0.03);
  asset[99].close = 119;
  assert.equal(s1Signal(asset, market, 100, 199, config), null);
});

test('S2 compares the signal close and volume only with prior sessions', () => {
  const rows = Array.from({ length: 101 }, (_, index) => daily(`D${index}`, 100 + index * 0.1, 1000));
  rows[100].close = 120;
  rows[100].volume = 1500;
  const signal = s2Signal(rows, 100, config);
  assert.ok(signal);
  assert.equal(signal.volumeMultiple, 1.5);
  rows[100].close = rows[99].close;
  assert.equal(s2Signal(rows, 100, config), null);
});

test('ATR stop gaps fill at the open and otherwise trade through at the stop', () => {
  const day = session('2024-01-02');
  Object.assign(day.bars[1], { open: 97, high: 98, low: 96, close: 97 });
  assert.deepEqual(stopOutcome(day, 98), { exitReference: 97, exitTime: '09:16', exitReason: 'GAP_STOP' });
  const day2 = session('2024-01-03');
  Object.assign(day2.bars[1], { open: 99, high: 100, low: 97, close: 98 });
  assert.deepEqual(stopOutcome(day2, 98), { exitReference: 98, exitTime: '09:16', exitReason: 'ATR_STOP' });
});

test('I1 enters only after a completed five-minute VWAP reclaim and exits at 2R', () => {
  const market = session('2024-01-02', '15:15', 101);
  const asset = session('2024-01-02', '15:15', 100);
  for (let index = 0; index < 15; index += 1) Object.assign(asset.bars[index], { low: 98.8, close: index < 15 ? 99 : 100, volume: 100 });
  for (let index = 10; index < 15; index += 1) Object.assign(asset.bars[index], { open: 99, high: 99.2, low: 98.8, close: 99, volume: 100 });
  for (let index = 15; index < 20; index += 1) Object.assign(asset.bars[index], { open: 99.5, high: 100.4, low: 99.5, close: 100.4, volume: 100 });
  Object.assign(asset.bars[20], { open: 100.5, high: 100.6, low: 100.4, close: 100.5 });
  Object.assign(asset.bars[21], { open: 100.6, high: 102.6, low: 100.5, close: 102 });
  const result = determineI1(market, asset, 100, 99, config);
  assert.equal(result.status, 'TRADE');
  assert.equal(result.entryTime, '09:35');
  assert.equal(result.exitReason, 'TARGET');
  assert.equal(result.exitReference, result.target);
});

test('I1 processes a same-bar stop before a same-bar target', () => {
  const market = session('2024-01-02', '15:15', 101);
  const asset = session('2024-01-02', '15:15', 100);
  for (let index = 10; index < 15; index += 1) Object.assign(asset.bars[index], { open: 99, high: 99.2, low: 98.8, close: 99, volume: 100 });
  for (let index = 15; index < 20; index += 1) Object.assign(asset.bars[index], { open: 99.5, high: 100.4, low: 99.5, close: 100.4, volume: 100 });
  Object.assign(asset.bars[20], { open: 100.5, high: 103, low: 99, close: 101 });
  const result = determineI1(market, asset, 100, 99, config);
  assert.equal(result.status, 'TRADE');
  assert.equal(result.exitReason, 'STOP');
});

test('failed coverage is DATA_BLOCKED rather than an economic rejection', () => {
  const scenario = { trades: 100, netPnl: 1, profitFactor: 2, maximumDrawdown: 1, maximumDeployedCapital: 39999, monthly: { '2024-01': 1 }, yearly: { '2024': 1 } };
  const result = {
    summary: { normal: scenario, stress: scenario, severe: scenario },
    rejectedSessions: [{ date: '2024-01-01' }],
    bootstrap: { lower95MeanPnl: 1 },
    concentration: { maximumSingleYearPositiveContribution: 0.5, top10PercentWinnerContribution: 0.5 },
  };
  assert.equal(evaluateEdgeGates('I1', result, 10, config, 'discovery').decision, 'DATA_BLOCKED');
});
