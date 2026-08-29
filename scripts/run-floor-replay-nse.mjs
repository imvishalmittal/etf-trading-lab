import fs from 'node:fs';
import { xirr } from '../src/xirr.mjs';

const entryText = [1, 2, 3, 4].flatMap((part) => fs.readFileSync(`research/frozen-entries-${part}.csv`, 'utf8').trim().split(/\r?\n/).slice(1));
const entries = entryText.map((line) => {
  const [trade, date, symbol, category, entryPrice] = line.split(',');
  return { trade: Number(trade), date, symbol, category, entryPrice: Number(entryPrice) };
});
if (entries.length !== 235) throw new Error(`Frozen-entry integrity failed: expected 235 entries, parsed ${entries.length}`);
if (entries.some((entry) => !entry.trade || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !entry.symbol || !Number.isFinite(entry.entryPrice))) {
  throw new Error('Frozen-entry integrity failed: one or more entries are malformed');
}
const END = process.env.BACKTEST_END || '2026-08-27';
const round = (v, n = 2) => Number(Number(v || 0).toFixed(n));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function dateRange(start, end) {
  const dates = [];
  for (let d = new Date(`${start}T00:00:00Z`), stop = new Date(`${end}T00:00:00Z`); d <= stop; d.setUTCDate(d.getUTCDate() + 1)) {
    if (![0, 6].includes(d.getUTCDay())) dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function nseUrl(date) {
  const [y, m, d] = date.split('-');
  return `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${d}${m}${y}.csv`;
}

function parseNseCsv(text, wanted) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const headers = lines.shift().split(',').map((h) => h.replaceAll('"', '').trim());
  const at = (name) => headers.indexOf(name);
  const indexes = { symbol: at('SYMBOL'), series: at('SERIES'), open: at('OPEN_PRICE'), high: at('HIGH_PRICE'), low: at('LOW_PRICE'), close: at('CLOSE_PRICE') };
  if (Object.values(indexes).some((i) => i < 0)) throw new Error('Unexpected NSE security bhavdata header');
  const rows = {};
  for (const line of lines) {
    const fields = line.split(',').map((v) => v.replaceAll('"', '').trim());
    const symbol = fields[indexes.symbol];
    if (!wanted.has(symbol) || fields[indexes.series] !== 'EQ') continue;
    rows[symbol] = { open: Number(fields[indexes.open]), high: Number(fields[indexes.high]), low: Number(fields[indexes.low]), close: Number(fields[indexes.close]) };
  }
  return rows;
}

async function fetchSession(date, wanted) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(nseUrl(date), { headers: { 'User-Agent': 'Mozilla/5.0 ETF research', Accept: 'text/csv,*/*' }, signal: AbortSignal.timeout(20000) });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { date, prices: parseNseCsv(await response.text(), wanted) };
    } catch (error) {
      if (attempt === 2) { console.warn(`${date}: ${error.message}`); return null; }
      await sleep(500 * (attempt + 1));
    }
  }
}

async function fetchSessions(start, end, wanted) {
  const dates = dateRange(start, end), sessions = [];
  for (let i = 0; i < dates.length; i += 6) {
    const batch = await Promise.all(dates.slice(i, i + 6).map((date) => fetchSession(date, wanted)));
    sessions.push(...batch.filter(Boolean));
    await sleep(100);
  }
  return sessions.sort((a, b) => a.date.localeCompare(b.date));
}

