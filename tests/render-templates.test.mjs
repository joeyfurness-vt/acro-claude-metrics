import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('prometheus.yml.tmpl includes required env-substitution markers', () => {
  const src = readFileSync('templates/prometheus-yml/prometheus.yml.tmpl', 'utf8');
  assert.ok(src.includes('${METRICS_PROJECT}'));
  assert.ok(src.includes('${METRICS_PORT}'));
  assert.ok(src.includes('${METRICS_REMOTE_WRITE_URL}'));
});

test('verify scripts parse as JS', () => {
  const verifyDir = 'templates/verify';
  for (const f of readdirSync(verifyDir)) {
    if (!f.endsWith('.mjs')) continue;
    const res = spawnSync('node', ['--check', join(verifyDir, f)]);
    assert.equal(res.status, 0, `node --check failed on ${f}: ${res.stderr}`);
  }
});

test('verify scripts parse as Python', () => {
  const verifyDir = 'templates/verify';
  for (const f of readdirSync(verifyDir)) {
    if (!f.endsWith('.py')) continue;
    const res = spawnSync('python3', ['-m', 'py_compile', join(verifyDir, f)]);
    assert.equal(res.status, 0, `py_compile failed on ${f}: ${res.stderr}`);
  }
});
