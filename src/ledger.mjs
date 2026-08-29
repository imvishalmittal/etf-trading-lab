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
      purchaseObservedAt: '15:15 IST',
      purchasePriceSource: 'Groww live quote',
      purchasePrice: round(candidate.currentPrice, 4),
      quantity,
      purchaseValue: cost,
      floorPct: strategy.floorPct,
      floorPrice: round(candidate.currentPrice * (1 + strategy.floorPct / 100), 4),
      floorArmed: false,
      armedDate: null,
      peakPrice: round(candidate.currentPrice, 4),
      peakDate: date,
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
    purchasePrice1515: round(candidate.currentPrice, 4),
    purchaseObservedAt: '15:15 IST',
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
    if (date > lot.purchaseDate && Number(quote?.high) > Number(lot.peakPrice || lot.purchasePrice)) {
      lot.peakPrice = round(quote.high, 4);
      lot.peakDate = date;
    }
    const eligible = date > lot.purchaseDate;
    const floorPrice = Number(lot.floorPrice ?? lot.targetPrice);
    if (!lot.floorArmed && eligible && Number(quote?.high) >= floorPrice) {
      lot.floorArmed = true;
      lot.armedDate = date;
    }
    const exitEligible = lot.floorArmed && date > lot.armedDate && Number(quote?.low) <= floorPrice;
    if (!exitEligible) { remaining.push(lot); continue; }
    const sellPrice = Number(quote?.open) < floorPrice ? Number(quote.open) : floorPrice;
    const proceeds = round(lot.quantity * sellPrice);
    const trade = {
      ...lot,
      sellDate: date,
      sellPrice,
      sellValue: proceeds,
      profit: round(proceeds - lot.purchaseValue),
      returnPct: round((proceeds / lot.purchaseValue - 1) * 100, 4),
      maxAchievedReturnPct: round(((lot.peakPrice || lot.purchasePrice) / lot.purchasePrice - 1) * 100, 4),
      holdingDays: calendarDaysBetween(lot.purchaseDate, date),
      exitReason: Number(quote?.open) < floorPrice ? 'FLOOR_GAP' : 'FLOOR',
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
