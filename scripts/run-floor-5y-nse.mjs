import fs from 'node:fs';
import { classifyEtf } from '../src/categories.mjs';
import { trailingFloorPrice } from '../src/floor-backtest.mjs';
import { xirr } from '../src/xirr.mjs';

const START = '2021-08-28';
const HISTORY_START = '2021-06-01';
const END = process.env.BACKTEST_END || '2026-08-27';
const FLOOR_PCTS = [8, 10, 12, 15, 20];
const TRAILING_GAPS = [3, 5];
const TICKET = 15000;
const round = (v, n = 2) => Number(Number(v || 0).toFixed(n));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseSimpleCsv(path) {
  return fs.readFileSync(path, 'utf8').trim().split(/\r?\n/).slice(1).map((line) => {
    const split = line.indexOf(',');
    return { symbol: line.slice(0, split).trim(), name: line.slice(split + 1).trim() };
  });
}

async function fetchCurrentEtfs() {
  try {
    const headers = { 'User-Agent': 'Mozilla/5.0 ETF research', Accept: 'application/json,text/plain,*/*', Referer: 'https://www.nseindia.com/market-data/exchange-traded-funds-etf' };
    await fetch('https://www.nseindia.com/market-data/exchange-traded-funds-etf', { headers, signal: AbortSignal.timeout(20000) });
    const response = await fetch('https://www.nseindia.com/api/etf', { headers, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return (json.data || []).map((row) => ({
      symbol: String(row.symbol || row.meta?.symbol || '').trim(),
      name: String(row.assets || row.underlying || row.meta?.companyName || row.symbol || '').trim(),
    })).filter((row) => row.symbol);
  } catch (error) {
    console.warn(`Current NSE ETF universe unavailable: ${error.message}`);
    return [];
  }
}

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
  const indexes = { symbol: at('SYMBOL'), series: at('SERIES'), open: at('OPEN_PRICE'), high: at('HIGH_PRICE'), low: at('LOW_PRICE'), close: at('CLOSE_PRICE'), volume: at('TTL_TRD_QNTY') };
  if (Object.values(indexes).some((i) => i < 0)) throw new Error('Unexpected NSE security bhavdata header');
  const rows = {};
  for (const line of lines) {
    const fields = line.split(',').map((v) => v.replaceAll('"', '').trim());
    const symbol = fields[indexes.symbol];
    if (!wanted.has(symbol) || fields[indexes.series] !== 'EQ') continue;
    rows[symbol] = { open: Number(fields[indexes.open]), high: Number(fields[indexes.high]), low: Number(fields[indexes.low]), close: Number(fields[indexes.close]), volume: Number(fields[indexes.volume]) };
  }
  return rows;
}

async function fetchSession(date, wanted) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(nseUrl(date), { headers: { 'User-Agent': 'Mozilla/5.0 ETF research', Accept: 'text/csv,*/*' }, signal: AbortSignal.timeout(25000) });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { date, prices: parseNseCsv(await response.text(), wanted) };
    } catch (error) {
      if (attempt === 2) { console.warn(`${date}: ${error.message}`); return null; }
      await sleep(600 * (attempt + 1));
    }
  }
}

async function fetchSessions(start, end, wanted) {
  const dates = dateRange(start, end), sessions = [];
  for (let i = 0; i < dates.length; i += 8) {
    const batch = await Promise.all(dates.slice(i, i + 8).map((date) => fetchSession(date, wanted)));
    sessions.push(...batch.filter(Boolean));
    await sleep(120);
  }
  return sessions.sort((a, b) => a.date.localeCompare(b.date));
}

function findDiscontinuities(sessions, symbols) {
  const previous = new Map(), excluded = new Map();
  for (const session of sessions) {
    for (const symbol of symbols) {
      const close = session.prices[symbol]?.close, prior = previous.get(symbol);
      if (close > 0 && prior > 0) {
        const ratio = close / prior;
        if (ratio < 0.55 || ratio > 1.8) excluded.set(symbol, { symbol, date: session.date, priorClose: prior, close, ratio: round(ratio, 4) });
      }
      if (close > 0) previous.set(symbol, close);
    }
  }
  return excluded;
}

