const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));
const NON_EQUITY_ETF_CATEGORIES = new Set(['GOLD', 'SILVER', 'DEBT_LIQUID', 'GLOBAL']);

export function isEquityOrientedEtfCategory(category) {
  return !NON_EQUITY_ETF_CATEGORIES.has(category);
}

export function dhanDeliveryCharges({ side, turnover, category }) {
  const exchangeTransaction = round(turnover * 0.000030699);
  const sebiTurnover = round(turnover * 0.000001);
  const ipft = round(turnover * 0.000000001);
  const gst = round((exchangeTransaction + sebiTurnover + ipft) * 0.18);
  const stampDuty = side === 'BUY' ? Math.round(turnover * 0.00015) : 0;
  const stt = side === 'SELL' && isEquityOrientedEtfCategory(category) ? Math.round(turnover * 0.00001) : 0;
  const dpCharge = side === 'SELL' ? 14.75 : 0;
  return { brokerage: 0, exchangeTransaction, sebiTurnover, ipft, gst, stampDuty, stt, dpCharge, total: round(exchangeTransaction + sebiTurnover + ipft + gst + stampDuty + stt + dpCharge) };
}
