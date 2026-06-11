#!/usr/bin/env node
// check-endpoint.mjs — verifies the app's /metrics endpoint and that the
// local Prometheus agent has scraped it at least once.
//
// Usage: node scripts/verify/check-endpoint.mjs

const METRICS_PORT = process.env.METRICS_PORT || '9100';
const APP_METRICS_URL = `http://localhost:${METRICS_PORT}/metrics`;
const AGENT_METRICS_URL = `http://localhost:9090/metrics`; // Prometheus agent's own port

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.error(`  ✗ ${name}\n    ${err.message}`);
    return false;
  }
}

async function fetchText(url, timeoutMs = 3000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function looksLikeExposition(text) {
  if (!text.includes('# HELP')) throw new Error('no `# HELP` lines in response — not exposition format');
  if (!text.includes('# TYPE')) throw new Error('no `# TYPE` lines in response — not exposition format');
  const lines = text.split('\n').filter(l => l && !l.startsWith('#'));
  if (lines.length === 0) throw new Error('no metric lines in response');
}

async function main() {
  console.log(`Checking ${APP_METRICS_URL} …`);
  const ok1 = await check('app /metrics returns 200', async () => {
    await fetchText(APP_METRICS_URL);
  });
  const ok2 = await check('app /metrics is valid exposition format', async () => {
    looksLikeExposition(await fetchText(APP_METRICS_URL));
  });

  console.log(`\nChecking agent at ${AGENT_METRICS_URL} …`);
  const ok3 = await check('agent is running and exposes its own /metrics', async () => {
    await fetchText(AGENT_METRICS_URL);
  });
  const ok4 = await check('agent reports up{job="app"}=1', async () => {
    const text = await fetchText(AGENT_METRICS_URL);
    const m = text.match(/^up\{[^}]*job="app"[^}]*\} (\d+)/m);
    if (!m) throw new Error('agent has no up{job="app"} metric — is the scrape_config job_name correct?');
    if (m[1] !== '1') throw new Error(`agent shows up{job="app"} = ${m[1]} — agent can see the target but the target is not responding`);
  });

  const allOk = [ok1, ok2, ok3, ok4].every(Boolean);
  if (!allOk) process.exit(1);
  console.log('\nAll local checks passed. Run check-roundtrip.mjs to verify remote ingestion.');
}

await main();
