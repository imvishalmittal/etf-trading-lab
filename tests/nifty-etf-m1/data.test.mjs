import assert from 'node:assert/strict';
import test from 'node:test';

import { auditCandles, chunkDateRange, normalizeTimestamp } from '../../src/nifty-etf-m1/data.mjs';

test('29-calendar-day inclusive chunks stay within Groww limit', () => {
  assert.deepEqual(chunkDateRange('2020-01-01', '2020-02-10'), [
    { start: '2020-01-01', end: '2020-01-29' },
    { start: '2020-01-30', end: '2020-02-10' },
  ]);
});

test('normalizes epoch seconds to explicit India timezone', () => {
  assert.equal(normalizeTimestamp(0), '1970-01-01T05:30:00+05:30');
  assert.equal(normalizeTimestamp('2020-01-02T09:15:00+0530'), '2020-01-02T09:15:00+05:30');
});

test('audits duplicates, ordering, missing endpoint bars, and invalid OHLC', () => {
  const rows = [
    { timestamp: '2024-01-02T15:29:00+05:30', open: 100, high: 101, low: 99, close: 100, volume: 1 },
    { timestamp: '2024-01-02T09:15:00+05:30', open: 100, high: 101, low: 99, close: 100, volume: 1 },
    { timestamp: '2024-01-02T09:15:00+05:30', open: 100, high: 101, low: 99, close: 100, volume: 1 },
    { timestamp: '2024-01-03T09:15:00+05:30', open: 100, high: 99, low: 98, close: 100, volume: 1 },
  ];
  const result = auditCandles(rows, { start: '2024-01-01', end: '2024-01-31' });
  assert.equal(result.report.outOfOrderCount, 1);
  assert.equal(result.report.duplicateTimestampCount, 1);
  assert.equal(result.report.invalidOhlcCount, 1);
  assert.deepEqual(result.report.missing1529, ['2024-01-03']);
  assert.equal(result.report.criticalIntegrityFailure, true);
});
