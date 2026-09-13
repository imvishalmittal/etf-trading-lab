import crypto from 'node:crypto';

const BASE_URL = 'https://api.groww.in/v1';
const MASTER_URL = 'https://growwapi-assets.groww.in/instruments/instrument.csv';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function addDays(text, days) {
  const date = new Date(`${text}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function chunkDateRange(start, end, maximumSpanDays = 28) {
  const chunks = [];
  for (let cursor = start; cursor <= end;) {
    const candidate = addDays(cursor, maximumSpanDays);
    const chunkEnd = candidate < end ? candidate : end;
    chunks.push({ start: cursor, end: chunkEnd });
    cursor = addDays(chunkEnd, 1);
  }
  return chunks;
}

export function parseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false;
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
  const headers = rows.shift() ?? [];
  return rows.map((values) => Object.fromEntries(headers.map((key, index) => [key, values[index] ?? ''])));
}

function indiaTimestampFromEpoch(value) {
  const milliseconds = Number(value) < 10_000_000_000 ? Number(value) * 1000 : Number(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(milliseconds));
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+05:30`;
}

export function normalizeTimestamp(value) {
  if (typeof value === 'number' || /^\d{10,13}$/.test(String(value))) return indiaTimestampFromEpoch(value);
  const text = String(value).trim().replace(' ', 'T');
  if (/[zZ]$/.test(text) || /[+-]\d\d:\d\d$/.test(text)) return text;
  if (/[+-]\d{4}$/.test(text)) return `${text.slice(0, -2)}:${text.slice(-2)}`;
  return `${text}+05:30`;
}

export function normalizeCandles(raw) {
  return raw.map((row) => ({
    timestamp: normalizeTimestamp(row[0]), open: Number(row[1]), high: Number(row[2]),
    low: Number(row[3]), close: Number(row[4]), volume: Number(row[5] ?? 0),
  }));
}

async function apiGet(token, endpoint, params, { spacingMs = 1200, retries = 7, state } = {}) {
  const wait = Math.max(0, spacingMs - (Date.now() - state.lastRequestAt));
  if (wait) await sleep(wait);
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-API-VERSION': '1.0' } });
    state.lastRequestAt = Date.now();
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.status !== 'FAILURE') return body.payload ?? body;
    if ((response.status === 429 || response.status >= 500) && attempt < retries) {
      await sleep(Math.min(3000 * (2 ** attempt), 60000));
      continue;
    }
    throw new Error(`Groww ${endpoint} failed (${response.status}): ${body?.error?.message || body?.message || JSON.stringify(body)}`);
  }
  throw new Error(`Groww ${endpoint} exhausted retries`);
}

export async function verifyInstrument(expected) {
  const response = await fetch(MASTER_URL);
  if (!response.ok) throw new Error(`Groww instrument master failed (${response.status})`);
  const text = await response.text();
  const rows = parseCsv(text);
  const matches = rows.filter((row) => (row.trading_symbol ?? row.tradingSymbol) === expected.tradingSymbol
    && row.exchange === expected.exchange && row.segment === expected.segment);
  if (matches.length !== 1) throw new Error(`Expected exactly one ${expected.exchange}/${expected.segment}/${expected.tradingSymbol} instrument, found ${matches.length}`);
  const match = matches[0];
  const growwSymbol = match.groww_symbol ?? match.growwSymbol;
  if (growwSymbol !== expected.growwSymbol) throw new Error(`Instrument mapping mismatch: ${growwSymbol} != ${expected.growwSymbol}`);
  return { match, masterSha256: crypto.createHash('sha256').update(text).digest('hex'), masterUrl: MASTER_URL };
}

export async function fetchMinuteCandles({ token, instrument, start, end, spacingMs = 1200 }) {
  if (!token) throw new Error('GROWW_ACCESS_TOKEN is required');
  const chunks = chunkDateRange(start, end);
  const state = { lastRequestAt: 0 };
  const raw = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    process.stderr.write(`Groww ${index + 1}/${chunks.length}: ${chunk.start}..${chunk.end}\n`);
    const payload = await apiGet(token, '/historical/candles', {
      exchange: instrument.exchange, segment: instrument.segment, groww_symbol: instrument.growwSymbol,
      start_time: `${chunk.start} 09:15:00`, end_time: `${chunk.end} 15:29:00`, candle_interval: instrument.interval,
    }, { spacingMs, state });
    raw.push(...(payload.candles ?? []));
  }
  return { candles: normalizeCandles(raw), chunks };
}

