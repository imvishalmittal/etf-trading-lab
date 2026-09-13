import crypto from 'node:crypto';

export function kiteChecksum(apiKey, requestToken, apiSecret) {
  return crypto.createHash('sha256').update(`${apiKey}${requestToken}${apiSecret}`).digest('hex');
}

export async function exchangeKiteRequestToken({ apiKey, apiSecret, requestToken }) {
  if (!apiKey || !apiSecret || !requestToken) throw new Error('KITE_API_KEY, KITE_API_SECRET, and KITE_REQUEST_TOKEN are required');
  const form = new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum: kiteChecksum(apiKey, requestToken, apiSecret) });
  const response = await fetch('https://api.kite.trade/session/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Kite-Version': '3' },
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.status !== 'success' || !body.data?.access_token) {
    throw new Error(`Kite token exchange failed (${response.status}): ${body.message || body.error_type || 'unknown response'}`);
  }
  return body.data.access_token;
}

