#!/usr/bin/env node
// check-roundtrip.mjs — pushes a sentinel metric value (a fresh timestamp)
// and queries the remote endpoint's read API back for it. Only definitive
// end-to-end check.
//
// Uses the agent's own scrape path: we set a gauge `bootstrap_verify_ts`
// on the app via an HTTP POST to a tiny verification helper route, wait
// for the next scrape + remote_write, then query the remote endpoint.
//
// Env required:
//   METRICS_REMOTE_WRITE_URL  (used to derive the read URL — replace
//                              "/api/prom/push" with "/api/prom/api/v1/query")
//   METRICS_REMOTE_WRITE_USERNAME / PASSWORD
//   METRICS_PROJECT
//
// This script assumes the integration skill has installed a temporary
// `/internal/metrics-verify-bump` route on the app that sets the gauge.

import { setTimeout as wait } from 'node:timers/promises';

const PUSH_URL  = process.env.METRICS_REMOTE_WRITE_URL;
const USER      = process.env.METRICS_REMOTE_WRITE_USERNAME;
const PASS      = process.env.METRICS_REMOTE_WRITE_PASSWORD;
const PROJECT   = process.env.METRICS_PROJECT;
const PORT      = process.env.METRICS_PORT || '9100';
if (!PUSH_URL || !USER || !PASS || !PROJECT) {
  console.error('Missing one of METRICS_REMOTE_WRITE_URL / USERNAME / PASSWORD / METRICS_PROJECT');
  process.exit(2);
}

const READ_URL = PUSH_URL.replace(/\/api\/prom\/push$/, '/api/prom/api/v1/query');
if (READ_URL === PUSH_URL) {
  console.error('Could not derive read URL from PUSH_URL — expected suffix /api/prom/push');
  process.exit(2);
}

const sentinel = Math.floor(Date.now() / 1000);

const bump = await fetch(`http://localhost:${PORT}/internal/metrics-verify-bump?ts=${sentinel}`, { method: 'POST' });
if (!bump.ok) {
  console.error(`bump failed: HTTP ${bump.status} — is the app running with the verify-bump route?`);
  process.exit(1);
}
console.log(`Bumped bootstrap_verify_ts on the app to ${sentinel}. Waiting for scrape + remote_write …`);

const deadline = Date.now() + 60_000;
const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
let found = false;

while (Date.now() < deadline) {
  const q = encodeURIComponent(`bootstrap_verify_ts{project="${PROJECT}"}`);
  const r = await fetch(`${READ_URL}?query=${q}`, { headers: { Authorization: auth } });
  if (!r.ok) {
    console.error(`query failed: HTTP ${r.status} ${await r.text()}`);
    process.exit(1);
  }
  const body = await r.json();
  const val = body?.data?.result?.[0]?.value?.[1];
  if (val && Number(val) >= sentinel) {
    console.log(`✓ remote endpoint returned bootstrap_verify_ts=${val} (>= sentinel ${sentinel}) — end-to-end confirmed`);
    found = true;
    break;
  }
  await wait(5000);
  process.stdout.write('.');
}
if (!found) {
  console.error(`\n✗ Sentinel did not appear at the remote endpoint within 60s.`);
  console.error('  Likely causes: remote_write auth wrong; remote endpoint URL wrong; agent not running.');
  process.exit(1);
}
