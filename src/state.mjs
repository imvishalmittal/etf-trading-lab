import { calendarDaysBetween, indiaParts } from './time.mjs';
import { xirr } from './xirr.mjs';

const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));

export function buildPublicState(ledger, asOf = indiaParts().date) {
  const closeComparisons = ledger.signals.filter((row) => Number.isFinite(row.closeDifferencePct));
  const holdings = ledger.openLots.map((lot) => {
    const currentValue = round(lot.quantity * (lot.lastPrice || lot.purchasePrice));
    return {
      ...lot,
      holdingDays: calendarDaysBetween(lot.purchaseDate, asOf),
      currentValue,
      returnPct: round((currentValue / lot.purchaseValue - 1) * 100, 4),
      peakReturnPct: round(((lot.peakPrice || lot.purchasePrice) / lot.purchasePrice - 1) * 100, 4),
      drawdownFromPeakPct: round(((lot.lastPrice || lot.purchasePrice) / (lot.peakPrice || lot.purchasePrice) - 1) * 100, 4),
    };
  });
  const totalDeposits = round(ledger.deposits.reduce((sum, row) => sum + row.amount, 0));
  const invested = round(holdings.reduce((sum, row) => sum + row.purchaseValue, 0));
  const dematValue = round(holdings.reduce((sum, row) => sum + row.currentValue, 0));
  const accountValue = round(ledger.cash + dematValue);
  const flows = ledger.deposits.map((row) => ({ date: row.date, amount: -row.amount }));
  if (accountValue > 0) flows.push({ date: asOf, amount: accountValue });
  const rate = flows.length >= 2 ? xirr(flows) : null;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    asOf,
    mode: 'RESEARCH_REJECTED',
    summary: {
      totalDeposits, cash: round(ledger.cash), invested, dematValue, accountValue,
      profit: round(accountValue - totalDeposits),
      xirrPct: Number.isFinite(rate) ? round(rate * 100, 4) : null,
      openLots: holdings.length,
      closedTrades: ledger.closedTrades.length,
      closeComparisonCount: closeComparisons.length,
      average1515VsClosePct: closeComparisons.length
        ? round(closeComparisons.reduce((sum, row) => sum + row.closeDifferencePct, 0) / closeComparisons.length, 4)
        : null,
    },
    holdings,
    deposits: [...ledger.deposits].sort((a, b) => b.date.localeCompare(a.date)),
    trades: [...ledger.closedTrades].sort((a, b) => b.sellDate.localeCompare(a.sellDate)),
    signals: [...ledger.signals].sort((a, b) => b.date.localeCompare(a.date)),
  };
}
