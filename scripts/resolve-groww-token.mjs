import crypto from 'node:crypto';
import fs from 'node:fs';

function base32(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of input.replace(/\s|=/g, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  return Buffer.from(bits.match(/.{8}/g)?.map((part) => parseInt(part, 2)) || []);
}
function totp(secret) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = crypto.createHmac('sha1', base32(secret)).update(counter).digest();
  const offset = digest.at(-1) & 15;
  const code = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}
const manual = process.env.GROWW_ACCESS_TOKEN?.trim();
let token = manual;
if (process.env.GROWW_TOTP_TOKEN && process.env.GROWW_TOTP_SECRET) {
  const response = await fetch('https://api.groww.in/v1/token/api/access', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.GROWW_TOTP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key_type: 'totp', totp: totp(process.env.GROWW_TOTP_SECRET) }),
  });
  const body = await response.json(); token = body.token ?? body.payload?.token;
  if (!response.ok || !token) throw new Error(body?.error?.message || 'Groww TOTP token request failed');
}
if (!token) throw new Error('Add GROWW_TOTP_TOKEN and GROWW_TOTP_SECRET repository secrets');
console.log(`::add-mask::${token}`);
fs.appendFileSync(process.env.GITHUB_ENV, `GROWW_ACCESS_TOKEN=${token}\n`);
