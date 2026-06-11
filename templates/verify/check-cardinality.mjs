#!/usr/bin/env node
// check-cardinality.mjs — fetches /metrics and warns if any single metric
// has more series than is healthy, or if total series across the app is
// excessive. Run after generating some load on the app.

const METRICS_PORT = process.env.METRICS_PORT || '9100';
const PER_METRIC_LIMIT = 50;
const TOTAL_LIMIT = 5000;

const text = await (await fetch(`http://localhost:${METRICS_PORT}/metrics`)).text();
const metricLines = text.split('\n').filter(l => l && !l.startsWith('#'));

const perMetric = new Map();
for (const line of metricLines) {
  const name = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)/)?.[1];
  if (!name) continue;
  perMetric.set(name, (perMetric.get(name) ?? 0) + 1);
}

const total = metricLines.length;
let problems = 0;

console.log(`Total series: ${total}${total > TOTAL_LIMIT ? ` ⚠ exceeds ${TOTAL_LIMIT}` : ''}`);
if (total > TOTAL_LIMIT) problems++;

const offenders = [...perMetric.entries()].filter(([_, n]) => n > PER_METRIC_LIMIT);
if (offenders.length === 0) {
  console.log(`No single metric exceeds ${PER_METRIC_LIMIT} series.`);
} else {
  console.log(`\n⚠ Metrics over ${PER_METRIC_LIMIT} series:`);
  for (const [name, n] of offenders.sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name}: ${n}`);
  }
  console.log(`\nLikely cause: a label with high cardinality (user_id, email, free-form string, timestamp, URL path with IDs).`);
  console.log(`Fix: drop the offending label, or constrain it to a small enum.`);
  problems++;
}

if (problems > 0) process.exit(1);
