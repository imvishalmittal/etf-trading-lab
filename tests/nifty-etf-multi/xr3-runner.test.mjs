import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

test('XR3 runner calculates all three stages together from a checksummed artifact', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xr3-runner-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'), output = path.join(root, 'results');
  fs.mkdirSync(path.join(source, 'data'), { recursive: true });
  const configText = fs.readFileSync('research/nifty-etf-xr3/frozen-config.json');
  const config = JSON.parse(configText);
  const dates = [];
  for (let value = new Date('2018-01-01T00:00:00Z'); value <= new Date('2026-09-11T00:00:00Z'); value.setUTCDate(value.getUTCDate() + 1)) {
    if (value.getUTCDay() !== 0 && value.getUTCDay() !== 6) dates.push(value.toISOString().slice(0, 10));
  }
  for (const [rank, symbol] of config.universe.entries()) {
    const lines = ['timestamp,open,high,low,close,volume'];
    for (let index = 0; index < dates.length; index += 1) {
      const close = 100 + index * (0.02 + rank * 0.001) + Math.sin(index / (8 + rank)) * (1 + rank * 0.05);
      lines.push(`${dates[index]}T00:00:00+05:30,${close - 0.05},${close + 0.5},${close - 0.5},${close},100000`);
    }
    fs.writeFileSync(path.join(source, 'data', `${symbol.toLowerCase()}.csv.gz`), zlib.gzipSync(`${lines.join('\n')}\n`));
  }
  fs.writeFileSync(path.join(source, 'frozen-config.json'), configText);
  fs.writeFileSync(path.join(source, 'manifest.json'), '{}\n');
  const members = fs.readdirSync(path.join(source, 'data')).map((name) => `data/${name}`).concat(['frozen-config.json', 'manifest.json']).sort();
  fs.writeFileSync(path.join(source, 'checksums.sha256'), `${members.map((relative) => `${sha256(fs.readFileSync(path.join(source, relative)))}  ${relative}`).join('\n')}\n`);

  execFileSync(process.execPath, ['scripts/run-nifty-etf-xr3.mjs', `--data-dir=${source}`, `--out=${output}`], { cwd: process.cwd(), stdio: 'pipe', timeout: 20000 });
  const status = JSON.parse(fs.readFileSync(path.join(output, 'status.json'), 'utf8'));
  assert.deepEqual(Object.keys(status.stages), ['discovery', 'validation', 'holdout']);
  assert.ok(['HISTORICAL_STAGED_SUPPORT_NOT_AUTHORIZED', 'HISTORICAL_STAGED_REJECTED'].includes(status.status));
  for (const line of fs.readFileSync(path.join(output, 'checksums.sha256'), 'utf8').trim().split('\n')) {
    const [expected, relative] = line.split(/\s{2,}/);
    assert.equal(sha256(fs.readFileSync(path.join(output, relative))), expected);
  }
});

