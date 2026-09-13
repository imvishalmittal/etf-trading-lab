import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateIntradayCosts, COST_SCHEDULE } from '../../src/nifty-etf-m1/costs.mjs';

test('charges every intraday component and caps brokerage per order', () => {
  const result = calculateIntradayCosts({ entryReference: 250, exitReference: 252, quantity: 160, slippageBps: 2 });
  assert.equal(result.brokerageBuy, 12.0024);
  assert.ok(result.brokerageSell < 20);
  assert.ok(result.stt > 0);
  assert.ok(result.transactionCharges > 0);
  assert.ok(result.sebiCharges > 0);
  assert.ok(result.stampDuty > 0);
  assert.ok(result.ipft > 0);
  assert.ok(result.gst > 0);
  assert.equal(COST_SCHEDULE.sttSellRate, 0.00025);
});

test('adverse slippage raises entry, lowers exit, and reduces net P&L', () => {
  const normal = calculateIntradayCosts({ entryReference: 100, exitReference: 101, quantity: 50, slippageBps: 2 });
  const severe = calculateIntradayCosts({ entryReference: 100, exitReference: 101, quantity: 50, slippageBps: 10 });
  assert.ok(normal.entryFill > 100);
  assert.ok(normal.exitFill < 101);
  assert.ok(severe.netPnl < normal.netPnl);
  assert.ok(severe.slippageCost > normal.slippageCost);
});

test('brokerage is capped independently on both orders', () => {
  const result = calculateIntradayCosts({ entryReference: 1000, exitReference: 1000, quantity: 1000, slippageBps: 0 });
  assert.equal(result.brokerageBuy, 20);
  assert.equal(result.brokerageSell, 20);
});
