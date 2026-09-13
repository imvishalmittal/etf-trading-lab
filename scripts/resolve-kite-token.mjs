import fs from 'node:fs';

import { exchangeKiteRequestToken } from '../src/nifty-etf-m1/kite-auth.mjs';

const apiKey = process.env.KITE_API_KEY?.trim();
let accessToken = process.env.KITE_ACCESS_TOKEN?.trim();
let method = 'existing_access_token';

if (!apiKey) throw new Error('KITE_API_KEY is required');
if (!accessToken) {
  accessToken = await exchangeKiteRequestToken({
    apiKey,
    apiSecret: process.env.KITE_API_SECRET?.trim(),
    requestToken: process.env.KITE_REQUEST_TOKEN?.trim(),
  });
  method = 'request_token_exchange';
}

if (!process.env.GITHUB_ENV) throw new Error('GITHUB_ENV is required; this helper is intended for GitHub Actions');
// Register the generated token with GitHub's log masker before exporting it to later steps.
process.stdout.write(`::add-mask::${accessToken}\n`);
fs.appendFileSync(process.env.GITHUB_ENV, `KITE_ACCESS_TOKEN=${accessToken}\n`);
process.stdout.write(`Kite authentication resolved via ${method}; token value was not logged.\n`);