function replay({ allSessions, allEntries, start, end, ticket = 15000, floorPct = 8 }) {
  const periodEntries = allEntries.filter((e) => e.date >= start && e.date <= end);
  const entryByDate = new Map();
  for (const entry of periodEntries) (entryByDate.get(entry.date) || entryByDate.set(entry.date, []).get(entry.date)).push(entry);
  let cash = 0; const deposits = [], openLots = [], closedTrades = []; let sessions = 0;
  for (const session of allSessions.filter((s) => s.date >= start && s.date <= end)) {
    sessions += 1;
    for (let i = openLots.length - 1; i >= 0; i -= 1) {
      const lot = openLots[i], candle = session.prices[lot.symbol];
      if (!candle) continue;
      lot.lastPrice = candle.close; lot.lastDate = session.date;
      if (lot.floorArmed && session.date > lot.armedDate && candle.low <= lot.floorPrice) {
        const sellPrice = round(candle.open < lot.floorPrice ? candle.open : lot.floorPrice, 4);
        const sellValue = round(lot.quantity * sellPrice); cash = round(cash + sellValue);
        closedTrades.push({ ...lot, sellDate: session.date, sellPrice, sellValue, profit: round(sellValue - lot.purchaseValue), returnPct: round((sellPrice / lot.entryPrice - 1) * 100, 4), peakPrice: lot.peakPrice, peakDate: lot.peakDate, maxAchievedReturnPct: round((lot.peakPrice / lot.entryPrice - 1) * 100, 4), exitReason: candle.open < lot.floorPrice ? 'FLOOR_GAP' : 'FLOOR' });
        openLots.splice(i, 1);
      } else {
        if (candle.high > lot.peakPrice) { lot.peakPrice = candle.high; lot.peakDate = session.date; }
        if (!lot.floorArmed && candle.high >= lot.floorPrice) {
          lot.floorArmed = true; lot.armedDate = session.date;
        }
      }
    }
    for (const entry of entryByDate.get(session.date) || []) {
      const quantity = Math.floor(ticket / entry.entryPrice); if (quantity < 1) continue;
      const purchaseValue = round(quantity * entry.entryPrice);
      const contribution = round(Math.max(0, purchaseValue - cash));
      if (contribution > 0) { cash = round(cash + contribution); deposits.push({ date: session.date, amount: contribution }); }
      cash = round(cash - purchaseValue);
      openLots.push({ ...entry, quantity, purchaseValue, floorPrice: round(entry.entryPrice * (1 + floorPct / 100), 4), floorArmed: false, armedDate: null, peakPrice: entry.entryPrice, peakDate: entry.date, lastPrice: entry.entryPrice, lastDate: entry.date });
    }
  }
  const holdingsValue = round(openLots.reduce((sum, lot) => sum + lot.quantity * lot.lastPrice, 0));
  const accountValue = round(cash + holdingsValue);
  const freshFunding = round(deposits.reduce((sum, d) => sum + d.amount, 0));
  const flows = deposits.map((d) => ({ date: d.date, amount: -d.amount })); flows.push({ date: end, amount: accountValue });
  const rate = xirr(flows);
  return { start, end, marketSessions: sessions, ticket, purchases: periodEntries.length, freshFunding, reusedSaleCash: round(periodEntries.reduce((sum, e) => sum + Math.floor(ticket / e.entryPrice) * e.entryPrice, 0) - freshFunding), cash, holdingsValue, accountValue, profit: round(accountValue - freshFunding), totalReturnPct: freshFunding ? round((accountValue / freshFunding - 1) * 100, 4) : null, xirrPct: Number.isFinite(rate) ? round(rate * 100, 4) : null, floorExits: closedTrades.length, gapExits: closedTrades.filter((t) => t.exitReason === 'FLOOR_GAP').length, armedOpenLots: openLots.filter((l) => l.floorArmed).length, unarmedOpenLots: openLots.filter((l) => !l.floorArmed).length, deposits, closedTrades, openLots };
}

const fullStart = '2024-08-28', recentStart = '2026-05-27';
const relevant = entries.filter((e) => e.date >= fullStart && e.date <= END);
if (relevant.length < 100) throw new Error(`Frozen-entry period integrity failed: expected at least 100 entries, found ${relevant.length}`);
const wanted = new Set(relevant.map((e) => e.symbol));
const sessions = await fetchSessions(fullStart, END, wanted);
if (sessions.length < 450) throw new Error(`NSE daily-data completeness failed: only ${sessions.length} sessions`);
const missingEntryDates = relevant.filter((e) => !sessions.find((s) => s.date === e.date && s.prices[e.symbol]));
if (missingEntryDates.length) throw new Error(`Missing NSE entry sessions: ${missingEntryDates.slice(0, 10).map((e) => `${e.date}:${e.symbol}`).join(', ')}`);
const floorPcts = [8, 10, 12, 15, 20];
const variants = Object.fromEntries(floorPcts.map((floorPct) => [String(floorPct), {
  floorPct,
  full24Months: replay({ allSessions: sessions, allEntries: entries, start: fullStart, end: END, floorPct }),
  recent3Months: replay({ allSessions: sessions, allEntries: entries, start: recentStart, end: END, floorPct }),
}]));
const report = { strategy: 'ETF-FIXED-FLOOR-COMPARISON', source: 'Official NSE security bhavdata daily OHLC', frozenEntryArtifact: 'ETF_Dip_Recovery_Trade_Ledger_3Y.xlsx', rule: 'Arm each fixed floor on first later-session touch; exit on a subsequent session at that floor or opening gap', floorPcts, generatedAt: new Date().toISOString(), variants };
for (const variant of Object.values(report.variants)) {
  for (const period of [variant.full24Months, variant.recent3Months]) {
    if (period.closedTrades.some((trade) => trade.maxAchievedReturnPct < variant.floorPct)) throw new Error(`Peak-return integrity failed for ${variant.floorPct}% floor`);
  }
}
fs.mkdirSync('research', { recursive: true }); fs.writeFileSync('research/etf-floor-comparison-2y.json', `${JSON.stringify(report, null, 2)}\n`);
const summary = (r) => ({ period: `${r.start} to ${r.end}`, purchases: r.purchases, freshFunding: r.freshFunding, floorExits: r.floorExits, gapExits: r.gapExits, armedOpenLots: r.armedOpenLots, unarmedOpenLots: r.unarmedOpenLots, openLots: r.openLots.length, accountValue: r.accountValue, profit: r.profit, totalReturnPct: r.totalReturnPct, xirrPct: r.xirrPct });
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.variants).map(([floorPct, variant]) => [floorPct, { full24Months: summary(variant.full24Months), recent3Months: summary(variant.recent3Months) }])), null, 2));
