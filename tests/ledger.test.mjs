import test from 'node:test';
import assert from 'node:assert/strict';
import { addDeposit, buySleeves, sellTargets } from '../src/ledger.mjs';

const fresh = () => ({ cash: 0, deposits: [], openLots: [], closedTrades: [], signals: [] });

test('one 15000 deposit funds two whole-share strategy sleeves', () => {
  const ledger = fresh();
  assert.equal(addDeposit(ledger, '2026-08-27', 15000), true);
  assert.equal(addDeposit(ledger, '2026-08-27', 15000), false);
  const lots = buySleeves(ledger, {
    date: '2026-08-27', budget: 15000,
    candidate: { symbol: 'GOLDETF', name: 'Gold ETF', category: 'GOLD', currentPrice: 100, dayReturnPct: -1.2, thirtySessionReturnPct: -5, volume: 900000 },
    strategies: [{ id: 'ETF-8', targetPct: 8, allocation: .5 }, { id: 'ETF-12', targetPct: 12, allocation: .5 }],
  });
  assert.equal(lots.length, 2);
  assert.equal(lots[0].quantity, 75);
  assert.equal(ledger.cash, 0);
});

test('cannot sell on purchase date and sells each sleeve at its own target', () => {
  const ledger = fresh(); addDeposit(ledger, '2026-08-27', 15000);
  buySleeves(ledger, {
    date: '2026-08-27', budget: 15000,
    candidate: { symbol: 'X', name: 'X', category: 'GOLD', currentPrice: 100, dayReturnPct: -1, thirtySessionReturnPct: -3, volume: 600000 },
    strategies: [{ id: 'ETF-8', targetPct: 8, allocation: .5 }, { id: 'ETF-12', targetPct: 12, allocation: .5 }],
  });
  assert.equal(sellTargets(ledger, { date: '2026-08-27', quotes: { X: { high: 120, lastPrice: 115 } } }).length, 0);
  assert.equal(sellTargets(ledger, { date: '2026-08-28', quotes: { X: { high: 109, lastPrice: 108 } } }).length, 1);
  assert.equal(ledger.openLots[0].strategy, 'ETF-12');
});
