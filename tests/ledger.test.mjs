import test from 'node:test';
import assert from 'node:assert/strict';
import { addDeposit, buySleeves, sellTargets } from '../src/ledger.mjs';

const fresh = () => ({ cash: 0, deposits: [], openLots: [], closedTrades: [], signals: [] });

test('one 30000 deposit funds two 15000 whole-share strategy sleeves', () => {
  const ledger = fresh();
  assert.equal(addDeposit(ledger, '2026-08-27', 30000), true);
  assert.equal(addDeposit(ledger, '2026-08-27', 30000), false);
  const lots = buySleeves(ledger, {
    date: '2026-08-27', budget: 30000,
    candidate: { symbol: 'GOLDETF', name: 'Gold ETF', category: 'GOLD', currentPrice: 100, dayReturnPct: -1.2, thirtySessionReturnPct: -5, volume: 900000 },
    strategies: [{ id: 'ETF-8-FLOOR', floorPct: 8, allocation: .5 }, { id: 'ETF-15-FLOOR', floorPct: 15, allocation: .5 }],
  });
  assert.equal(lots.length, 2);
  assert.equal(lots[0].quantity, 150);
  assert.equal(ledger.cash, 0);
});

test('arms each fixed floor and exits only on a later session fallback', () => {
  const ledger = fresh(); addDeposit(ledger, '2026-08-27', 30000);
  buySleeves(ledger, {
    date: '2026-08-27', budget: 30000,
    candidate: { symbol: 'X', name: 'X', category: 'GOLD', currentPrice: 100, dayReturnPct: -1, thirtySessionReturnPct: -3, volume: 600000 },
    strategies: [{ id: 'ETF-8-FLOOR', floorPct: 8, allocation: .5 }, { id: 'ETF-15-FLOOR', floorPct: 15, allocation: .5 }],
  });
  assert.equal(sellTargets(ledger, { date: '2026-08-27', quotes: { X: { open: 100, high: 120, low: 99, lastPrice: 115 } } }).length, 0);
  assert.equal(sellTargets(ledger, { date: '2026-08-28', quotes: { X: { open: 109, high: 110, low: 107, lastPrice: 109 } } }).length, 0);
  const sold = sellTargets(ledger, { date: '2026-08-31', quotes: { X: { open: 107, high: 114, low: 106, lastPrice: 107 } } });
  assert.equal(sold.length, 1);
  assert.equal(sold[0].strategy, 'ETF-8-FLOOR');
  assert.equal(sold[0].exitReason, 'FLOOR_GAP');
  assert.equal(ledger.openLots[0].strategy, 'ETF-15-FLOOR');
});
