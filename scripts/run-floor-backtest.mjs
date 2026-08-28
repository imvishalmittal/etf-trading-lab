import fs from 'node:fs';
import { classifyEtf, isEtfInstrument } from '../src/categories.mjs';
import { runFloorBacktest } from '../src/floor-backtest.mjs';
import { createGrowwClient, normalizeDailyCandles } from '../src/groww.mjs';
import { previousCloseMetrics } from '../src/selection.mjs';
import { indiaParts } from '../src/time.mjs';

const config = JSON.parse(fs.readFileSync('config/strategy.json', 'utf8'));
const end = process.env.BACKTEST_END || indiaParts().date;
const testStartDate = new Date(`${end}T00:00:00Z`); testStartDate.setUTCMonth(testStartDate.getUTCMonth() - 3);
const testStart = testStartDate.toISOString().slice(0, 10);
const warmupDate = new Date(`${testStart}T00:00:00Z`); warmupDate.setUTCDate(warmupDate.getUTCDate() - 75);
const warmupStart = warmupDate.toISOString().slice(0, 10);
const client = createGrowwClient(process.env.GROWW_ACCESS_TOKEN);
const instruments = (await client.instruments()).filter(isEtfInstrument).map((row) => ({ symbol: row.trading_symbol, growwSymbol: row.groww_symbol, name: row.name, category: classifyEtf({ symbol: row.trading_symbol, name: row.name }) }));
const bySymbol = {}; let completed = 0;
for (const instrument of instruments) {
  try {
    bySymbol[instrument.symbol] = normalizeDailyCandles(await client.dailyHistory(instrument.growwSymbol, warmupStart, end));
    completed += 1;
  } catch (error) { console.warn(`${instrument.symbol}: ${error.message}`); }
}
if (completed < 10) throw new Error(`Only ${completed} ETFs supplied historical data`);
const dates = [...new Set(Object.values(bySymbol).flat().map((row) => row.date).filter((date) => date >= testStart && date <= end))].sort();
const sessions = dates.map((date, dateIndex) => {
  const candidates = [], candles = {};
  for (const instrument of instruments) {
    const rows = bySymbol[instrument.symbol] || []; const current = rows.find((row) => row.date === date);
    if (!current) continue; candles[instrument.symbol] = current;
    const prior = rows.filter((row) => row.date < date);
    const metrics = previousCloseMetrics(prior, current.close);
    if (!metrics || metrics.dayReturnPct > config.entry.maximumDayReturnPct || metrics.thirtySessionReturnPct > config.entry.maximumPreviousCloseThirtySessionReturnPct) continue;
    candidates.push({ ...instrument, currentPrice: current.close, volume: current.volume, ...metrics });
  }
  return { date, previousDate: dates[dateIndex - 1] || null, candidates, candles };
});
const result = runFloorBacktest({ sessions, dailyFunding: 15000, floorPct: 8, minimumVolume: config.entry.minimumVolume });
const report = { strategy: 'ETF-8-FLOOR', period: { start: dates[0], end: dates.at(-1), marketSessions: dates.length }, priceModel: 'daily OHLC; entry at session close; +8% floor activates from next session', generatedAt: new Date().toISOString(), ...result };
fs.mkdirSync('research', { recursive: true });
fs.writeFileSync('research/etf-8-floor-3m.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ period: report.period, deposits: result.totalDeposits, purchases: result.purchases, closedTrades: result.closedTrades.length, openLots: result.openLots.length, accountValue: result.accountValue, profit: result.profit, xirrPct: result.xirrPct }, null, 2));
