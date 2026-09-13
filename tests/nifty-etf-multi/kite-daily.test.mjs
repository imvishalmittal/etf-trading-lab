import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchKiteDailyCandles } from '../../src/nifty-etf-m1/kite-data.mjs';

test('daily Kite acquisition uses day endpoint and deterministic chunks', async () => {
  const original = global.fetch; const urls = [];
  global.fetch = async (url) => { urls.push(String(url)); return { ok: true, json: async () => ({ status: 'success', data: { candles: [['2020-01-01T00:00:00+0530', 100, 101, 99, 100.5, 1000]] } }) }; };
  try {
    const result = await fetchKiteDailyCandles({ apiKey: 'key', accessToken: 'token', instrumentToken: 123, start: '2020-01-01', end: '2020-01-03', spacingMs: 0 });
    assert.equal(result.chunks.length, 1);
    assert.match(urls[0], /historical\/123\/day/);
    assert.equal(result.candles[0].timestamp, '2020-01-01T00:00:00+05:30');
  } finally { global.fetch = original; }
});
