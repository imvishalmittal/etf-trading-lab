export const COST_SCHEDULE = Object.freeze({
  effectiveDate: '2026-09-13',
  brokerageRate: 0.0003,
  brokerageCapPerOrder: 20,
  sttSellRate: 0.00025,
  nseTransactionRate: 0.000030699,
  sebiTurnoverRate: 0.000001,
  gstRate: 0.18,
  stampBuyRate: 0.00003,
  ipftRate: 0.000000001,
  sources: ['https://zerodha.com/charges/', 'https://dhan.co/pricing/'],
});

export const DELIVERY_COST_SCHEDULE = Object.freeze({
  effectiveDate: '2026-09-13',
  brokeragePerOrder: 0,
  sttBuyRate: 0,
  sttSellRate: 0.00001,
  nseTransactionRate: 0.000030699,
  sebiTurnoverRate: 0.000001,
  gstRate: 0.18,
  stampBuyRate: 0.00015,
  ipftRate: 0.000000001,
  dpSellCharge: 15.34,
  sources: ['https://zerodha.com/charges/'],
});

const finitePositive = (value, name) => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive`);
};

export function calculateIntradayCosts({ entryReference, exitReference, quantity, slippageBps }) {
  finitePositive(entryReference, 'entryReference');
  finitePositive(exitReference, 'exitReference');
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('quantity must be a positive integer');
  if (!Number.isFinite(slippageBps) || slippageBps < 0) throw new Error('slippageBps must be non-negative');

  const entryFill = entryReference * (1 + slippageBps / 10_000);
  const exitFill = exitReference * (1 - slippageBps / 10_000);
  const buyTurnover = entryFill * quantity;
  const sellTurnover = exitFill * quantity;
  const turnover = buyTurnover + sellTurnover;
  const brokerageBuy = Math.min(COST_SCHEDULE.brokerageCapPerOrder, buyTurnover * COST_SCHEDULE.brokerageRate);
  const brokerageSell = Math.min(COST_SCHEDULE.brokerageCapPerOrder, sellTurnover * COST_SCHEDULE.brokerageRate);
  const brokerage = brokerageBuy + brokerageSell;
  const stt = sellTurnover * COST_SCHEDULE.sttSellRate;
  const transactionCharges = turnover * COST_SCHEDULE.nseTransactionRate;
  const sebiCharges = turnover * COST_SCHEDULE.sebiTurnoverRate;
  const stampDuty = buyTurnover * COST_SCHEDULE.stampBuyRate;
  const ipft = turnover * COST_SCHEDULE.ipftRate;
  const gst = (brokerage + transactionCharges + sebiCharges + ipft) * COST_SCHEDULE.gstRate;
  const fees = brokerage + stt + transactionCharges + sebiCharges + stampDuty + ipft + gst;
  const grossPnl = (exitFill - entryFill) * quantity;
  const referenceGrossPnl = (exitReference - entryReference) * quantity;
  const slippageCost = referenceGrossPnl - grossPnl;
  return {
    entryFill, exitFill, buyTurnover, sellTurnover, brokerageBuy, brokerageSell, brokerage,
    stt, transactionCharges, sebiCharges, stampDuty, ipft, gst, fees, grossPnl,
    referenceGrossPnl, slippageCost, netPnl: grossPnl - fees,
  };
}

export function calculateDeliveryCosts({ entryReference, exitReference, quantity, slippageBps, equityOriented = true }) {
  finitePositive(entryReference, 'entryReference');
  finitePositive(exitReference, 'exitReference');
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('quantity must be a positive integer');
  if (!Number.isFinite(slippageBps) || slippageBps < 0) throw new Error('slippageBps must be non-negative');
  const entryFill = entryReference * (1 + slippageBps / 10_000);
  const exitFill = exitReference * (1 - slippageBps / 10_000);
  const buyTurnover = entryFill * quantity;
  const sellTurnover = exitFill * quantity;
  const turnover = buyTurnover + sellTurnover;
  const brokerage = 0;
  const sttBuy = buyTurnover * DELIVERY_COST_SCHEDULE.sttBuyRate;
  const sttSell = equityOriented ? sellTurnover * DELIVERY_COST_SCHEDULE.sttSellRate : 0;
  const stt = sttBuy + sttSell;
  const transactionChargesBuy = buyTurnover * DELIVERY_COST_SCHEDULE.nseTransactionRate;
  const transactionChargesSell = sellTurnover * DELIVERY_COST_SCHEDULE.nseTransactionRate;
  const transactionCharges = transactionChargesBuy + transactionChargesSell;
  const sebiChargesBuy = buyTurnover * DELIVERY_COST_SCHEDULE.sebiTurnoverRate;
  const sebiChargesSell = sellTurnover * DELIVERY_COST_SCHEDULE.sebiTurnoverRate;
  const sebiCharges = sebiChargesBuy + sebiChargesSell;
  const stampDuty = buyTurnover * DELIVERY_COST_SCHEDULE.stampBuyRate;
  const ipftBuy = buyTurnover * DELIVERY_COST_SCHEDULE.ipftRate;
  const ipftSell = sellTurnover * DELIVERY_COST_SCHEDULE.ipftRate;
  const ipft = ipftBuy + ipftSell;
  const gstBuy = (transactionChargesBuy + sebiChargesBuy + ipftBuy) * DELIVERY_COST_SCHEDULE.gstRate;
  const gstSell = (transactionChargesSell + sebiChargesSell + ipftSell) * DELIVERY_COST_SCHEDULE.gstRate;
  const gst = gstBuy + gstSell;
  const buyFees = sttBuy + transactionChargesBuy + sebiChargesBuy + stampDuty + ipftBuy + gstBuy;
  const dpCharge = DELIVERY_COST_SCHEDULE.dpSellCharge;
  const sellFees = sttSell + transactionChargesSell + sebiChargesSell + ipftSell + gstSell + dpCharge;
  const fees = buyFees + sellFees;
  const grossPnl = (exitFill - entryFill) * quantity;
  const referenceGrossPnl = (exitReference - entryReference) * quantity;
  return {
    entryFill, exitFill, buyTurnover, sellTurnover, brokerage, sttBuy, sttSell, stt,
    transactionChargesBuy, transactionChargesSell, transactionCharges,
    sebiChargesBuy, sebiChargesSell, sebiCharges, stampDuty,
    ipftBuy, ipftSell, ipft, gstBuy, gstSell, gst, dpCharge, buyFees, sellFees, fees,
    grossPnl, referenceGrossPnl, slippageCost: referenceGrossPnl - grossPnl,
    netPnl: grossPnl - fees,
  };
}
