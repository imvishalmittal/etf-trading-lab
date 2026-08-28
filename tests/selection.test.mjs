import test from 'node:test';
import assert from 'node:assert/strict';
import { previousCloseMetrics, selectCandidate } from '../src/selection.mjs';

test('30-session filter uses the previous close and accepts -2.5% or more negative', () => {
  const history = Array.from({ length: 31 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, close: i === 0 ? 100 : 97 }));
  const result = previousCloseMetrics(history, 96);
  assert.equal(result.thirtySessionReturnPct, -3.0000000000000027);
  assert.ok(result.dayReturnPct <= -1);
});

test('chooses most negative 30-session return and enforces previous-session category exclusion', () => {
  const candidates = [
    { symbol: 'A', category: 'GOLD', volume: 900000, thirtySessionReturnPct: -8, dayReturnPct: -1.2 },
    { symbol: 'B', category: 'SILVER', volume: 800000, thirtySessionReturnPct: -6, dayReturnPct: -2 },
  ];
  const result = selectCandidate({
    candidates, minimumVolume: 500000, previousMarketSession: '2026-08-27',
    priorSignals: [{ date: '2026-08-27', status: 'PURCHASED', category: 'GOLD' }],
  });
  assert.equal(result.selected.symbol, 'B');
  assert.equal(result.excluded[0].symbol, 'A');
});
