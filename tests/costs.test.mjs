import test from 'node:test';
import assert from 'node:assert/strict';
import { dhanDeliveryCharges } from '../src/costs.mjs';

test('Dhan ETF delivery charges apply stamp on buy and DP plus equity ETF STT on sell', () => {
  const buy = dhanDeliveryCharges({ side: 'BUY', turnover: 100000, category: 'BROAD_MARKET' });
  const sell = dhanDeliveryCharges({ side: 'SELL', turnover: 100000, category: 'BROAD_MARKET' });
  assert.equal(buy.brokerage, 0);
  assert.equal(buy.stampDuty, 15);
  assert.equal(buy.stt, 0);
  assert.equal(sell.stt, 1);
  assert.equal(sell.dpCharge, 14.75);
});

test('non-equity ETFs do not pay STT in the Dhan delivery model', () => {
  for (const category of ['GOLD', 'SILVER', 'DEBT_LIQUID', 'GLOBAL']) {
    assert.equal(dhanDeliveryCharges({ side: 'SELL', turnover: 100000, category }).stt, 0);
  }
});