function generateEntries(sessions, universe, excludedSymbols) {
  const history = new Map(), entries = [], diagnostics = { candidateSessions: 0, categoryExclusions: 0 };
  let previousSessionPurchase = null;
  for (const session of sessions) {
    const candidates = [];
    for (const instrument of universe) {
      if (excludedSymbols.has(instrument.symbol)) continue;
      const candle = session.prices[instrument.symbol];
      const rows = history.get(instrument.symbol) || [];
      if (session.date >= START && candle?.close > 0 && candle.volume > 500000 && rows.length >= 31) {
        const previousClose = rows.at(-1).close;
        const closeThirtySessionsEarlier = rows.at(-31).close;
        const dayReturnPct = (candle.close / previousClose - 1) * 100;
        const thirtySessionReturnPct = (previousClose / closeThirtySessionsEarlier - 1) * 100;
        if (dayReturnPct <= -1 && thirtySessionReturnPct <= -2.5) candidates.push({ ...instrument, entryPrice: candle.close, volume: candle.volume, dayReturnPct, thirtySessionReturnPct });
      }
    }
    candidates.sort((a, b) => a.thirtySessionReturnPct - b.thirtySessionReturnPct || a.dayReturnPct - b.dayReturnPct || b.volume - a.volume || a.symbol.localeCompare(b.symbol));
    if (candidates.length) diagnostics.candidateSessions += 1;
    const selected = candidates.find((candidate) => {
      if (previousSessionPurchase && candidate.category === previousSessionPurchase.category) { diagnostics.categoryExclusions += 1; return false; }
      return true;
    });
    if (selected) entries.push({ trade: entries.length + 1, date: session.date, symbol: selected.symbol, name: selected.name, category: selected.category, entryPrice: round(selected.entryPrice, 4), volume: selected.volume, dayReturnPct: round(selected.dayReturnPct, 4), thirtySessionReturnPct: round(selected.thirtySessionReturnPct, 4) });
    previousSessionPurchase = selected || null;
    for (const instrument of universe) {
      const candle = session.prices[instrument.symbol];
      if (!candle?.close) continue;
      const rows = history.get(instrument.symbol) || [];
      rows.push({ date: session.date, close: candle.close });
      if (rows.length > 31) rows.shift();
      history.set(instrument.symbol, rows);
    }
  }
  return { entries, diagnostics };
}

function replay({ sessions, entries, start, end, floorPct, trailingGapPct = null }) {
  const periodEntries = entries.filter((entry) => entry.date >= start && entry.date <= end);
  const entryByDate = new Map();
  for (const entry of periodEntries) (entryByDate.get(entry.date) || entryByDate.set(entry.date, []).get(entry.date)).push(entry);
  let cash = 0; const deposits = [], openLots = [], closedTrades = [];
  for (const session of sessions.filter((row) => row.date >= start && row.date <= end)) {
    for (let i = openLots.length - 1; i >= 0; i -= 1) {
      const lot = openLots[i], candle = session.prices[lot.symbol];
      if (!candle) continue;
      lot.lastPrice = candle.close; lot.lastDate = session.date;
      if (lot.floorArmed && session.date > lot.armedDate && candle.low <= lot.floorPrice) {
        const sellPrice = round(candle.open < lot.floorPrice ? candle.open : lot.floorPrice, 4);
        const sellValue = round(lot.quantity * sellPrice); cash = round(cash + sellValue);
        closedTrades.push({ ...lot, sellDate: session.date, sellPrice, sellValue, profit: round(sellValue - lot.purchaseValue), returnPct: round((sellPrice / lot.entryPrice - 1) * 100, 4), maxAchievedReturnPct: round((lot.peakPrice / lot.entryPrice - 1) * 100, 4), exitReason: candle.open < lot.floorPrice ? 'FLOOR_GAP' : 'FLOOR' });
        openLots.splice(i, 1);
      } else {
        if (candle.high > lot.peakPrice) { lot.peakPrice = candle.high; lot.peakDate = session.date; }
        if (!lot.floorArmed && candle.high >= lot.floorPrice) { lot.floorArmed = true; lot.armedDate = session.date; }
        if (lot.floorArmed && trailingGapPct !== null) {
          lot.floorPrice = trailingFloorPrice({ entryPrice: lot.entryPrice, peakPrice: lot.peakPrice, minimumFloorPct: floorPct, trailingGapPct });
          lot.protectedReturnPct = round((lot.floorPrice / lot.entryPrice - 1) * 100, 4);
        }
      }
    }
    for (const entry of entryByDate.get(session.date) || []) {
      const quantity = Math.floor(TICKET / entry.entryPrice); if (quantity < 1) continue;
      const purchaseValue = round(quantity * entry.entryPrice);
      const contribution = round(Math.max(0, purchaseValue - cash));
      if (contribution > 0) { cash = round(cash + contribution); deposits.push({ date: session.date, amount: contribution }); }
      cash = round(cash - purchaseValue);
      openLots.push({ ...entry, quantity, purchaseValue, floorPct, trailingGapPct, floorPrice: round(entry.entryPrice * (1 + floorPct / 100), 4), protectedReturnPct: floorPct, floorArmed: false, armedDate: null, peakPrice: entry.entryPrice, peakDate: entry.date, lastPrice: entry.entryPrice, lastDate: entry.date });
    }
  }
  const holdingsValue = round(openLots.reduce((sum, lot) => sum + lot.quantity * lot.lastPrice, 0));
  const accountValue = round(cash + holdingsValue);
  const freshFunding = round(deposits.reduce((sum, deposit) => sum + deposit.amount, 0));
  const flows = deposits.map((deposit) => ({ date: deposit.date, amount: -deposit.amount })); if (freshFunding) flows.push({ date: end, amount: accountValue });
  const rate = freshFunding ? xirr(flows) : null;
  return { start, end, ticket: TICKET, purchases: periodEntries.length, freshFunding, cash, holdingsValue, accountValue, profit: round(accountValue - freshFunding), realizedProfit: round(closedTrades.reduce((sum, trade) => sum + trade.profit, 0)), totalReturnPct: freshFunding ? round((accountValue / freshFunding - 1) * 100, 4) : null, xirrPct: Number.isFinite(rate) ? round(rate * 100, 4) : null, floorExits: closedTrades.length, gapExits: closedTrades.filter((trade) => trade.exitReason === 'FLOOR_GAP').length, armedOpenLots: openLots.filter((lot) => lot.floorArmed).length, unarmedOpenLots: openLots.filter((lot) => !lot.floorArmed).length, deposits, closedTrades, openLots };
}

