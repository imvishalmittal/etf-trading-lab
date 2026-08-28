import { dateFromEpochIndia } from './time.mjs';

const BASE_URL = 'https://api.groww.in/v1';
const MASTER_URL = 'https://growwapi-assets.groww.in/instruments/instrument.csv';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' && quoted && text[i + 1] === '"') { field += '"'; i += 1; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { row.push(field); field = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift() || [];
  return rows.map((values) => Object.fromEntries(headers.map((key, i) => [key, values[i] || ''])));
}

export function createGrowwClient(token, fetchImpl = fetch) {
  if (!token) throw new Error('GROWW_ACCESS_TOKEN is required');
  let previousRequest = 0;
  async function get(endpoint, params = {}) {
    const wait = Math.max(0, 1100 - (Date.now() - previousRequest));
    if (wait) await sleep(wait);
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'X-API-VERSION': '1.0' } });
      previousRequest = Date.now();
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.status !== 'FAILURE') return body.payload ?? body;
      if ((response.status === 429 || response.status >= 500) && attempt < 4) { await sleep(3000 * (attempt + 1)); continue; }
      throw new Error(`Groww ${endpoint} failed (${response.status}): ${body?.error?.message || body?.message || 'unknown error'}`);
    }
  }
  async function instruments() {
    const response = await fetchImpl(MASTER_URL);
    if (!response.ok) throw new Error(`Groww instrument master failed (${response.status})`);
    return parseCsv(await response.text());
  }
  const quote = (symbol) => get('/live-data/quote', { exchange: 'NSE', segment: 'CASH', trading_symbol: symbol });
  const dailyHistory = (growwSymbol, start, end) => get('/historical/candles', {
    exchange: 'NSE', segment: 'CASH', groww_symbol: growwSymbol,
    start_time: `${start} 09:15:00`, end_time: `${end} 15:30:00`, candle_interval: '1day',
  });
  return { get, instruments, quote, dailyHistory };
}

export function normalizeQuote(payload) {
  return {
    lastPrice: Number(payload.last_price ?? payload.ltp),
    high: Number(payload.ohlc?.high ?? payload.high),
    previousClose: Number(payload.ohlc?.close ?? payload.previous_close),
    volume: Number(payload.volume ?? payload.total_traded_volume),
    lastTradeTime: payload.last_trade_time ?? payload.timestamp,
  };
}

export function normalizeDailyCandles(payload) {
  return (payload.candles || []).map((c) => ({
    date: dateFromEpochIndia(c[0]),
    close: Number(c[4]),
  })).filter((row) => row.date && row.close > 0).sort((a, b) => a.date.localeCompare(b.date));
}
