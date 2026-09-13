import crypto from 'node:crypto';

import { chunkDateRange, normalizeCandles, parseCsv } from './data.mjs';

const BASE_URL = 'https://api.kite.trade';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function headers(apiKey, accessToken) {
  return {
    Accept: 'application/json',
    Authorization: `token ${apiKey}:${accessToken}`,
    'X-Kite-Version': '3',
  };
}

async function request(apiKey, accessToken, endpoint, { params = {}, responseType = 'json', spacingMs = 400, retries = 7, state } = {}) {
  const wait = Math.max(0, spacingMs - (Date.now() - state.lastRequestAt));
  if (wait) await sleep(wait);
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url, { headers: headers(apiKey, accessToken) });
    state.lastRequestAt = Date.now();
    if (response.ok) return responseType === 'text' ? response.text() : response.json();
    const body = await response.text();
    if ((response.status === 429 || response.status >= 500) && attempt < retries) {
      await sleep(Math.min(2000 * (2 ** attempt), 60000));
      continue;
    }
    throw new Error(`Kite ${endpoint} failed (${response.status}): ${body.slice(0, 500)}`);
  }
  throw new Error(`Kite ${endpoint} exhausted retries`);
}

export async function verifyKiteInstrument({ apiKey, accessToken, expected }) {
  if (!apiKey || !accessToken) throw new Error('KITE_API_KEY and KITE_ACCESS_TOKEN are required');
  const state = { lastRequestAt: 0 };
  const text = await request(apiKey, accessToken, '/instruments/NSE', { responseType: 'text', state });
  const rows = parseCsv(text);
  const matches = rows.filter((row) => row.exchange === expected.exchange
    && row.segment === 'NSE' && row.tradingsymbol === expected.tradingSymbol);
  if (matches.length !== 1) throw new Error(`Expected exactly one Kite NSE/${expected.tradingSymbol} instrument, found ${matches.length}`);
  const match = matches[0];
  const instrumentToken = Number(match.instrument_token);
  if (!Number.isSafeInteger(instrumentToken) || instrumentToken <= 0) throw new Error(`Invalid Kite instrument token: ${match.instrument_token}`);
  return {
    match,
    instrumentToken,
    masterSha256: crypto.createHash('sha256').update(text).digest('hex'),
    masterUrl: `${BASE_URL}/instruments/NSE`,
  };
}

export async function fetchKiteMinuteCandles({ apiKey, accessToken, instrumentToken, start, end, spacingMs = 400 }) {
  if (!apiKey || !accessToken) throw new Error('KITE_API_KEY and KITE_ACCESS_TOKEN are required');
  if (!Number.isSafeInteger(Number(instrumentToken))) throw new Error('A valid Kite instrument token is required');
  // Kite permits 60 calendar days for one-minute requests; 55-day inclusive chunks leave a safety margin.
  const chunks = chunkDateRange(start, end, 54);
  const state = { lastRequestAt: 0 };
  const raw = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    process.stderr.write(`Kite ${index + 1}/${chunks.length}: ${chunk.start}..${chunk.end}\n`);
    const body = await request(apiKey, accessToken, `/instruments/historical/${instrumentToken}/minute`, {
      params: { from: `${chunk.start} 09:15:00`, to: `${chunk.end} 15:29:00`, continuous: 0, oi: 0 },
      spacingMs,
      state,
    });
    if (body.status !== 'success' || !Array.isArray(body.data?.candles)) {
      throw new Error(`Unexpected Kite historical response for ${chunk.start}..${chunk.end}`);
    }
    raw.push(...body.data.candles);
  }
  return { candles: normalizeCandles(raw), chunks };
}

