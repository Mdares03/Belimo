#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const envPath = path.join(root, '.env');
const logPath = process.env.INGEST_LOG_PATH || path.join(root, 'ingest.log');

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const envFromFile = loadDotEnv(envPath);
const cronSecret = process.env.CRON_SECRET || envFromFile.CRON_SECRET;
const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
const ingestUrl = process.env.INGEST_URL || `${baseUrl}/api/cron/ingest`;

if (!cronSecret) {
  const msg = `${new Date().toISOString()} status=error reason=missing_cron_secret url=${ingestUrl}`;
  fs.appendFileSync(logPath, `${msg}\n`);
  console.error(msg);
  process.exit(1);
}

const started = Date.now();
let statusCode = 0;
let summary = 'unknown';
let ok = false;

try {
  const res = await fetch(ingestUrl, {
    method: 'POST',
    headers: {
      'x-cron-secret': cronSecret,
      'content-type': 'application/json',
    },
  });
  statusCode = res.status;
  const text = await res.text();

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  if (res.ok && parsed && typeof parsed === 'object') {
    ok = true;
    const deviceCount = typeof parsed.devicesSeen === 'number' ? parsed.devicesSeen : 'na';
    const upserts = typeof parsed.valvesUpserted === 'number' ? parsed.valvesUpserted : 'na';
    const readings = typeof parsed.readingsCreated === 'number' ? parsed.readingsCreated : 'na';
    const errors = typeof parsed.errors === 'number' ? parsed.errors : 'na';
    summary = `devices=${deviceCount} valves=${upserts} readings=${readings} errors=${errors}`;
  } else if (parsed && parsed.error) {
    summary = `error=${String(parsed.error).replace(/\s+/g, '_').slice(0, 180)}`;
  } else {
    summary = `body=${text.replace(/\s+/g, ' ').slice(0, 180)}`;
  }
} catch (error) {
  summary = `exception=${String(error).replace(/\s+/g, '_').slice(0, 180)}`;
}

const elapsedMs = Date.now() - started;
const line = `${new Date().toISOString()} status=${ok ? 'ok' : 'fail'} http=${statusCode} elapsed_ms=${elapsedMs} ${summary}`;
fs.appendFileSync(logPath, `${line}\n`);
if (ok) {
  console.log(line);
  process.exit(0);
}
console.error(line);
process.exit(1);
