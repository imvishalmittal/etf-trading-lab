import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { determineExit, nextMultiplier, runBacktest } from '../../src/nifty-etf-m1/engine.mjs';

const config = JSON.parse(fs.readFileSync('research/nifty-etf-m1/frozen-config.json', 'utf8'));
const bar = (clock, open, high = open, low = open, close = open, date = '2024-01-02') => ({
  timestamp: `${date}T${clock}:00+05:30`, open, high, low, close, volume: 1,
});

test('initial hard stop is live on the 09:15 entry bar', () => {
  const result = determineExit([bar('09:15', 100, 100.2, 98.9, 99), bar('15:29', 99)], config.variants.M1, config);
  assert.equal(result.exitReason, 'STOP');
  assert.equal(result.exitReference, 99);
});

test('new trailing stop cannot trigger on the bar that raises it', () => {
  const rows = [
    bar('09:15', 100, 100.6, 99.2, 100.5), // activates; new stop effective next bar
    bar('09:16', 100.5, 101, 100.1, 100.8),
    bar('15:29', 100.7),
  ];
  const result = determineExit(rows, config.variants.M1, config);
  assert.equal(result.exitReason, 'FORCED_15_29');
  assert.equal(result.exitReference, 100.7);
});

test('already-active trail triggers causally on the next bar', () => {
  const rows = [
    bar('09:15', 100, 100.6, 99.2, 100.5),
    bar('09:16', 100.4, 100.5, 99.9, 100),
    bar('15:29', 100),
  ];
  const result = determineExit(rows, config.variants.M1, config);
  assert.equal(result.exitReason, 'STOP');
  assert.equal(result.exitReference, 100.097);
});

test('gap below an already-active stop fills at bar open', () => {
  const rows = [bar('09:15', 100, 100, 99.5, 99.8), bar('09:16', 98, 99, 97, 98), bar('15:29', 98)];
  const result = determineExit(rows, config.variants.C2, config);
  assert.equal(result.exitReason, 'GAP_STOP');
  assert.equal(result.exitReference, 98);
});

test('15:29 exit uses its open without looking forward inside that bar', () => {
  const rows = [bar('09:15', 100, 100.2, 99.5, 100), bar('15:29', 100.5, 101, 98, 99)];
  const result = determineExit(rows, config.variants.M1, config);
  assert.equal(result.exitReason, 'FORCED_15_29');
  assert.equal(result.exitReference, 100.5);
});

test('missing required bars makes session ineligible', () => {
  assert.equal(determineExit([bar('09:16', 100), bar('15:29', 100)], config.variants.C0, config).reason, 'MISSING_OR_INVALID_09_15');
  assert.equal(determineExit([bar('09:15', 100)], config.variants.C0, config).reason, 'MISSING_OR_INVALID_15_29');
});

test('ladder advances and caps/reset cycles exactly', () => {
  assert.deepEqual(nextMultiplier(1, 0), { next: 2, cycleEnded: false, unrecovered: false });
  assert.deepEqual(nextMultiplier(2, -1), { next: 4, cycleEnded: false, unrecovered: false });
  assert.deepEqual(nextMultiplier(4, -1), { next: 8, cycleEnded: false, unrecovered: false });
  assert.deepEqual(nextMultiplier(8, -1), { next: 1, cycleEnded: true, unrecovered: true });
  assert.deepEqual(nextMultiplier(4, 0.01), { next: 1, cycleEnded: true, unrecovered: false });
});

test('missing session does not advance ladder and normal P&L controls quantity path', () => {
  const sessions = [
    [bar('09:15', 100, 100, 99.5, 99.5, '2024-01-01'), bar('15:29', 99.5, 99.5, 99.5, 99.5, '2024-01-01')],
    [bar('09:16', 100, 100, 100, 100, '2024-01-02'), bar('15:29', 100, 100, 100, 100, '2024-01-02')],
    [bar('09:15', 100, 100, 99.5, 99.5, '2024-01-03'), bar('15:29', 99.5, 99.5, 99.5, 99.5, '2024-01-03')],
  ].flat();
  const result = runBacktest(sessions, config).variants.C1;
  assert.deepEqual(result.trades.normal.map((t) => t.multiplier), [1, 2]);
  assert.deepEqual(result.trades.stress.map((t) => t.multiplier), [1, 2]);
  assert.equal(result.rejectedSessions.length, 1);
});
