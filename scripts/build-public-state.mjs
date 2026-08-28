import fs from 'node:fs';
import { buildPublicState } from '../src/state.mjs';

const ledger = JSON.parse(fs.readFileSync('data/ledger.json', 'utf8'));
fs.writeFileSync('public/state.json', `${JSON.stringify(buildPublicState(ledger), null, 2)}\n`);