const daysBetween = (from, to) => Math.floor((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000);
function addMonths(date, months) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 10);
}

function replayConstrained({ sessions, entries, start, end, floorPct = 8, fundingMonths = 3, delayedTrailStartPct = null, trailingGapPct = null, maxUnarmedDays = null, commodityCapPct = null, roundTripCostPct = 0 }) {
  const fundingEnd = addMonths(start, fundingMonths);
  const sideCostRate = roundTripCostPct / 200;
  const periodEntries = entries.filter((entry) => entry.date >= start && entry.date <= end);
  const entryByDate = new Map(periodEntries.map((entry) => [entry.date, entry]));
  let cash = 0, totalCosts = 0, priorEquity = 0, returnIndex = 1, peakReturnIndex = 1, maxDrawdownPct = 0;
  let maxOpenLots = 0, peakDeployedCost = 0, peakHoldingsValue = 0;
  const deposits = [], openLots = [], closedTrades = [], skippedSignals = [];
  const sellLot = (lot, session, sellPrice, exitReason) => {
    const grossSellValue = round(lot.quantity * sellPrice);
    const sellCost = round(grossSellValue * sideCostRate);
    const netSellValue = round(grossSellValue - sellCost);
    totalCosts = round(totalCosts + sellCost); cash = round(cash + netSellValue);
    closedTrades.push({ ...lot, sellDate: session.date, sellPrice, grossSellValue, sellCost, sellValue: netSellValue, profit: round(netSellValue - lot.purchaseValue - lot.buyCost), returnPct: round((netSellValue / (lot.purchaseValue + lot.buyCost) - 1) * 100, 4), maxAchievedReturnPct: round((lot.peakPrice / lot.entryPrice - 1) * 100, 4), exitReason });
  };
  for (const session of sessions.filter((row) => row.date >= start && row.date <= end)) {
    let contributionToday = 0;
    if (session.date <= fundingEnd) {
      contributionToday = TICKET;
      cash = round(cash + contributionToday);
      deposits.push({ date: session.date, amount: contributionToday });
    }
    for (let i = openLots.length - 1; i >= 0; i -= 1) {
      const lot = openLots[i], candle = session.prices[lot.symbol];
      if (!candle) continue;
      lot.lastPrice = candle.close; lot.lastDate = session.date;
      if (lot.floorArmed && session.date > lot.armedDate && candle.low <= lot.floorPrice) {
        const sellPrice = round(candle.open < lot.floorPrice ? candle.open : lot.floorPrice, 4);
        sellLot(lot, session, sellPrice, candle.open < lot.floorPrice ? 'FLOOR_GAP' : 'FLOOR'); openLots.splice(i, 1); continue;
      }
      if (candle.high > lot.peakPrice) { lot.peakPrice = candle.high; lot.peakDate = session.date; }
      if (!lot.floorArmed && candle.high >= lot.activationPrice) { lot.floorArmed = true; lot.armedDate = session.date; }
      const peakReturnPct = (lot.peakPrice / lot.entryPrice - 1) * 100;
      if (lot.floorArmed && delayedTrailStartPct !== null && peakReturnPct >= delayedTrailStartPct) {
        lot.floorPrice = Math.max(lot.floorPrice, trailingFloorPrice({ entryPrice: lot.entryPrice, peakPrice: lot.peakPrice, minimumFloorPct: floorPct, trailingGapPct }));
      }
      if (!lot.floorArmed && maxUnarmedDays !== null && daysBetween(lot.date, session.date) >= maxUnarmedDays) {
        sellLot(lot, session, candle.close, 'UNARMED_TIME_RELEASE'); openLots.splice(i, 1);
      }
    }
    const entry = entryByDate.get(session.date);
    if (entry) {
      const quantity = Math.floor(TICKET / (entry.entryPrice * (1 + sideCostRate)));
      const purchaseValue = round(quantity * entry.entryPrice), buyCost = round(purchaseValue * sideCostRate), cashRequired = round(purchaseValue + buyCost);
      const commodity = ['GOLD', 'SILVER'].includes(entry.category);
      const currentCost = openLots.reduce((sum, lot) => sum + lot.purchaseValue, 0);
      const currentCommodityCost = openLots.filter((lot) => ['GOLD', 'SILVER'].includes(lot.category)).reduce((sum, lot) => sum + lot.purchaseValue, 0);
      const projectedCommodityPct = commodity ? ((currentCommodityCost + purchaseValue) / (currentCost + purchaseValue)) * 100 : currentCost ? (currentCommodityCost / (currentCost + purchaseValue)) * 100 : 0;
      if (commodityCapPct !== null && projectedCommodityPct > commodityCapPct) skippedSignals.push({ date: session.date, symbol: entry.symbol, reason: 'COMMODITY_CAP' });
      else {
        const shortfall = round(Math.max(0, cashRequired - cash));
        if (shortfall > 0) skippedSignals.push({ date: session.date, symbol: entry.symbol, reason: session.date > fundingEnd ? 'NO_CASH_AFTER_FUNDING_WINDOW' : 'INSUFFICIENT_ACCUMULATED_CASH', shortfall });
        else if (quantity < 1) skippedSignals.push({ date: session.date, symbol: entry.symbol, reason: 'TICKET_BELOW_UNIT_PRICE' });
        else {
          cash = round(cash - cashRequired); totalCosts = round(totalCosts + buyCost);
          openLots.push({ ...entry, quantity, purchaseValue, buyCost, floorPct, activationPrice: round(entry.entryPrice * (1 + floorPct / 100), 4), floorPrice: round(entry.entryPrice * (1 + floorPct / 100), 4), floorArmed: false, armedDate: null, peakPrice: entry.entryPrice, peakDate: entry.date, lastPrice: entry.entryPrice, lastDate: entry.date });
        }
      }
    }
    const holdingsValue = openLots.reduce((sum, lot) => sum + lot.quantity * lot.lastPrice, 0), equity = cash + holdingsValue;
    maxOpenLots = Math.max(maxOpenLots, openLots.length);
    peakDeployedCost = Math.max(peakDeployedCost, openLots.reduce((sum, lot) => sum + lot.purchaseValue + lot.buyCost, 0));
    peakHoldingsValue = Math.max(peakHoldingsValue, holdingsValue);
    if (priorEquity > 0) returnIndex *= Math.max(0, equity - contributionToday) / priorEquity;
    peakReturnIndex = Math.max(peakReturnIndex, returnIndex);
    maxDrawdownPct = Math.min(maxDrawdownPct, (returnIndex / peakReturnIndex - 1) * 100);
    priorEquity = equity;
  }
  const holdingsValue = round(openLots.reduce((sum, lot) => sum + lot.quantity * lot.lastPrice * (1 - sideCostRate), 0));
  const accountValue = round(cash + holdingsValue), freshFunding = round(deposits.reduce((sum, row) => sum + row.amount, 0));
  const flows = deposits.map((row) => ({ date: row.date, amount: -row.amount })); if (freshFunding) flows.push({ date: end, amount: accountValue });
  const rate = freshFunding ? xirr(flows) : null;
  const skippedByReason = Object.fromEntries([...new Set(skippedSignals.map((row) => row.reason))].map((reason) => [reason, skippedSignals.filter((row) => row.reason === reason).length]));
  return { floorPct, fundingMonths, fundingEnd, delayedTrailStartPct, trailingGapPct, maxUnarmedDays, commodityCapPct, roundTripCostPct, signals: periodEntries.length, purchases: closedTrades.length + openLots.length, skippedSignals: skippedSignals.length, skippedByReason, freshFunding, accountValue, profit: round(accountValue - freshFunding), realizedProfit: round(closedTrades.reduce((sum, row) => sum + row.profit, 0)), totalReturnPct: freshFunding ? round((accountValue / freshFunding - 1) * 100, 4) : null, xirrPct: Number.isFinite(rate) ? round(rate * 100, 4) : null, totalCosts, maxDrawdownPct: round(maxDrawdownPct, 4), maxOpenLots, peakDeployedCost: round(peakDeployedCost), peakHoldingsValue: round(peakHoldingsValue), exits: closedTrades.length, gapExits: closedTrades.filter((row) => row.exitReason === 'FLOOR_GAP').length, timeReleaseExits: closedTrades.filter((row) => row.exitReason === 'UNARMED_TIME_RELEASE').length, armedOpenLots: openLots.filter((row) => row.floorArmed).length, unarmedOpenLots: openLots.filter((row) => !row.floorArmed).length };
}

