import { calendarDaysBetween } from './time.mjs';

const round = (value, digits = 2) => Number(Number(value).toFixed(digits));

export function addDeposit(ledger, date, amount) {
  if (ledger.deposits.some((row) => row.date === date)) return false;
  ledger.deposits.push({ id: `DEP-${date}`, date, amount });
  ledger.cash = round(ledger.cash + amount);
  return true;
}

export function buySleeves(ledger, { date, candidate, strategies, budget }) {
  if (ledger.signals.some((row) => row.date === date)) return [];
  const lots = [];
  for (const strategy of strategies) {
    const sleeveBudget = Math.min(ledger.cash, budget * strategy.allocation);
    const quantity = Math.floor(sleeveBudget / candidate.currentPrice);
    if (quantity < 1) continue;
    const cost = round(quantity * candidate.currentPrice);
    const lot = {
      id: `${date}-${candidate.symbol}-${strategy.id}`,
      strategy: strategy.id,
      symbol: candidate.symbol,
      name: candidate.name,
      category: candidate.category,
      purchaseDate: date,
      purchasePrice: round(candidate.currentPrice, 4),
      quantity,
      purchaseValue: cost,
      targetPct: strategy.targetPct,
      targetPrice: round(candidate.currentPrice * (1 + strategy.targetPct / 100), 4),
      lastPrice: round(candidate.currentPrice, 4),
      lastValuationDate: date,
    };
    ledger.cash = round(ledger.cash - cost);
    ledger.openLots.push(lot);
    lots.push(lot);
  }
  ledger.signals.push({
    date, status: lots.length ? 'PURCHASED' : 'INSUFFICIENT_CASH',
    symbol: candidate.symbol, category: candidate.category,
    dayReturnPct: round(candidate.dayReturnPct, 4),
    thirtySessionReturnPct: round(candidate.thirtySessionReturnPct, 4),
    volume: candidate.volume,
  });
  return lots;
}

export function recordNoSignal(ledger, date, detail = {}) {
  if (ledger.signals.some((row) => row.date === date)) return false;
  ledger.signals.push({ date, status: 'NO_SIGNAL', ...detail });
  return true;
}

export function sellTargets(ledger, { date, quotes }) {
  const sold = [];
  const remaining = [];
  for (const lot of ledger.openLots) {
    const quote = quotes[lot.symbol];
    if (quote?.lastPrice > 0) {
      lot.lastPrice = round(quote.lastPrice, 4);
      lot.lastValuationDate = date;
    }
    const eligible = date > lot.purchaseDate;
    if (!eligible || Number(quote?.high) < lot.targetPrice) {
      remaining.push(lot);
      continue;
    }
    const proceeds = round(lot.quantity * lot.targetPrice);
    const trade = {
      ...lot,
      sellDate: date,
      sellPrice: lot.targetPrice,
      sellValue: proceeds,
      profit: round(proceeds - lot.purchaseValue),
      returnPct: round((proceeds / lot.purchaseValue - 1) * 100, 4),
      holdingDays: calendarDaysBetween(lot.purchaseDate, date),
      exitReason: 'TARGET',
    };
    ledger.cash = round(ledger.cash + proceeds);
    ledger.closedTrades.push(trade);
    sold.push(trade);
  }
  ledger.openLots = remaining;
  return sold;
}

export function touchLedger(ledger, now = new Date()) {
  ledger.createdAt ||= now.toISOString();
  ledger.updatedAt = now.toISOString();
  return ledger;
}
