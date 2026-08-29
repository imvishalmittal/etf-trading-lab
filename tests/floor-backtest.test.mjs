import test from 'node:test';
import assert from 'node:assert/strict';
import { runFloorBacktest, trailingFloorPrice } from '../src/floor-backtest.mjs';

const candidate = { symbol: 'X', category: 'GOLD', currentPrice: 100, volume: 600001, thirtySessionReturnPct: -5, dayReturnPct: -2 };
test('8 percent touch arms a floor but does not exit until a later session falls back', () => {
  const sessions = [
    { date: '2026-01-01', previousDate: null, candidates: [candidate], candles: { X: { high: 101, low: 99, close: 100 } } },
    { date: '2026-01-02', previousDate: '2026-01-01', candidates: [], candles: { X: { high: 109, low: 105, close: 109 } } },
    { date: '2026-01-05', previousDate: '2026-01-02', candidates: [], candles: { X: { high: 112, low: 107, close: 110 } } },
  ];
  const result = runFloorBacktest({ sessions });
  assert.equal(result.closedTrades.length, 1);
  assert.equal(result.closedTrades[0].sellDate, '2026-01-05');
  assert.equal(result.closedTrades[0].sellPrice, 108);
});

test('unsold winners remain in final account value', () => {
  const sessions = [
    { date: '2026-01-01', previousDate: null, candidates: [candidate], candles: { X: { high: 101, low: 99, close: 100 } } },
    { date: '2026-01-02', previousDate: '2026-01-01', candidates: [], candles: { X: { high: 120, low: 110, close: 118 } } },
  ];
  const result = runFloorBacktest({ sessions });
  assert.equal(result.openLots.length, 1);
  assert.equal(result.holdingsValue, 17700);
  assert.equal(result.accountValue, 32700);
});

test('trailing floor never drops below 8 percent and follows the peak by percentage points', () => {
  assert.equal(trailingFloorPrice({ entryPrice: 100, peakPrice: 109, minimumFloorPct: 8, trailingGapPct: 3 }), 108);
  assert.equal(trailingFloorPrice({ entryPrice: 100, peakPrice: 120, minimumFloorPct: 8, trailingGapPct: 3 }), 117);
  assert.equal(trailingFloorPrice({ entryPrice: 100, peakPrice: 120, minimumFloorPct: 8, trailingGapPct: 5 }), 115);
});
