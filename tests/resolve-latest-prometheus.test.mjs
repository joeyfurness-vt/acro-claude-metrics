import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReleaseTag, buildDownloadUrl } from '../scripts/resolve-latest-prometheus.mjs';

test('parseReleaseTag strips the leading v', () => {
  assert.equal(parseReleaseTag('v3.12.0'), '3.12.0');
});

test('parseReleaseTag rejects non-vX.Y.Z', () => {
  assert.throws(() => parseReleaseTag('latest'));
  assert.throws(() => parseReleaseTag('3.12.0'));
  assert.throws(() => parseReleaseTag('v3.12'));
});

test('buildDownloadUrl composes the right URL for darwin-arm64', () => {
  const u = buildDownloadUrl('3.12.0', 'darwin-arm64');
  assert.equal(u, 'https://github.com/prometheus/prometheus/releases/download/v3.12.0/prometheus-3.12.0.darwin-arm64.tar.gz');
});

test('buildDownloadUrl composes the right URL for linux-amd64', () => {
  const u = buildDownloadUrl('3.12.0', 'linux-amd64');
  assert.equal(u, 'https://github.com/prometheus/prometheus/releases/download/v3.12.0/prometheus-3.12.0.linux-amd64.tar.gz');
});
