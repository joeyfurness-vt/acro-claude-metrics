// Resolves the latest stable Prometheus release tag via the GitHub API and
// composes the platform-specific download URL.
//
// CLI: `node scripts/resolve-latest-prometheus.mjs <platform>`
//   prints `<version>\t<url>` to stdout, exit 0 on success.
// Library: exports parseReleaseTag, buildDownloadUrl, fetchLatestVersion.

const GITHUB_LATEST = 'https://api.github.com/repos/prometheus/prometheus/releases/latest';

export function parseReleaseTag(tag) {
  if (typeof tag !== 'string') throw new Error(`tag must be a string: ${tag}`);
  const m = tag.match(/^v(\d+\.\d+\.\d+)$/);
  if (!m) throw new Error(`unexpected release tag: ${tag}`);
  return m[1];
}

export function buildDownloadUrl(version, platform) {
  return `https://github.com/prometheus/prometheus/releases/download/v${version}/prometheus-${version}.${platform}.tar.gz`;
}

export async function fetchLatestVersion(fetchFn = fetch) {
  const res = await fetchFn(GITHUB_LATEST, {
    headers: { 'Accept': 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return parseReleaseTag(body.tag_name);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const platform = process.argv[2];
  if (!platform) {
    console.error('usage: resolve-latest-prometheus.mjs <platform>');
    process.exit(2);
  }
  const version = await fetchLatestVersion();
  const url = buildDownloadUrl(version, platform);
  process.stdout.write(`${version}\t${url}\n`);
}