export function auditCandles(candles, { start, end, source = 'Groww historical candles' }) {
  const ordered = [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let outOfOrder = 0;
  for (let i = 1; i < candles.length; i += 1) if (candles[i].timestamp < candles[i - 1].timestamp) outOfOrder += 1;
  const byTimestamp = new Map(), duplicates = [], conflictingDuplicates = [];
  for (const row of ordered) {
    const previous = byTimestamp.get(row.timestamp);
    if (previous) {
      duplicates.push(row.timestamp);
      if (JSON.stringify(previous) !== JSON.stringify(row)) conflictingDuplicates.push(row.timestamp);
    } else byTimestamp.set(row.timestamp, row);
  }
  const deduplicated = [...byTimestamp.values()];
  const invalid = deduplicated.filter((b) => ![b.open, b.high, b.low, b.close].every((v) => Number.isFinite(v) && v > 0)
    || b.high < Math.max(b.open, b.low, b.close) || b.low > Math.min(b.open, b.high, b.close));
  const sessions = new Map();
  for (const row of deduplicated) {
    const date = row.timestamp.slice(0, 10);
    if (date < start || date > end) continue;
    if (!sessions.has(date)) sessions.set(date, []);
    sessions.get(date).push(row);
  }
  const missing0915 = [], missing1529 = [], barsPerSession = {};
  let previousClose = null;
  const extremeOpenGaps = [];
  for (const [date, rows] of [...sessions.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    barsPerSession[date] = rows.length;
    const first = rows.find((r) => r.timestamp.slice(11, 16) === '09:15');
    const last = rows.find((r) => r.timestamp.slice(11, 16) === '15:29');
    if (!first) missing0915.push(date);
    if (!last) missing1529.push(date);
    if (first && previousClose) {
      const gap = first.open / previousClose - 1;
      if (Math.abs(gap) >= 0.1) extremeOpenGaps.push({ date, gapFraction: gap, previousClose, open: first.open });
    }
    if (rows.length) previousClose = rows.at(-1).close;
  }
  const rejected = new Set([...missing0915, ...missing1529]);
  for (const row of invalid) rejected.add(row.timestamp.slice(0, 10));
  return {
    candles: deduplicated,
    report: {
      source, interval: '1minute', requested: { start, end },
      firstTimestamp: deduplicated[0]?.timestamp ?? null, lastTimestamp: deduplicated.at(-1)?.timestamp ?? null,
      rawBars: candles.length, uniqueBars: deduplicated.length, observedSessions: sessions.size,
      eligibleSessions: sessions.size - rejected.size, rejectedSessions: rejected.size,
      missing0915, missing1529, duplicateTimestampCount: duplicates.length,
      duplicateTimestamps: duplicates, conflictingDuplicateCount: conflictingDuplicates.length,
      conflictingDuplicates, outOfOrderCount: outOfOrder, invalidOhlcCount: invalid.length,
      invalidOhlc: invalid.slice(0, 100), barsPerSession, extremeOpenGaps,
      criticalIntegrityFailure: conflictingDuplicates.length > 0 || invalid.length > 0,
      notes: [
        'Observed-session coverage is computed from dates present in Groww data; a wholly absent exchange session cannot be inferred from this feed alone.',
        'Extreme gaps are reported at an absolute 10% threshold for corporate-action/manual review; they are not silently adjusted.',
        'Timestamps are normalized to explicit +05:30 and sorted only after out-of-order auditing.'
      ],
    },
  };
}

export function candlesToCsv(candles) {
  return ['timestamp,open,high,low,close,volume', ...candles.map((r) => [r.timestamp, r.open, r.high, r.low, r.close, r.volume].join(','))].join('\n') + '\n';
}
