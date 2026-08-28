import fs from 'node:fs';
import { createGrowwClient, normalizeQuote } from '../src/groww.mjs';
import { sellTargets, touchLedger } from '../src/ledger.mjs';
import { indiaParts } from '../src/time.mjs';

const ledger = JSON.parse(fs.readFileSync('data/ledger.json', 'utf8'));
const today = indiaParts().date;
const client = createGrowwClient(process.env.GROWW_ACCESS_TOKEN);
const quotes = {};
for (const symbol of new Set(ledger.openLots.map((lot) => lot.symbol))) {
  quotes[symbol] = normalizeQuote(await client.quote(symbol));
}
sellTargets(ledger, { date: today, quotes });
ledger.sessions.push({ date: today, type: 'SELL_CHECK', openLotsChecked: ledger.openLots.length });
touchLedger(ledger); fs.writeFileSync('data/ledger.json', `${JSON.stringify(ledger, null, 2)}\n`);
