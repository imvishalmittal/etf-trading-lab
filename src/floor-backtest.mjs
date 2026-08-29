import { selectCandidate } from './selection.mjs';
import { xirr } from './xirr.mjs';

const round = (v, n = 2) => Number(Number(v || 0).toFixed(n));

export function trailingFloorPrice({ entryPrice, peakPrice, minimumFloorPct = 8, trailingGapPct }) {
  const peakReturnPct = (peakPrice / entryPrice - 1) * 100;
  const protectedReturnPct = Math.max(minimumFloorPct, peakReturnPct - trailingGapPct);
  return round(entryPrice * (1 + protectedReturnPct / 100), 4);
}

export function runFloorBacktest({ sessions, dailyFunding = 15000, floorPct = 8, minimumVolume = 500000 }) {
  let cash = 0; let previousCategory = null; let id = 0;
  const deposits = [], openLots = [], closedTrades = [], signals = [];
  for (const session of sessions) {
    cash = round(cash + dailyFunding); deposits.push({ date: session.date, amount: dailyFunding });
    for (let i = openLots.length - 1; i >= 0; i -= 1) {
      const lot = openLots[i], candle = session.candles[lot.symbol];
      if (!candle) continue;
      lot.lastPrice = candle.close;
      if (lot.floorArmedBeforeSession && candle.low <= lot.floorPrice) {
        const sellValue = round(lot.quantity * lot.floorPrice);
        cash = round(cash + sellValue);
        closedTrades.push({ ...lot, sellDate: session.date, sellPrice: lot.floorPrice, sellValue, profit: round(sellValue - lot.purchaseValue), returnPct: floorPct });
        openLots.splice(i, 1);
      } else if (!lot.floorArmed && candle.high >= lot.floorPrice) {
        lot.floorArmed = true; lot.armedDate = session.date;
      }
    }
    for (const lot of openLots) lot.floorArmedBeforeSession = lot.floorArmed;
    const choice = selectCandidate({ candidates: session.candidates, previousMarketSession: session.previousDate, priorSignals: previousCategory ? [{ date: session.previousDate, status: 'PURCHASED', category: previousCategory }] : [], minimumVolume });
    if (!choice.selected) { signals.push({ date: session.date, status: 'NO_SIGNAL' }); previousCategory = null; continue; }
    const entry = choice.selected.currentPrice;
    const quantity = Math.floor(Math.min(cash, dailyFunding) / entry);
    if (quantity < 1) { signals.push({ date: session.date, status: 'INSUFFICIENT_CASH' }); previousCategory = null; continue; }
    const purchaseValue = round(quantity * entry); cash = round(cash - purchaseValue);
    openLots.push({ id: `FLOOR-${++id}`, symbol: choice.selected.symbol, category: choice.selected.category, purchaseDate: session.date, purchasePrice: entry, quantity, purchaseValue, floorPrice: round(entry * (1 + floorPct / 100), 4), floorArmed: false, floorArmedBeforeSession: false, armedDate: null, lastPrice: entry });
    previousCategory = choice.selected.category;
    signals.push({ date: session.date, status: 'PURCHASED', symbol: choice.selected.symbol, category: choice.selected.category });
  }
  const finalDate = sessions.at(-1)?.date;
  const holdingsValue = round(openLots.reduce((sum, lot) => sum + lot.quantity * lot.lastPrice, 0));
  const accountValue = round(cash + holdingsValue);
  const totalDeposits = round(deposits.reduce((sum, d) => sum + d.amount, 0));
  const flows = deposits.map((d) => ({ date: d.date, amount: -d.amount }));
  if (finalDate) flows.push({ date: finalDate, amount: accountValue });
  const rate = xirr(flows);
  return { finalDate, dailyFunding, totalDeposits, cash, holdingsValue, accountValue, profit: round(accountValue - totalDeposits), xirrPct: Number.isFinite(rate) ? round(rate * 100, 4) : null, deposits: deposits.length, purchases: signals.filter((s) => s.status === 'PURCHASED').length, armedOpenLots: openLots.filter((l) => l.floorArmed).length, openLots, closedTrades, signals };
}
