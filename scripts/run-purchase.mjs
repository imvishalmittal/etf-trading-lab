import fs from 'node:fs';
import { classifyEtf, isEtfInstrument } from '../src/categories.mjs';
import { createGrowwClient, normalizeDailyCandles, normalizeQuote } from '../src/groww.mjs';
import { addDeposit, buySleeves, recordNoSignal, touchLedger } from '../src/ledger.mjs';
import { buildPreCandidates, selectCandidate } from '../src/selection.mjs';
import { dateFromEpochIndia, indiaParts } from '../src/time.mjs';

const config = JSON.parse(fs.readFileSync('config/strategy.json', 'utf8'));
const ledger = JSON.parse(fs.readFileSync('data/ledger.json', 'utf8'));
const today = indiaParts().date;
if (ledger.sessions.some((row) => row.date === today && row.type === 'PURCHASE')) process.exit(0);
const client = createGrowwClient(process.env.GROWW_ACCESS_TOKEN);
const raw = await client.instruments();
const instruments = raw.filter(isEtfInstrument).map((row) => ({
  symbol: row.trading_symbol, growwSymbol: row.groww_symbol, name: row.name, category: classifyEtf({ symbol: row.trading_symbol, name: row.name }),
}));
const prices = {}; let liveCount = 0; let currentSessionQuotes = 0;
const start = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
for (const instrument of instruments) {
  try {
    const quote = normalizeQuote(await client.quote(instrument.symbol));
    if (!Number.isFinite(quote.lastPrice) || quote.lastPrice <= 0) continue;
    prices[instrument.symbol] = quote; liveCount += 1;
    if (dateFromEpochIndia(quote.lastTradeTime) === today) currentSessionQuotes += 1;
    if ((ledger.priceHistory[instrument.symbol] || []).length < 31) {
      ledger.priceHistory[instrument.symbol] = normalizeDailyCandles(await client.dailyHistory(instrument.growwSymbol, start, today)).slice(-40);
    }
  } catch (error) { console.warn(`${instrument.symbol}: ${error.message}`); }
}
if (liveCount < 10 || currentSessionQuotes < 10) {
  console.log(`No verified NSE session for ${today}; deposit and selection skipped.`);
  process.exit(0);
}
addDeposit(ledger, today, config.dailyDeposit);
const pre = buildPreCandidates({ instruments, prices, historyBySymbol: ledger.priceHistory, rules: config.entry });
for (const candidate of pre) candidate.volume = prices[candidate.symbol].volume;
const previous = [...ledger.sessions].filter((r) => r.type === 'PURCHASE' && r.marketOpen).sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
const result = selectCandidate({ candidates: pre, previousMarketSession: previous, priorSignals: ledger.signals, minimumVolume: config.entry.minimumVolume });
if (result.selected) buySleeves(ledger, { date: today, candidate: result.selected, strategies: config.strategies, budget: config.purchaseBudget });
else recordNoSignal(ledger, today, { preliminaryCandidates: pre.length });
for (const instrument of instruments) {
  const price = prices[instrument.symbol]?.lastPrice;
  if (!price) continue;
  const rows = (ledger.priceHistory[instrument.symbol] ||= []).filter((r) => r.date !== today);
  rows.push({ date: today, close: price }); ledger.priceHistory[instrument.symbol] = rows.slice(-40);
}
ledger.sessions.push({ date: today, type: 'PURCHASE', marketOpen: true, liveEtfs: liveCount });
touchLedger(ledger); fs.writeFileSync('data/ledger.json', `${JSON.stringify(ledger, null, 2)}\n`);
