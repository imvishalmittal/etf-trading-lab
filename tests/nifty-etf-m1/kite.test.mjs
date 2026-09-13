import assert from 'node:assert/strict';
import test from 'node:test';

import { kiteChecksum } from '../../src/nifty-etf-m1/kite-auth.mjs';
import { fetchKiteMinuteCandles, verifyKiteInstrument } from '../../src/nifty-etf-m1/kite-data.mjs';

test('Kite checksum follows api_key + request_token + api_secret order', () => {
  assert.equal(kiteChecksum('key', 'request', 'secret'), 'e4465f58be6159d2a7f087f4292515e9d631b4f91e056b53e6f14456222ff709');
});

test('Kite instrument resolution requires one exact NSE NIFTYBEES mapping', async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  global.fetch = async () => new Response(
    'instrument_token,exchange_token,tradingsymbol,name,last_price,expiry,strike,tick_size,lot_size,instrument_type,segment,exchange\n12345,1,NIFTYBEES,NIFTYBEES,0,,0,0.01,1,EQ,NSE,NSE\n',
    { status: 200 },
  );
  const result = await verifyKiteInstrument({
    apiKey: 'public-key', accessToken: 'session-token', expected: { exchange: 'NSE', tradingSymbol: 'NIFTYBEES' },
  });
  assert.equal(result.instrumentToken, 12345);
  assert.equal(result.match.lot_size, '1');
});

test('Kite instrument resolution supports the exact NSE indices segment', async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  global.fetch = async () => new Response(
    'instrument_token,exchange_token,tradingsymbol,name,last_price,expiry,strike,tick_size,lot_size,instrument_type,segment,exchange\n256265,1001,NIFTY 50,NIFTY 50,0,,0,0,1,EQ,INDICES,NSE\n',
    { status: 200 },
  );
  const result = await verifyKiteInstrument({
    apiKey: 'public-key', accessToken: 'session-token',
    expected: { exchange: 'NSE', kiteSegment: 'INDICES', tradingSymbol: 'NIFTY 50', instrumentType: 'EQ' },
  });
  assert.equal(result.instrumentToken, 256265);
  assert.equal(result.match.segment, 'INDICES');
});

test('Kite minute download normalizes candles and chunks requests deterministically', async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  const urls = [];
  global.fetch = async (url) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ status: 'success', data: { candles: [['2020-01-02T09:15:00+0530', 100, 101, 99, 100.5, 10]] } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  const result = await fetchKiteMinuteCandles({
    apiKey: 'key', accessToken: 'token', instrumentToken: 12345,
    start: '2020-01-01', end: '2020-03-01', spacingMs: 0,
  });
  assert.equal(urls.length, 2);
  assert.equal(urls.every((url) => url.includes('/instruments/historical/')), true);
  assert.equal(urls.every((url) => !url.includes('/orders')), true);
  assert.deepEqual(result.chunks, [
    { start: '2020-01-01', end: '2020-02-24' },
    { start: '2020-02-25', end: '2020-03-01' },
  ]);
  assert.equal(result.candles[0].timestamp, '2020-01-02T09:15:00+05:30');
});