const seed = parseSimpleCsv('research/etf-universe-2021.csv');
const current = await fetchCurrentEtfs();
const frozen = [1, 2, 3, 4].flatMap((part) => fs.readFileSync(`research/frozen-entries-${part}.csv`, 'utf8').trim().split(/\r?\n/).slice(1)).map((line) => {
  const [, , symbol, category] = line.split(',');
  return { symbol, name: symbol, frozenCategory: category };
});
const universeBySymbol = new Map();
for (const row of [...seed, ...current, ...frozen]) {
  const existing = universeBySymbol.get(row.symbol);
  universeBySymbol.set(row.symbol, { symbol: row.symbol, name: existing?.name && existing.name !== existing.symbol ? existing.name : row.name, category: row.frozenCategory || existing?.category || classifyEtf(row) });
}
const universe = [...universeBySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
const wanted = new Set(universe.map((row) => row.symbol));
const sessions = await fetchSessions(HISTORY_START, END, wanted);
if (sessions.length < 1200) throw new Error(`Five-year NSE data completeness failed: only ${sessions.length} sessions`);
const discontinuities = findDiscontinuities(sessions, wanted);
const generated = generateEntries(sessions, universe, discontinuities);
if (generated.entries.length < 100) throw new Error(`Five-year signal integrity failed: only ${generated.entries.length} purchases`);
const variants = Object.fromEntries(FLOOR_PCTS.map((floorPct) => [String(floorPct), replay({ sessions, entries: generated.entries, start: START, end: END, floorPct })]));
const trailingVariants = Object.fromEntries(TRAILING_GAPS.map((trailingGapPct) => [`8_floor_${trailingGapPct}pt_trail`, replay({ sessions, entries: generated.entries, start: START, end: END, floorPct: 8, trailingGapPct })]));
const constrained = {
  fixed8: replayConstrained({ sessions, entries: generated.entries, start: START, end: END }),
  delayedTrail15Gap5: replayConstrained({ sessions, entries: generated.entries, start: START, end: END, delayedTrailStartPct: 15, trailingGapPct: 5 }),
  delayedTrail20Gap5: replayConstrained({ sessions, entries: generated.entries, start: START, end: END, delayedTrailStartPct: 20, trailingGapPct: 5 }),
};
const releaseRules = Object.fromEntries([[9, 274], [12, 365], [18, 548]].map(([months, days]) => [`${months}m`, replayConstrained({ sessions, entries: generated.entries, start: START, end: END, maxUnarmedDays: days })]));
const commodityCap = replayConstrained({ sessions, entries: generated.entries, start: START, end: END, commodityCapPct: 25 });
const costSensitivity = Object.fromEntries([0.25, 0.5].flatMap((roundTripCostPct) => [
  [`fixed8_cost_${roundTripCostPct}`, replayConstrained({ sessions, entries: generated.entries, start: START, end: END, roundTripCostPct })],
  [`delayed15_cost_${roundTripCostPct}`, replayConstrained({ sessions, entries: generated.entries, start: START, end: END, delayedTrailStartPct: 15, trailingGapPct: 5, roundTripCostPct })],
  [`delayed20_cost_${roundTripCostPct}`, replayConstrained({ sessions, entries: generated.entries, start: START, end: END, delayedTrailStartPct: 20, trailingGapPct: 5, roundTripCostPct })],
]));
const exclusionUniverses = {
  exGold: universe.filter((row) => row.category !== 'GOLD'),
  exSilver: universe.filter((row) => row.category !== 'SILVER'),
  exGoldSilver: universe.filter((row) => !['GOLD', 'SILVER'].includes(row.category)),
};
const exclusionSensitivity = Object.fromEntries(Object.entries(exclusionUniverses).map(([name, reducedUniverse]) => {
  const reduced = generateEntries(sessions, reducedUniverse, discontinuities);
  return [name, { entries: reduced.entries.length, diagnostics: reduced.diagnostics, result: replayConstrained({ sessions, entries: reduced.entries, start: START, end: END }) }];
}));
for (const [floorPct, result] of Object.entries(variants)) {
  if (result.closedTrades.some((trade) => trade.maxAchievedReturnPct < Number(floorPct))) throw new Error(`Peak-return integrity failed for ${floorPct}% floor`);
}
for (const [name, result] of Object.entries(trailingVariants)) {
  if (result.closedTrades.some((trade) => trade.maxAchievedReturnPct < 8 || trade.protectedReturnPct < 8)) throw new Error(`Trailing-floor integrity failed for ${name}`);
}
const report = {
  strategy: 'ETF-FIXED-FLOOR-5Y',
  period: { start: START, end: END },
  source: 'Official NSE security bhavdata daily OHLC and volume',
  executionApproximation: 'Daily close approximates the after-3-PM purchase price',
  universe: { march2021SeedCount: seed.length, currentNseCount: current.length, unionCount: universe.length, coverage: current.length ? 'March-2021 seed plus current NSE ETF list plus frozen historical symbols' : 'DEGRADED: March-2021 seed plus frozen historical symbols; current NSE API unavailable', excludedDiscontinuities: [...discontinuities.values()] },
  entryRules: { maximumDayReturnPct: -1, maximumPreviousCloseThirtySessionReturnPct: -2.5, minimumVolume: 500000, maximumPurchasesPerSession: 1, ranking: ['most_negative_30_session_return', 'most_negative_day_return', 'highest_volume'], excludeSameCategoryOnImmediatelyPreviousMarketSession: true },
  generatedEntries: generated.entries,
  diagnostics: generated.diagnostics,
  floorPcts: FLOOR_PCTS,
  trailingRules: { minimumFloorPct: 8, gapPcts: TRAILING_GAPS, updateTiming: 'The floor carried into a session is tested first; a surviving session high can raise the floor only for a later session.' },
  variants,
  trailingVariants,
  robustness: {
    note: '₹15,000 is deposited on every market session during the first three calendar months, whether or not there is a signal; later purchases use recycled cash only.',
    constrained,
    releaseRules,
    commodityCap,
    costSensitivity,
    exclusionSensitivity,
  },
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync('research/etf-floor-comparison-5y.json', `${JSON.stringify(report, null, 2)}\n`);
const summary = (result) => Object.fromEntries(['purchases', 'freshFunding', 'accountValue', 'profit', 'realizedProfit', 'totalReturnPct', 'xirrPct', 'floorExits', 'gapExits', 'armedOpenLots', 'unarmedOpenLots'].map((key) => [key, result[key]]));
console.log(JSON.stringify({ period: report.period, sessions: sessions.length, universe: report.universe, entries: generated.entries.length, diagnostics: generated.diagnostics, variants: Object.fromEntries(Object.entries(variants).map(([floorPct, result]) => [floorPct, summary(result)])), trailingVariants: Object.fromEntries(Object.entries(trailingVariants).map(([name, result]) => [name, summary(result)])), robustness: report.robustness }, null, 2));
