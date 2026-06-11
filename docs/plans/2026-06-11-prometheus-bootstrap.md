# Prometheus Bootstrap Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin that bootstraps Prometheus metrics on Node, browser, Python, and TouchDesigner projects, using standard client libraries + Prometheus Agent mode for remote_write forwarding.

**Architecture:** Each project app uses its language's standard Prometheus client library to expose `/metrics`. A per-project `prometheus --agent` (in `tools/prometheus-agent/`) scrapes localhost and forwards to a hosted endpoint. Identity labels (`project`, `env`, `installation_id`) live in the agent's config, not app code. Browser metrics route through a Node relay with server-side label whitelisting. The plugin is distributed as a Claude Code plugin (`/plugin install` flow), with nine skills covering reference, discovery, agent setup, per-stack integration, verification, and starter dashboards.

**Tech Stack:**
- Claude Code plugin manifest (`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`)
- Markdown skills with YAML frontmatter (`name`, `description`)
- Shell + Node.js + Python helper scripts that ship with skills
- `prom-client` (Node), `prometheus_client` (Python), Prometheus binary in agent mode
- Reference spec: `docs/specs/2026-06-10-prometheus-bootstrap-design.md`

**Note on TDD for prose-heavy skills:** Skill bodies are markdown read by Claude — they're prose, not testable code. Traditional TDD applies to the helper scripts and template renderers we ship alongside. For each SKILL.md we use the same discipline in a different shape:

1. Write the **acceptance criteria** for the skill first (what files it must create, what content must appear, what commands it must run)
2. Write the SKILL.md
3. Verify by invoking the skill against a fixture project and checking the criteria

This appears in tasks as: write criteria → write SKILL.md → invoke against fixture → confirm criteria.

**Commit policy:** Commit at the end of every phase. The user has explicitly overridden any default "don't commit Claude-related docs" guidance. Use conventional commits (feat, fix, docs, chore, test).

---

## File structure (target shape at end of plan)

```
acro-claude-metrics/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── .gitignore
├── LICENSE                                   # MIT
├── README.md                                 # Top-level: install, mental model
├── docs/
│   ├── specs/
│   │   └── 2026-06-10-prometheus-bootstrap-design.md
│   └── plans/
│       └── 2026-06-11-prometheus-bootstrap.md   # this file
├── skills/
│   ├── metrics-discovery/SKILL.md
│   ├── prometheus-reference/SKILL.md
│   ├── prometheus-agent-setup/SKILL.md
│   ├── prometheus-integrate-node/SKILL.md
│   ├── prometheus-integrate-browser/SKILL.md
│   ├── prometheus-integrate-python/SKILL.md
│   ├── prometheus-integrate-touchdesigner/SKILL.md
│   ├── metrics-verify/SKILL.md
│   └── metrics-dashboard/SKILL.md
├── templates/
│   ├── prometheus-yml/prometheus.yml.tmpl
│   ├── env/metrics.env.tmpl
│   ├── node/metrics-module.ts.tmpl
│   ├── python/metrics-module.py.tmpl
│   ├── browser/metrics-client.ts.tmpl
│   ├── browser/relay-route.ts.tmpl
│   ├── touchdesigner/MetricsExt.py.tmpl
│   ├── verify/check-endpoint.mjs
│   ├── verify/check-endpoint.py
│   ├── verify/check-cardinality.mjs
│   ├── verify/check-cardinality.py
│   ├── verify/check-roundtrip.mjs
│   ├── dashboards/starter-panel.json.tmpl
│   └── metrics-plan-template.md
├── scripts/
│   ├── lint-skills.mjs                       # frontmatter linter
│   ├── platform-detect.sh                    # shared by agent-setup
│   └── resolve-latest-prometheus.mjs         # GitHub releases lookup
├── test-fixtures/
│   ├── node-minimal/                         # bare express app
│   ├── python-minimal/                       # bare flask app
│   └── touchdesigner-readme.md               # how to test TD manually
└── tests/
    ├── lint-skills.test.mjs
    ├── platform-detect.test.sh
    ├── resolve-latest-prometheus.test.mjs
    └── render-templates.test.mjs
```

---

## Phase 0: Repo skeleton, plugin manifest, license, initial commit

**Files:**
- Create: `~/Documents/Projects/Internal/acro-claude-metrics/.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `LICENSE`
- Create: `README.md`
- Create: `.gitignore`
- Create: `package.json`
- Move: existing `docs/specs/2026-06-10-prometheus-bootstrap-design.md` (already present)

### Task 0.1: Confirm working directory and starting branch

- [ ] **Step 1: Set the working directory**

Run from anywhere:
```bash
cd ~/Documents/Projects/Internal/acro-claude-metrics
pwd
```
Expected: `/Users/Joey/Documents/Projects/Internal/acro-claude-metrics`

- [ ] **Step 2: Inspect git state**

```bash
git status
git branch --show-current
```
Expected: clean working tree; on branch `main` (no commits yet — pre-initial commit).

### Task 0.2: Create the plugin manifest

- [ ] **Step 1: Create `.claude-plugin/` directory**

```bash
mkdir -p .claude-plugin
```

- [ ] **Step 2: Write `.claude-plugin/plugin.json`**

```json
{
  "name": "acro-claude-metrics",
  "description": "Bootstrap production-ready Prometheus metrics on Node, browser, Python, and TouchDesigner projects — designed for teams new to observability.",
  "version": "0.1.0",
  "author": {
    "name": "Joey Furness",
    "email": "joeyfurness@vtprodesign.com"
  },
  "homepage": "https://github.com/joeyfurness-vt/acro-claude-metrics",
  "repository": "https://github.com/joeyfurness-vt/acro-claude-metrics",
  "license": "MIT",
  "keywords": [
    "prometheus",
    "metrics",
    "observability",
    "remote-write",
    "grafana",
    "touchdesigner",
    "claude-code"
  ]
}
```

- [ ] **Step 3: Write `.claude-plugin/marketplace.json`**

```json
{
  "name": "acro-claude-metrics-dev",
  "description": "Development marketplace for acro-claude-metrics plugin",
  "owner": {
    "name": "Joey Furness",
    "email": "joeyfurness@vtprodesign.com"
  },
  "plugins": [
    {
      "name": "acro-claude-metrics",
      "description": "Bootstrap Prometheus metrics across Node, browser, Python, and TouchDesigner.",
      "version": "0.1.0",
      "source": "./",
      "author": {
        "name": "Joey Furness",
        "email": "joeyfurness@vtprodesign.com"
      }
    }
  ]
}
```

### Task 0.3: Write LICENSE (MIT)

- [ ] **Step 1: Write `LICENSE`**

```
MIT License

Copyright (c) 2026 Joey Furness / VTPro Design

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Task 0.4: Write `.gitignore`

- [ ] **Step 1: Write `.gitignore`**

```
node_modules/
dist/
build/
.env
.env.local
*.log
.DS_Store
test-fixtures/*/node_modules/
test-fixtures/*/.venv/
test-fixtures/*/tools/prometheus-agent/prometheus
test-fixtures/*/tools/prometheus-agent/data/
.idea/
.vscode/
*.swp
```

### Task 0.5: Write README.md (the onboarding mental model lives here)

- [ ] **Step 1: Write `README.md`**

```markdown
# acro-claude-metrics

A Claude Code plugin for bootstrapping Prometheus metrics on activation / installation projects.

## What it does

When you invoke the skills in this plugin against a new project, you get:

- A `/metrics` endpoint in your app exposing the right metrics, named correctly, with safe labels
- A local Prometheus Agent (`tools/prometheus-agent/`) that scrapes your app and forwards to your hosted Prometheus endpoint
- Verified end-to-end delivery from your app to the cloud, before anything claims to be working
- A starter set of PromQL queries and a starter Grafana dashboard

## Mental model

Your app measures things and posts them to a local bulletin board (`/metrics`). The Prometheus agent reads that bulletin board every 15 seconds and forwards readings to the hosted endpoint. You never send data directly to the cloud — the agent handles buffering and retries. If the agent is down, metrics still accumulate locally; they're just not forwarded until the agent runs again. If the internet is down, the agent buffers up to its WAL limit (~2h of data at default volumes) and resumes when connectivity returns.

Browsers can't speak the remote_write protocol (snappy + protobuf + server-side auth secrets are involved). Instead, the browser posts to a relay route on your own Node server, which folds the data into the server's metrics. The agent then scrapes one endpoint that covers both.

## Install

```bash
/plugin marketplace add https://github.com/joeyfurness-vt/acro-claude-metrics
/plugin install acro-claude-metrics
```

## Typical workflow

1. `/metrics-discovery` — produces `docs/metrics/metrics-plan.md` for your project
2. `/prometheus-agent-setup` — installs the local agent
3. `/prometheus-integrate-<stack>` — one of: node, browser, python, touchdesigner
4. `/metrics-verify` — confirms end-to-end delivery
5. `/metrics-dashboard` — generates starter PromQL + Grafana JSON

## Skills

| Skill | Purpose |
|---|---|
| `metrics-discovery` | Interview + categorize + scan to produce a metrics plan |
| `prometheus-reference` | Cheat sheet: types, naming, labels, histograms, alerting principles |
| `prometheus-agent-setup` | Download Prometheus binary, configure agent mode, integrate startup |
| `prometheus-integrate-node` | `prom-client` + `/metrics` endpoint scaffolding |
| `prometheus-integrate-browser` | In-browser client + Node relay with label whitelist |
| `prometheus-integrate-python` | `prometheus_client` + `start_http_server` scaffolding |
| `prometheus-integrate-touchdesigner` | `MetricsExt` COMP extension for TD |
| `metrics-verify` | 5-step pipeline verification including cardinality smoke test |
| `metrics-dashboard` | Starter PromQL queries + minimal Grafana dashboard JSON |

See `docs/specs/2026-06-10-prometheus-bootstrap-design.md` for the full design.

## License

MIT — see `LICENSE`.
```

### Task 0.6: Create a minimal `package.json` for the helper scripts

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "acro-claude-metrics",
  "version": "0.1.0",
  "private": true,
  "description": "Internal helpers for the acro-claude-metrics Claude Code plugin",
  "type": "module",
  "scripts": {
    "test": "node --test tests/",
    "lint:skills": "node scripts/lint-skills.mjs"
  },
  "devDependencies": {
    "js-yaml": "^4.1.0"
  }
}
```

- [ ] **Step 2: Install dev deps**

```bash
npm install
```
Expected: `js-yaml` installed; `node_modules/` and `package-lock.json` created.

### Task 0.7: Create the GitHub remote and initial push

- [ ] **Step 1: Create the GitHub repo**

```bash
gh repo create acro-claude-metrics --public --description "Bootstrap Prometheus metrics on Node, browser, Python, and TouchDesigner projects." --source=. --remote=origin --confirm
```
Expected: repo created at `https://github.com/<your-user>/acro-claude-metrics`; remote `origin` configured.

- [ ] **Step 2: Stage and commit phase 0**

```bash
git add .claude-plugin LICENSE README.md .gitignore package.json package-lock.json docs/specs docs/plans
git commit -m "$(cat <<'EOF'
chore: initial plugin skeleton

Add Claude Code plugin manifest, MIT license, README with mental model,
and skeleton package.json for helper scripts.

Reference spec lives at docs/specs/2026-06-10-prometheus-bootstrap-design.md.
Plan lives at docs/plans/2026-06-11-prometheus-bootstrap.md.
EOF
)"
```

- [ ] **Step 3: Push initial commit**

```bash
git push -u origin main
```
Expected: push succeeds; main is tracking origin/main.

---

## Phase 1: `prometheus-reference` skill

**Files:**
- Create: `skills/prometheus-reference/SKILL.md`
- Create: `scripts/lint-skills.mjs`
- Create: `tests/lint-skills.test.mjs`

### Task 1.1: Write a skill frontmatter linter (test first)

- [ ] **Step 1: Write a failing test for the linter**

Create `tests/lint-skills.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintSkill } from '../scripts/lint-skills.mjs';

test('passes a skill with valid frontmatter', () => {
  const content = `---
name: example-skill
description: Use when doing X to accomplish Y.
---

# Example
Body.
`;
  const result = lintSkill('example/SKILL.md', content);
  assert.deepEqual(result.errors, []);
});

test('flags missing name field', () => {
  const content = `---
description: Use when doing X.
---

# Example`;
  const result = lintSkill('example/SKILL.md', content);
  assert.ok(result.errors.some(e => e.includes('name')));
});

test('flags name that does not match directory', () => {
  const content = `---
name: wrong-name
description: Use when doing X.
---
`;
  const result = lintSkill('skills/example/SKILL.md', content);
  assert.ok(result.errors.some(e => e.includes('does not match directory')));
});

test('flags missing description', () => {
  const content = `---
name: example
---
`;
  const result = lintSkill('skills/example/SKILL.md', content);
  assert.ok(result.errors.some(e => e.includes('description')));
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
node --test tests/lint-skills.test.mjs
```
Expected: FAIL — `scripts/lint-skills.mjs` does not exist yet.

- [ ] **Step 3: Implement `scripts/lint-skills.mjs`**

```javascript
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import yaml from 'js-yaml';

export function lintSkill(path, content) {
  const errors = [];
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    errors.push(`${path}: missing YAML frontmatter`);
    return { errors };
  }
  let fm;
  try {
    fm = yaml.load(match[1]);
  } catch (e) {
    errors.push(`${path}: invalid YAML in frontmatter: ${e.message}`);
    return { errors };
  }
  if (!fm || typeof fm.name !== 'string' || fm.name.length === 0) {
    errors.push(`${path}: missing or empty 'name' field`);
  }
  if (!fm || typeof fm.description !== 'string' || fm.description.length === 0) {
    errors.push(`${path}: missing or empty 'description' field`);
  }
  if (fm && fm.name) {
    const expected = basename(dirname(path));
    if (expected !== '.' && fm.name !== expected) {
      errors.push(`${path}: skill name '${fm.name}' does not match directory '${expected}'`);
    }
  }
  return { errors };
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry === 'SKILL.md') out.push(full);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2] || 'skills';
  const allErrors = [];
  for (const file of walk(root)) {
    const { errors } = lintSkill(file, readFileSync(file, 'utf8'));
    allErrors.push(...errors);
  }
  if (allErrors.length) {
    for (const e of allErrors) console.error(e);
    process.exit(1);
  }
  console.log(`OK — all skill files passed frontmatter lint`);
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
node --test tests/lint-skills.test.mjs
```
Expected: PASS (4/4).

### Task 1.2: Write `prometheus-reference/SKILL.md`

**Acceptance criteria for this skill:**
- Frontmatter `name: prometheus-reference` and a description that says "Use when choosing metric types, naming metrics, designing labels, or reviewing existing metrics for best-practice violations."
- Contains the nine sections enumerated in spec §3 (Skill-by-skill detail → `prometheus-reference`)
- Contains the four bucket presets from spec § "Histogram strategy"
- Explicitly names native histograms as the canonical direction with current library status
- Lists the reserved labels (`instance`, `job`, `__name__`, `__*`)

- [ ] **Step 1: Write the SKILL.md**

Create `skills/prometheus-reference/SKILL.md` with the structure below. The content body for each section is taken from spec § Skill-by-skill detail → `prometheus-reference` (sections 1–9). Render each section in full prose; no placeholders.

```markdown
---
name: prometheus-reference
description: Use when choosing metric types, naming metrics, designing labels, or reviewing existing metrics for best-practice violations. Loaded by other metrics skills and also valid standalone for ad-hoc questions like "is this a counter or a gauge?"
---

# Prometheus reference

This skill is the shared knowledge spine for the rest of the `acro-claude-metrics` plugin. Other skills load it; you can also invoke it directly when you have a single specific question.

## 1. The Zen of Prometheus

[Full prose per spec §3, section 1 — sixteen principles, leading with "Instrument first, ask questions later" and "Counters rule, gauges suck."]

## 2. Decision tree: which metric type?

[Full prose per spec §3, section 2 — counter/gauge/histogram/summary decision flow with concrete activation examples.]

## 3. Native histograms — the canonical direction

[Full prose per spec §3, section 3 — what native histograms are; why they're preferred (Zen #10); current library status: `prom-client` issue #576 open, `prometheus_client` PR #1104 still open for the instrumentation API while #1087 has shipped exposition format in v0.23.0; how the agent is configured to accept them today via `scrape_native_histograms: true`; the migration shape when libs ship the instrumentation API.]

## 4. Naming rules

[Full prose per spec §3, section 4 — single-word app prefix, base units, suffixes, snake_case, single-unit-per-metric.]

## 5. Label hygiene

[Full prose per spec §3, section 5 — cardinality budget ~10, reserved labels (`instance`, `job`, `__name__`, `__*`), forbidden label values, default 0 for known label combos.]

## 6. Histogram bucket presets

[Full prose per spec §3, section 6, including the four preset tables: HTTP/RPC, scene/state durations, frame times, asset loads.]

## 7. Anti-patterns

[Full prose per spec §3, section 7 — embedding values in metric names, counters that decrement, manual counter resets, client-side rate aggregation, summary aggregation across instances, pre-aggregated dimensions instead of labels.]

## 8. PromQL pattern primer

[Full prose per spec §3, section 8 — rate before aggregate; canonical shapes for counter rates and histogram quantiles.]

## 9. Alerting principles

[Full prose per spec §3, section 9 — urgent/important/actionable/real; symptom not cause; minimum `for: 5m`; context labels.]
```

In the actual file replace each `[Full prose per spec …]` placeholder with the actual prose drawn from `docs/specs/2026-06-10-prometheus-bootstrap-design.md` § "Skill-by-skill detail → 2. `prometheus-reference`". Do not commit the bracketed placeholders.

- [ ] **Step 2: Lint the skill**

```bash
node scripts/lint-skills.mjs skills/
```
Expected: `OK — all skill files passed frontmatter lint`

- [ ] **Step 3: Quick read-through self-check**

Open `skills/prometheus-reference/SKILL.md` and confirm:
- [ ] All nine numbered sections are present and non-empty
- [ ] All four histogram preset tables are present with correct bucket values
- [ ] Native histograms named, current lib status accurate (Node #576 open, Python #1104 open)
- [ ] Reserved labels listed: `instance`, `job`, `__name__`, `__*`

### Task 1.3: Commit phase 1

- [ ] **Step 1: Stage and commit**

```bash
git add skills/prometheus-reference scripts/lint-skills.mjs tests/lint-skills.test.mjs
git commit -m "$(cat <<'EOF'
feat(reference): add prometheus-reference skill and frontmatter linter

The reference skill is the shared knowledge spine for the plugin —
metric type decisions, naming, label hygiene, histogram presets,
anti-patterns, PromQL patterns, alerting principles, and the Zen.

Linter validates SKILL.md frontmatter (name matches directory, name
and description present and non-empty).
EOF
)"
git push
```

---

## Phase 2: `prometheus-agent-setup` skill

**Files:**
- Create: `scripts/platform-detect.sh`
- Create: `scripts/resolve-latest-prometheus.mjs`
- Create: `tests/platform-detect.test.sh`
- Create: `tests/resolve-latest-prometheus.test.mjs`
- Create: `templates/prometheus-yml/prometheus.yml.tmpl`
- Create: `templates/env/metrics.env.tmpl`
- Create: `skills/prometheus-agent-setup/SKILL.md`

### Task 2.1: Platform-detect helper (test first)

- [ ] **Step 1: Write the failing test**

Create `tests/platform-detect.test.sh`:

```bash
#!/usr/bin/env bash
set -eu

fail=0

# When invoked with --uname-override the script must echo the canonical
# Prometheus release platform string and exit 0.
expect() {
  local input_os="$1" input_arch="$2" expected="$3"
  local got
  got=$(scripts/platform-detect.sh --os "$input_os" --arch "$input_arch")
  if [[ "$got" != "$expected" ]]; then
    echo "FAIL: os=$input_os arch=$input_arch expected=$expected got=$got"
    fail=1
  fi
}

expect_fail() {
  local input_os="$1" input_arch="$2"
  if scripts/platform-detect.sh --os "$input_os" --arch "$input_arch" >/dev/null 2>&1; then
    echo "FAIL: expected nonzero exit for os=$input_os arch=$input_arch"
    fail=1
  fi
}

expect Darwin   arm64    darwin-arm64
expect Darwin   x86_64   darwin-amd64
expect Linux    x86_64   linux-amd64
expect Linux    aarch64  linux-arm64
expect_fail Linux    armv7l
expect_fail Solaris  x86_64

if [[ "$fail" -eq 0 ]]; then
  echo "OK"
else
  exit 1
fi
```

```bash
chmod +x tests/platform-detect.test.sh
bash tests/platform-detect.test.sh
```
Expected: error — `scripts/platform-detect.sh: No such file`.

- [ ] **Step 2: Implement `scripts/platform-detect.sh`**

```bash
#!/usr/bin/env bash
# Detect the Prometheus release platform string for the current host.
# --os and --arch override `uname -s` and `uname -m` (used for tests).
set -eu

OS="$(uname -s)"
ARCH="$(uname -m)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --os) OS="$2"; shift 2 ;;
    --arch) ARCH="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

case "$OS-$ARCH" in
  Darwin-arm64)   echo "darwin-arm64" ;;
  Darwin-x86_64)  echo "darwin-amd64" ;;
  Linux-x86_64)   echo "linux-amd64" ;;
  Linux-aarch64)  echo "linux-arm64" ;;
  *)
    echo "unsupported platform: $OS-$ARCH" >&2
    echo "supported: Darwin-arm64, Darwin-x86_64, Linux-x86_64, Linux-aarch64" >&2
    exit 1
    ;;
esac
```

```bash
chmod +x scripts/platform-detect.sh
```

- [ ] **Step 3: Run the test to confirm it passes**

```bash
bash tests/platform-detect.test.sh
```
Expected: `OK`.

### Task 2.2: Resolve-latest-Prometheus helper (test first)

- [ ] **Step 1: Write the failing test**

Create `tests/resolve-latest-prometheus.test.mjs`:

```javascript
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
```

```bash
node --test tests/resolve-latest-prometheus.test.mjs
```
Expected: FAIL — module does not exist.

- [ ] **Step 2: Implement `scripts/resolve-latest-prometheus.mjs`**

```javascript
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
```

- [ ] **Step 3: Run the test to confirm it passes**

```bash
node --test tests/resolve-latest-prometheus.test.mjs
```
Expected: PASS (4/4).

### Task 2.3: Write the `prometheus.yml.tmpl` template

- [ ] **Step 1: Write `templates/prometheus-yml/prometheus.yml.tmpl`**

```yaml
# Generated by acro-claude-metrics → prometheus-agent-setup.
# Tunables — change here if you need different cadences.
# Defaults are tuned for low-volume activation projects (1–50 concurrent users).
#
global:
  scrape_interval: 15s
  external_labels:
    project: ${METRICS_PROJECT}
    env: ${METRICS_ENV}

scrape_configs:
  - job_name: app
    # Forward-compat: when client libs ship native histogram support,
    # this is the only line the agent needs to accept them.
    scrape_protocols:
      - PrometheusProto
      - OpenMetricsText1.0.0
      - PrometheusText0.0.4
    static_configs:
      - targets: ['localhost:${METRICS_PORT}']
        labels:
          installation_id: ${METRICS_INSTALLATION_ID}

remote_write:
  - url: ${METRICS_REMOTE_WRITE_URL}
    basic_auth:
      username: ${METRICS_REMOTE_WRITE_USERNAME}
      password: ${METRICS_REMOTE_WRITE_PASSWORD}
    queue_config:
      capacity: 10000
      max_samples_per_send: 2000
      batch_send_deadline: 10s
      min_backoff: 30ms
      max_backoff: 5s
```

### Task 2.4: Write the `.env` template

- [ ] **Step 1: Write `templates/env/metrics.env.tmpl`**

```
# acro-claude-metrics — values used by your app and your local Prometheus agent.
# DO NOT commit real secrets. The values below are placeholders.

# App-side (read by the app code)
METRICS_PORT=9100
METRICS_RELAY_ENABLED=true   # only when the browser integration is installed

# Agent-side (read by tools/prometheus-agent/prometheus.yml)
METRICS_PROJECT=your-project-name
METRICS_ENV=dev              # dev | staging | prod
METRICS_INSTALLATION_ID=01   # optional; only for multi-instance deployments

METRICS_REMOTE_WRITE_URL=https://prometheus-prod-xx-region.grafana.net/api/prom/push
METRICS_REMOTE_WRITE_USERNAME=000000
METRICS_REMOTE_WRITE_PASSWORD=replace-with-grafana-cloud-api-token
```

### Task 2.5: Write `skills/prometheus-agent-setup/SKILL.md`

**Acceptance criteria:**
- Frontmatter `name: prometheus-agent-setup` and a description starting "Use when..."
- The skill must produce, when invoked against a fixture project:
  - `tools/prometheus-agent/prometheus` (downloaded binary)
  - `tools/prometheus-agent/prometheus.yml` (rendered from template, env-substituted)
  - `.env` entries appended (placeholders) if not already present
  - `.gitignore` entries: `tools/prometheus-agent/prometheus`, `tools/prometheus-agent/data/`
  - A `npm run metrics:agent` script (or platform-appropriate launcher) added to start the agent foreground
- The skill explicitly explains: "This installs Prometheus Agent mode, not Grafana Alloy. They're different tools — if you Google 'Prometheus agent' you may land in Alloy docs."
- The skill explicitly explains WAL offline behavior (~2h buffer at default volumes).

- [ ] **Step 1: Write the SKILL.md**

```markdown
---
name: prometheus-agent-setup
description: Use when installing or upgrading the local Prometheus Agent for a project. Downloads the binary, scaffolds tools/prometheus-agent/prometheus.yml from the project's .env, configures startup integration, and confirms reachability of the remote_write endpoint.
---

# Prometheus Agent setup

This skill installs Prometheus in **agent mode** (`prometheus --agent`) at `tools/prometheus-agent/` inside the current project. The agent scrapes the project's local `/metrics` endpoint and forwards via `remote_write` to the hosted endpoint specified in the project's `.env`.

> **This is not Grafana Alloy.** Both are Prometheus-compatible scrape-and-forward agents. We use plain `prometheus --agent` because it uses YAML config and matches the bulk of Prometheus tutorials. If you Google "Prometheus agent" you may land in Alloy docs — different tool. See spec §"Rejected alternatives" for why.

## Procedure

1. **Detect platform.** Run `scripts/platform-detect.sh` from the plugin. Supported: `darwin-arm64`, `darwin-amd64`, `linux-amd64`, `linux-arm64`. Other platforms — instruct the user to download manually from <https://github.com/prometheus/prometheus/releases/latest>.

2. **Resolve the latest stable release.** Run `node scripts/resolve-latest-prometheus.mjs <platform>`. The script prints `<version>\t<url>` to stdout.

3. **Download and extract.** `curl -L -o /tmp/prometheus.tgz <url> && tar xz -C /tmp -f /tmp/prometheus.tgz` then move the `prometheus` binary into `tools/prometheus-agent/`. Confirm `./tools/prometheus-agent/prometheus --version` returns a 3.x version.

4. **Render `prometheus.yml`.** Copy `templates/prometheus-yml/prometheus.yml.tmpl` to `tools/prometheus-agent/prometheus.yml`. The template uses `${VAR}` env-var substitution; do not pre-interpolate — Prometheus reads the env at startup.

5. **Append `.env` entries.** If the project has no `.env`, copy `templates/env/metrics.env.tmpl` to `.env`. If `.env` exists, append only the missing keys; never overwrite existing values. Real secrets are placeholders the team will fill in later.

6. **Update `.gitignore`.** Ensure these lines are present:
   ```
   tools/prometheus-agent/prometheus
   tools/prometheus-agent/data/
   ```

7. **Add the agent launcher.** For Node projects, add an `npm` script:
   ```
   "metrics:agent": "set -a; source .env; set +a; ./tools/prometheus-agent/prometheus --agent --config.file=tools/prometheus-agent/prometheus.yml --storage.agent.path=tools/prometheus-agent/data"
   ```
   For non-Node projects, write `tools/prometheus-agent/start.sh` with the same command and `chmod +x` it. Document the equivalent for Windows in `tools/prometheus-agent/README.md`.

8. **Print the operator checklist.** Surface:
   - "Fill in `METRICS_REMOTE_WRITE_URL`, `METRICS_REMOTE_WRITE_USERNAME`, `METRICS_REMOTE_WRITE_PASSWORD` in `.env` before starting the agent."
   - "Set `METRICS_PROJECT`, `METRICS_ENV`, optionally `METRICS_INSTALLATION_ID`."
   - "The binary is platform-specific — re-run this skill on each production machine."
   - "The agent buffers ~2h of metrics in its WAL when the remote endpoint is unreachable. For activations that may lose internet, this is expected behavior."

## What this skill does NOT do

- Configure the project app (use `prometheus-integrate-<stack>` for that)
- Run the agent — that's a manual `npm run metrics:agent` after `.env` is filled in
- Generate alert rules (out of scope; see `prometheus-reference` for principles)
- Generate dashboards (use `metrics-dashboard` after metrics are flowing)
```

- [ ] **Step 2: Lint the skill**

```bash
node scripts/lint-skills.mjs skills/
```
Expected: pass.

### Task 2.6: Commit phase 2

- [ ] **Step 1: Stage and commit**

```bash
git add scripts/platform-detect.sh scripts/resolve-latest-prometheus.mjs \
        tests/platform-detect.test.sh tests/resolve-latest-prometheus.test.mjs \
        templates/prometheus-yml templates/env \
        skills/prometheus-agent-setup
git commit -m "$(cat <<'EOF'
feat(agent-setup): add prometheus-agent-setup skill and helpers

Adds the skill that installs Prometheus Agent mode per-project, plus
two helpers it uses: platform-detect.sh (canonical platform strings)
and resolve-latest-prometheus.mjs (latest release lookup against the
GitHub API).

Ships prometheus.yml.tmpl (env-substituted at agent startup) and
metrics.env.tmpl (per-project config contract).
EOF
)"
git push
```

---

## Phase 3: `metrics-discovery` skill

**Files:**
- Create: `templates/metrics-plan-template.md`
- Create: `skills/metrics-discovery/SKILL.md`

### Task 3.1: Write the metrics-plan template

- [ ] **Step 1: Write `templates/metrics-plan-template.md`**

```markdown
# Metrics Plan — <project-name>

> Source of truth for what this project measures. Update this file when you
> add, remove, or rename a metric. The integration skills read this file
> when scaffolding instrumentation.

## Worked example (do not delete — used as a reference shape)

### summit_scene_transition_duration_seconds
- **Type:** histogram (classic, scene-duration buckets `[1, 2, 5, 10, 20, 30, 60, 120, 300]`)
- **Labels:** `scene_from`, `scene_to` (cardinality: ~36 — 6×6 transition matrix)
- **Help:** "Time from SCENE_ADVANCE receipt to first rendered frame of next scene"
- **Why:** "p95 catches stuck transitions before the audience notices; would drive a warn alert"
- **Where:** `SceneRouter.svelte`, on scene-key change

---

## <metric_name_1>
- **Type:**
- **Labels:**
- **Help:**
- **Why:**
- **Where:**

## <metric_name_2>
- **Type:**
- **Labels:**
- **Help:**
- **Why:**
- **Where:**
```

### Task 3.2: Write `skills/metrics-discovery/SKILL.md`

**Acceptance criteria:**
- Frontmatter `name: metrics-discovery`, description starting "Use when starting metrics work on a project — produces docs/metrics/metrics-plan.md."
- The skill drives three modes: interview, categorize (catalog), and scan
- Interview has 6–8 questions including "is this deployed in multiple identical instances?"
- Catalog covers seven categories: user flow, scene/state, hardware health, connections, errors, performance, process health
- Code-scan mode is conditional on existing project code
- Skill explicitly loads `prometheus-reference` for type/naming guidance
- Skill offers to invoke an integration skill next but does not auto-jump

- [ ] **Step 1: Write the SKILL.md**

```markdown
---
name: metrics-discovery
description: Use when starting metrics work on a project — produces docs/metrics/metrics-plan.md by interviewing the user, suggesting from a curated catalog of activation-relevant metric categories, and scanning existing code. Always run this before any prometheus-integrate-<stack> skill.
---

# Metrics discovery

This skill produces `docs/metrics/metrics-plan.md` — the source of truth for what the project measures. Every integration skill reads it.

Discovery has three modes that can be mixed. Always load `prometheus-reference` for type recommendations and naming guidance during this skill.

## Mode 1 — Interview

Ask each question in turn (1 per message). Reasonable defaults are fine; the goal is to ground the metric list in the project's actual shape, not produce a comprehensive ethnography.

1. One-line description of the project: what does it do?
2. User-facing surface: booth / kiosk / projection / headless service?
3. Golden path: what does "this is working correctly" look like end-to-end?
4. Top 3 failure modes you've seen or worry about?
5. Is there a clock / scene / phase concept where timing matters?
6. Hardware dependencies (camera, projector, MIDI, sensor, network device)?
7. Throughput-sensitive code paths (per-frame, per-message, per-request)?
8. **Is this deployed in multiple identical instances?** If yes, the agent will set `installation_id` on every metric.

Map answers to metric category suggestions using the catalog below.

## Mode 2 — Categorize (the catalog)

Present the seven categories and ask which apply. For each chosen category, recommend specific metrics from the table, explaining *why* each one matters (not just what it is). The team member picks what to include.

### Categories

**User flow / engagement.** `<app>_sessions_started_total` (counter, label=`entry_point`), `<app>_sessions_completed_total` (counter), `<app>_session_duration_seconds` (histogram), `<app>_abandoned_at_step_total` (counter, label=`step`).

**Scene / state machine.** `<app>_scene_transitions_total` (counter, labels=`from,to`), `<app>_time_in_scene_seconds` (histogram, label=`scene`), `<app>_active_scene` (info gauge with `scene` label set to 1).

**Hardware health.** `<app>_device_connected` (gauge 0/1, label=`device`), `<app>_device_disconnects_total` (counter, label=`device`).

**Hub / connection.** `<app>_ws_clients_connected` (gauge, label=`role`), `<app>_ws_messages_total` (counter, labels=`type,direction`), `<app>_ws_reconnects_total` (counter).

**Errors.** `<app>_errors_total` (counter, labels=`component,kind`), `<app>_unhandled_rejections_total` (counter).

**Performance.** `<app>_frame_duration_seconds` (histogram, frame-time buckets), `<app>_asset_load_seconds` (histogram, label=`asset_kind`), `<app>_render_drops_total` (counter).

**Process health.** `<app>_build_info` (gauge=1, labels=`version,git_sha`). The Prometheus default collectors give you `process_cpu_seconds_total`, `process_resident_memory_bytes`, `process_open_fds`, and `process_start_time_seconds` for free — uptime is `time() - process_start_time_seconds`. Do not invent a separate `uptime_seconds` gauge.

## Mode 3 — Scan (existing code only)

When the project has code already, grep for patterns and propose metrics grounded in what's there. Skip this mode for greenfield projects.

| Grep target | Suggested metric |
|---|---|
| Public route handlers (Express/Fastify/Flask routes, WS message handlers) | `<app>_requests_total{route,method}` counter; `<app>_request_duration_seconds{route,method}` histogram |
| `try { … } catch` blocks and `logger.error(…)` lines | `<app>_errors_total{component,kind}` counter |
| State machine `switch (scene)` / state transitions | `<app>_scene_transitions_total{from,to}` counter + `<app>_active_scene` gauge |
| `setInterval` / `requestAnimationFrame` / event-loop work | duration histogram with appropriate buckets |
| Hardware open/connect calls | connectivity gauge + reconnect counter |

For each proposal: include the actual file path and line range where the metric should be inserted.

## Output

Render `docs/metrics/metrics-plan.md` from `templates/metrics-plan-template.md`. Include the worked-example block at the top — it is the reference shape; do not delete it.

For each metric, fill in:
- **Type** with the recommendation from `prometheus-reference`'s decision tree
- **Labels** with a cardinality estimate
- **Help** as a one-line description (will become the metric's `help` text)
- **Why** as the question the metric answers / the alert it would drive (per Zen #11, "if you can graph it, you can alert on it")
- **Where** with file paths

## Anti-patterns to call out during discovery

- High-cardinality labels (user_id, email, free-form strings, full URLs, timestamps)
- Counters where a gauge is needed, and vice versa (consult `prometheus-reference` §2)
- Metrics without a unit suffix
- "Vanity metrics" with no alert or dashboard purpose — ask: "what would you do if this number changed?"

## After this skill

Offer to invoke `prometheus-integrate-<stack>` next. Do not auto-jump — the user should review the plan first.
```

### Task 3.3: Commit phase 3

- [ ] **Step 1: Stage and commit**

```bash
git add templates/metrics-plan-template.md skills/metrics-discovery
git commit -m "$(cat <<'EOF'
feat(discovery): add metrics-discovery skill and plan template

Discovery skill runs three modes (interview / categorize / scan) and
produces docs/metrics/metrics-plan.md from the template. Template
includes a worked example as a reference shape for the team.

Loads prometheus-reference for type and naming guidance.
EOF
)"
git push
```

---

## Phase 4: Verify scripts + `metrics-verify` skill

**Files:**
- Create: `templates/verify/check-endpoint.mjs`
- Create: `templates/verify/check-endpoint.py`
- Create: `templates/verify/check-cardinality.mjs`
- Create: `templates/verify/check-cardinality.py`
- Create: `templates/verify/check-roundtrip.mjs`
- Create: `tests/render-templates.test.mjs`
- Create: `skills/metrics-verify/SKILL.md`

### Task 4.1: Write `check-endpoint.mjs` (Node side)

- [ ] **Step 1: Write `templates/verify/check-endpoint.mjs`**

```javascript
#!/usr/bin/env node
// check-endpoint.mjs — verifies the app's /metrics endpoint and that the
// local Prometheus agent has scraped it at least once.
//
// Usage: node scripts/verify-metrics.mjs

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
  // Valid Prometheus exposition format has lines starting with # HELP or # TYPE,
  // followed by metric lines `name{labels} value [timestamp]`.
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
```

### Task 4.2: Write `check-endpoint.py` (Python side, same logic)

- [ ] **Step 1: Write `templates/verify/check-endpoint.py`**

```python
#!/usr/bin/env python3
"""check-endpoint.py — same checks as check-endpoint.mjs, for Python projects."""
import os
import re
import sys
from urllib.request import urlopen
from urllib.error import URLError, HTTPError

METRICS_PORT = os.environ.get('METRICS_PORT', '9100')
APP_METRICS_URL = f'http://localhost:{METRICS_PORT}/metrics'
AGENT_METRICS_URL = 'http://localhost:9090/metrics'


def check(name, fn):
    try:
        fn()
        print(f'  ✓ {name}')
        return True
    except Exception as e:
        print(f'  ✗ {name}\n    {e}', file=sys.stderr)
        return False


def fetch_text(url, timeout=3.0):
    try:
        with urlopen(url, timeout=timeout) as r:
            if r.status != 200:
                raise RuntimeError(f'HTTP {r.status} from {url}')
            return r.read().decode('utf-8')
    except (URLError, HTTPError) as e:
        raise RuntimeError(f'fetch {url}: {e}') from e


def looks_like_exposition(text):
    if '# HELP' not in text:
        raise RuntimeError('no `# HELP` lines in response — not exposition format')
    if '# TYPE' not in text:
        raise RuntimeError('no `# TYPE` lines in response — not exposition format')
    lines = [l for l in text.split('\n') if l and not l.startswith('#')]
    if not lines:
        raise RuntimeError('no metric lines in response')


def main():
    print(f'Checking {APP_METRICS_URL} …')
    ok1 = check('app /metrics returns 200', lambda: fetch_text(APP_METRICS_URL))
    ok2 = check('app /metrics is valid exposition format',
                lambda: looks_like_exposition(fetch_text(APP_METRICS_URL)))

    print(f'\nChecking agent at {AGENT_METRICS_URL} …')
    ok3 = check('agent is running and exposes its own /metrics',
                lambda: fetch_text(AGENT_METRICS_URL))

    def check_agent_up():
        text = fetch_text(AGENT_METRICS_URL)
        m = re.search(r'^up\{[^}]*job="app"[^}]*\} (\d+)', text, re.MULTILINE)
        if not m:
            raise RuntimeError('agent has no up{job="app"} metric — is the scrape_config job_name correct?')
        if m.group(1) != '1':
            raise RuntimeError(f'agent shows up{{job="app"}} = {m.group(1)} — agent can see the target but it is not responding')

    ok4 = check('agent reports up{job="app"}=1', check_agent_up)

    if not all([ok1, ok2, ok3, ok4]):
        sys.exit(1)
    print('\nAll local checks passed. Run check-roundtrip.mjs to verify remote ingestion.')


if __name__ == '__main__':
    main()
```

### Task 4.3: Cardinality smoke test (Node)

- [ ] **Step 1: Write `templates/verify/check-cardinality.mjs`**

```javascript
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
  // Strip labels: name{labels} value  →  name
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
```

### Task 4.4: Cardinality smoke test (Python)

- [ ] **Step 1: Write `templates/verify/check-cardinality.py`**

```python
#!/usr/bin/env python3
"""check-cardinality.py — Python equivalent of check-cardinality.mjs."""
import os
import re
import sys
from urllib.request import urlopen

METRICS_PORT = os.environ.get('METRICS_PORT', '9100')
PER_METRIC_LIMIT = 50
TOTAL_LIMIT = 5000

text = urlopen(f'http://localhost:{METRICS_PORT}/metrics').read().decode('utf-8')
metric_lines = [l for l in text.split('\n') if l and not l.startswith('#')]

per_metric = {}
for line in metric_lines:
    m = re.match(r'^([a-zA-Z_:][a-zA-Z0-9_:]*)', line)
    if m:
        per_metric[m.group(1)] = per_metric.get(m.group(1), 0) + 1

total = len(metric_lines)
problems = 0

flag = ' ⚠ exceeds ' + str(TOTAL_LIMIT) if total > TOTAL_LIMIT else ''
print(f'Total series: {total}{flag}')
if total > TOTAL_LIMIT:
    problems += 1

offenders = [(n, c) for n, c in per_metric.items() if c > PER_METRIC_LIMIT]
if not offenders:
    print(f'No single metric exceeds {PER_METRIC_LIMIT} series.')
else:
    print(f'\n⚠ Metrics over {PER_METRIC_LIMIT} series:')
    for name, count in sorted(offenders, key=lambda x: -x[1]):
        print(f'  {name}: {count}')
    print('\nLikely cause: a label with high cardinality (user_id, email, free-form string, timestamp).')
    print('Fix: drop the offending label, or constrain it to a small enum.')
    problems += 1

if problems > 0:
    sys.exit(1)
```

### Task 4.5: End-to-end round-trip (single shared script)

- [ ] **Step 1: Write `templates/verify/check-roundtrip.mjs`**

```javascript
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

// 1. Bump the sentinel on the app.
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
```

### Task 4.6: Add a test that the templates parse and shell-out cleanly

- [ ] **Step 1: Write `tests/render-templates.test.mjs`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('prometheus.yml.tmpl is valid YAML with ${VAR} substitution markers', () => {
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
```

- [ ] **Step 2: Run the test**

```bash
node --test tests/render-templates.test.mjs
```
Expected: PASS (3/3).

### Task 4.7: Write `skills/metrics-verify/SKILL.md`

- [ ] **Step 1: Write the SKILL.md**

```markdown
---
name: metrics-verify
description: Use after running an integration skill to confirm the full pipeline works — app /metrics exposition, agent scraping, agent reaching remote endpoint, end-to-end round-trip via the read API, and a cardinality smoke test. Also use when metrics aren't appearing in Grafana and you need a diagnostic.
---

# Metrics verify

Runs five checks against the current project. Each check fails fast with a clear remediation message.

## Procedure

1. **Detect stack.** Read `package.json` / `requirements.txt` / `.toe` presence to decide whether to run the `.mjs` or `.py` variants.

2. **Copy verify scripts into the project.** From `templates/verify/`:
   - For Node: `check-endpoint.mjs`, `check-cardinality.mjs`, `check-roundtrip.mjs` → `scripts/verify/`
   - For Python: `check-endpoint.py`, `check-cardinality.py`, `check-roundtrip.mjs` → `scripts/verify/` (round-trip is JS regardless — it speaks HTTP, no language-specific deps)
   - For TouchDesigner: same as Python (run outside TD)

3. **Run check 1 — exposition format.** `node scripts/verify/check-endpoint.mjs` (or `.py`). Confirms app responds, returns valid exposition, agent is up.

4. **Run check 2 — agent scraping the target.** Part of check-endpoint above (`up{job="app"}=1`).

5. **Run check 3 — agent reaching remote_write.** Inspect the agent's own metrics (`prometheus_remote_storage_samples_total{remote_name=…}` increasing, `prometheus_remote_storage_samples_failed_total` near zero).

6. **Run check 4 — end-to-end round-trip.** `node scripts/verify/check-roundtrip.mjs`. Bumps a sentinel `bootstrap_verify_ts` and queries the remote endpoint's read API for it. This requires the integration skill to have installed a temporary `/internal/metrics-verify-bump` route on the app; if absent, instruct the user to re-run their integration skill.

7. **Run check 5 — cardinality smoke test.** `node scripts/verify/check-cardinality.mjs`. Warns if any single metric exceeds 50 series or total series exceeds 5000. Cardinality bugs are silent until billing arrives.

## Reading the output

- All five checks pass → metrics are reaching the hosted endpoint and your label hygiene is healthy.
- Check 1 fails → app not running, wrong port, or `/metrics` route missing.
- Check 2 fails (`up=0`) → agent can see the target host but the app isn't responding on the configured port.
- Check 3 fails (samples_failed increasing) → wrong remote_write URL, wrong auth, or remote endpoint rejecting payloads.
- Check 4 fails → samples are being sent but not arriving; likely the read URL derivation is wrong for your hosted endpoint.
- Check 5 fails → see `prometheus-reference` § "Label hygiene" — drop the offending label or constrain it to an enum.

## What this skill does NOT do

- Restart the agent (must be done manually after `.env` changes)
- Modify the app's metrics module (use `prometheus-integrate-<stack>` for that)
- Generate dashboards (use `metrics-dashboard`)
```

### Task 4.8: Commit phase 4

- [ ] **Step 1: Stage and commit**

```bash
git add templates/verify tests/render-templates.test.mjs skills/metrics-verify
git commit -m "$(cat <<'EOF'
feat(verify): add metrics-verify skill and the five verify scripts

Scripts: check-endpoint (exposition + agent scrape), check-cardinality
(per-metric and total series caps), check-roundtrip (push sentinel,
query back via read API).

Templates ship in both Node and Python variants; round-trip is
language-agnostic.
EOF
)"
git push
```

---

## Phase 5: `prometheus-integrate-node` skill

**Files:**
- Create: `templates/node/metrics-module.ts.tmpl`
- Create: `templates/node/metrics-route.ts.tmpl`
- Create: `templates/node/verify-bump-route.ts.tmpl`
- Create: `skills/prometheus-integrate-node/SKILL.md`
- Create: `test-fixtures/node-minimal/` skeleton

### Task 5.1: Write the Node metrics module template

- [ ] **Step 1: Write `templates/node/metrics-module.ts.tmpl`**

```typescript
// Generated by acro-claude-metrics → prometheus-integrate-node.
// Single import surface for the rest of the project.
// Edit instrumentation in place; re-running the skill will not overwrite this file.

import { register, collectDefaultMetrics, Counter, Gauge, Histogram } from 'prom-client';

// Default process / Node.js metrics — gives you CPU, RSS memory, FDs, GC,
// and process_start_time_seconds for free. Uptime = time() - process_start_time_seconds.
collectDefaultMetrics({ register });

// Build info — always 1; labels carry version + git SHA.
new Gauge({
  name: '${APP_PREFIX}_build_info',
  help: 'Build information (always 1; useful for the version label).',
  labelNames: ['version', 'git_sha'],
  registers: [register],
})
  .labels(process.env.npm_package_version || 'unknown', process.env.GIT_SHA || 'unknown')
  .set(1);

// --- Metrics from metrics-plan.md ---
// One declaration per metric. The integration skill scaffolds stubs; you
// instrument the call sites by hand (see "Where" field in metrics-plan.md).

// Example (delete me, replace with your own):
// export const sceneTransitions = new Counter({
//   name: '${APP_PREFIX}_scene_transitions_total',
//   help: 'Scene transitions in the experience flow.',
//   labelNames: ['from', 'to'],
//   registers: [register],
// });
//
// CAUTION on counters: never call counter.reset() unless you fully understand
// the implication for rate(). On RESET-type flows, use a Gauge, not a Counter.

export { register };
```

### Task 5.2: Write the metrics route template

- [ ] **Step 1: Write `templates/node/metrics-route.ts.tmpl`**

```typescript
// Mount on your existing Express / Fastify / http server.
// For Express:
//   import express from 'express';
//   import { register } from './metrics/index.js';
//   import { metricsHandler } from './metrics/route.js';
//   app.get('/metrics', metricsHandler);
//
// The Content-Type must be exactly `text/plain; version=0.0.4` for compatibility.

import type { Request, Response } from 'express';
import { register } from './index.js';

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  res.setHeader('Content-Type', register.contentType);
  res.end(await register.metrics());
}
```

### Task 5.3: Write the verify-bump route template

- [ ] **Step 1: Write `templates/node/verify-bump-route.ts.tmpl`**

```typescript
// Mounts a /internal/metrics-verify-bump?ts=<unix> route used by
// scripts/verify/check-roundtrip.mjs. Updates a single gauge so that the
// round-trip check has something to query back.
//
// Do NOT expose this route publicly — bind only to localhost in production.

import type { Request, Response, Express } from 'express';
import { Gauge } from 'prom-client';
import { register } from './index.js';

const verifyGauge = new Gauge({
  name: 'bootstrap_verify_ts',
  help: 'Updated by check-roundtrip.mjs to test end-to-end ingestion.',
  registers: [register],
});

export function mountVerifyBump(app: Express): void {
  app.post('/internal/metrics-verify-bump', (req: Request, res: Response) => {
    const ts = Number(req.query.ts);
    if (!Number.isFinite(ts)) {
      res.status(400).send('ts query param required');
      return;
    }
    verifyGauge.set(ts);
    res.status(204).end();
  });
}
```

### Task 5.4: Build the minimal fixture

- [ ] **Step 1: Create `test-fixtures/node-minimal/`**

```bash
mkdir -p test-fixtures/node-minimal
cat > test-fixtures/node-minimal/package.json <<'JSON'
{
  "name": "node-minimal-fixture",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": { "start": "node server.js" },
  "dependencies": { "express": "^4.21.0" }
}
JSON

cat > test-fixtures/node-minimal/server.js <<'JS'
import express from 'express';
const app = express();
app.get('/', (_, r) => r.send('hello'));
app.listen(3000, () => console.log('fixture listening on 3000'));
JS
```

### Task 5.5: Write `skills/prometheus-integrate-node/SKILL.md`

**Acceptance criteria (when invoked against `test-fixtures/node-minimal/`):**
- Installs `prom-client` (modifies `package.json`)
- Creates `src/metrics/index.ts` from template with `${APP_PREFIX}` substituted from `METRICS_PROJECT` or asked
- Mounts `/metrics` route on the existing Express app
- Mounts `/internal/metrics-verify-bump` route
- Adds `verify-bump` route is bound only to localhost (or warns if it can't tell)
- Copies verify scripts into `scripts/verify/`
- Runs `node scripts/verify/check-endpoint.mjs` and reports the result
- Does not overwrite `src/metrics/index.ts` if it already exists; surfaces a diff instead

- [ ] **Step 1: Write the SKILL.md**

```markdown
---
name: prometheus-integrate-node
description: Use when adding Prometheus metrics to a Node.js project (Express, Fastify, generic http). Installs prom-client, scaffolds the metrics module, mounts /metrics and /internal/metrics-verify-bump routes, instantiates default collectors and build_info, generates stub declarations from docs/metrics/metrics-plan.md, and runs verification.
---

# Integrate Prometheus into a Node project

## Preflight

1. Confirm the cwd has a `package.json` and at least one of: `src/` directory, top-level `.ts`/`.js` entry point.
2. Confirm `docs/metrics/metrics-plan.md` exists. If not, instruct the user to run `metrics-discovery` first or accept the minimal default plan (just `build_info` and default collectors).
3. Confirm the agent is set up (`tools/prometheus-agent/prometheus.yml` exists). If not, instruct to run `prometheus-agent-setup` first.

## Procedure

1. **Install `prom-client`.** Run `npm install prom-client`. Confirm it appears in `package.json` dependencies (not devDependencies).

2. **Decide the app prefix.** From the metrics plan if available; otherwise derive from `package.json` `name` (snake_case, single word: `summit-2026` → `summit`). Confirm with the user before committing.

3. **Scaffold `src/metrics/index.ts`.** Copy `templates/node/metrics-module.ts.tmpl`, substitute `${APP_PREFIX}`. If the file exists, do NOT overwrite — print a diff and let the user merge.

4. **Scaffold `src/metrics/route.ts`** from `templates/node/metrics-route.ts.tmpl`.

5. **Scaffold `src/metrics/verify-bump.ts`** from `templates/node/verify-bump-route.ts.tmpl`.

6. **Wire the routes.** Locate the existing app's main file (`server.ts`, `index.ts`, `app.ts`). Add (preserving the user's import style):
   - `import { register } from './metrics/index.js';`
   - `import { metricsHandler } from './metrics/route.js';`
   - `import { mountVerifyBump } from './metrics/verify-bump.js';`
   - `app.get('/metrics', metricsHandler);`
   - `mountVerifyBump(app);`

7. **Add verify-bump localhost safety check.** Confirm the app binds to `0.0.0.0` only by deliberate choice (read the listen call). If it does, print a warning that `/internal/*` routes are reachable from outside the host and recommend an `if (req.ip !== '127.0.0.1') return 403` guard or a separate localhost-only listener.

8. **Generate metric stubs from the plan.** Parse `docs/metrics/metrics-plan.md`. For each metric, append a TypeScript declaration to `src/metrics/index.ts` (above the `export { register }` line) with a `// TODO: instrument at <Where>` comment.

9. **Copy verify scripts.** `cp templates/verify/check-*.mjs <project>/scripts/verify/`.

10. **Run verification.** `node scripts/verify/check-endpoint.mjs`. Report the result and instruct the user how to run `check-roundtrip.mjs` once `.env` is filled in.

11. **Print the operator checklist.** What's instrumented (e.g., "default Node metrics + build_info"), what's still TODO (the list of stub declarations the user needs to wire), where the verify script lives, what `.env` keys need real values.

## Counter safety

When you scaffold a Counter stub, include the inline comment:
```ts
// Never call counter.reset() — it makes rate() spike. For resettable counts,
// use a Gauge and .set(value) instead.
```

## What this skill does NOT do

- Decide what to measure (use `metrics-discovery`)
- Configure the agent (use `prometheus-agent-setup`)
- Generate dashboards (use `metrics-dashboard`)
```

### Task 5.6: Manual verification against the fixture

- [ ] **Step 1: Run the skill against the fixture, manually verify outputs**

In a fresh Claude Code session (or by invoking the skill as the user would):

1. `cd test-fixtures/node-minimal && npm install`
2. Invoke the `prometheus-integrate-node` skill with `METRICS_PROJECT=fixture METRICS_INSTALLATION_ID=01`
3. Confirm:
   - `package.json` now includes `prom-client`
   - `src/metrics/index.ts` exists and is syntactically valid (`node --check`)
   - `server.js` (or new `server.ts`) mounts both routes
   - `scripts/verify/check-endpoint.mjs` exists
   - Running `npm start` followed by `node scripts/verify/check-endpoint.mjs` passes checks 1 and 2 (3 and 4 require the agent running)

This step is manual — no automated test. Document any issues encountered as inline comments in the SKILL.md and re-run.

### Task 5.7: Commit phase 5

- [ ] **Step 1: Stage and commit**

```bash
git add templates/node skills/prometheus-integrate-node test-fixtures/node-minimal
git commit -m "$(cat <<'EOF'
feat(integrate-node): add prometheus-integrate-node skill

Scaffolds prom-client metrics module + /metrics route + verify-bump
route for round-trip checking. Default collectors enabled (process_*,
nodejs_*); build_info gauge with version + git_sha labels.

Counter-reset safety warning included in scaffolded module.
EOF
)"
git push
```

---

## Phase 6: `prometheus-integrate-browser` skill

**Files:**
- Create: `templates/browser/metrics-client.ts.tmpl`
- Create: `templates/browser/relay-route.ts.tmpl`
- Create: `skills/prometheus-integrate-browser/SKILL.md`

### Task 6.1: Write the in-browser client template

- [ ] **Step 1: Write `templates/browser/metrics-client.ts.tmpl`**

```typescript
// In-browser metrics client. Batches updates and flushes via fetch / sendBeacon
// to the Node server's /internal/metrics-relay route.
//
// Allowed metric names and labels are validated server-side; this client
// must use names and label values registered in src/metrics/relay-allowlist.ts.

const RELAY_URL = '/internal/metrics-relay';
const FLUSH_INTERVAL_MS = 5000;
const FLUSH_BATCH_LIMIT = 100;

type Sample = {
  metric: string;
  type: 'counter' | 'gauge' | 'histogram';
  labels: Record<string, string>;
  value: number;
};

let buffer: Sample[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
}

function push(sample: Sample): void {
  buffer.push(sample);
  if (buffer.length >= FLUSH_BATCH_LIMIT) flush();
  else scheduleFlush();
}

export function flush(): void {
  if (buffer.length === 0) return;
  const payload = JSON.stringify(buffer);
  buffer = [];
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }

  // Prefer sendBeacon on page-hide for delivery without blocking nav.
  if (document.visibilityState === 'hidden' && 'sendBeacon' in navigator) {
    navigator.sendBeacon(RELAY_URL, new Blob([payload], { type: 'application/json' }));
  } else {
    fetch(RELAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => { /* swallow — metrics are best-effort */ });
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});

export function incr(metric: string, labels: Record<string, string> = {}, by = 1): void {
  push({ metric, type: 'counter', labels, value: by });
}

export function set(metric: string, value: number, labels: Record<string, string> = {}): void {
  push({ metric, type: 'gauge', labels, value });
}

export function observe(metric: string, value: number, labels: Record<string, string> = {}): void {
  push({ metric, type: 'histogram', labels, value });
}
```

### Task 6.2: Write the relay route template

- [ ] **Step 1: Write `templates/browser/relay-route.ts.tmpl`**

```typescript
// Server-side relay endpoint. Validates incoming browser samples against
// a strict allowlist BEFORE updating the server's prom-client registry —
// without the allowlist, a browser can inject arbitrary label values and
// blow up cardinality.

import type { Express, Request, Response } from 'express';
import { Counter, Gauge, Histogram, register } from 'prom-client';
import { RELAY_ALLOWLIST, type RelayMetricSpec } from './relay-allowlist.js';

// Build prom-client metrics from the allowlist at startup so they exist
// with zero values before any browser pushes.
const instruments = new Map<string, Counter<string> | Gauge<string> | Histogram<string>>();
for (const spec of RELAY_ALLOWLIST) {
  const labelNames = Object.keys(spec.labels);
  let m: Counter<string> | Gauge<string> | Histogram<string>;
  switch (spec.type) {
    case 'counter':
      m = new Counter({ name: spec.name, help: spec.help, labelNames, registers: [register] });
      break;
    case 'gauge':
      m = new Gauge({ name: spec.name, help: spec.help, labelNames, registers: [register] });
      break;
    case 'histogram':
      m = new Histogram({ name: spec.name, help: spec.help, labelNames, buckets: spec.buckets ?? [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10], registers: [register] });
      break;
  }
  instruments.set(spec.name, m);
}

const allowlistByName = new Map<string, RelayMetricSpec>();
for (const s of RELAY_ALLOWLIST) allowlistByName.set(s.name, s);

function validate(sample: { metric: string; type: string; labels: Record<string, string>; value: number }): string | null {
  const spec = allowlistByName.get(sample.metric);
  if (!spec) return `unknown metric: ${sample.metric}`;
  if (spec.type !== sample.type) return `metric ${sample.metric} expects type=${spec.type}, got ${sample.type}`;
  for (const [k, v] of Object.entries(sample.labels)) {
    const allowed = spec.labels[k];
    if (!allowed) return `label ${k} not allowed on ${sample.metric}`;
    if (!allowed.includes(v)) return `label ${k}=${v} not in allowed values for ${sample.metric}`;
  }
  if (typeof sample.value !== 'number' || !Number.isFinite(sample.value)) return `invalid value: ${sample.value}`;
  return null;
}

export function mountMetricsRelay(app: Express): void {
  app.post('/internal/metrics-relay', (req: Request, res: Response) => {
    const samples = Array.isArray(req.body) ? req.body : [];
    let accepted = 0;
    for (const s of samples) {
      const err = validate(s);
      if (err) {
        // Silent reject — do not echo back labels, do not log per-sample (log volume).
        continue;
      }
      const m = instruments.get(s.metric)!;
      const labels = s.labels;
      if (s.type === 'counter') (m as Counter<string>).inc(labels, s.value);
      else if (s.type === 'gauge') (m as Gauge<string>).set(labels, s.value);
      else if (s.type === 'histogram') (m as Histogram<string>).observe(labels, s.value);
      accepted++;
    }
    res.status(204).end();
  });
}
```

The accompanying `relay-allowlist.ts` is project-specific; the integration skill scaffolds an empty allowlist file with comments showing the expected shape:

```typescript
export type RelayMetricSpec = {
  name: string;
  type: 'counter' | 'gauge' | 'histogram';
  help: string;
  labels: Record<string, readonly string[]>;
  buckets?: number[];
};

export const RELAY_ALLOWLIST: RelayMetricSpec[] = [
  // {
  //   name: 'summit_browser_action_total',
  //   type: 'counter',
  //   help: 'User-initiated browser actions.',
  //   labels: {
  //     action: ['click_start', 'click_continue', 'tap_card'] as const,
  //     archetype: ['deep-diver', 'pivoter', 'visionary'] as const,
  //   },
  // },
];
```

### Task 6.3: Write `skills/prometheus-integrate-browser/SKILL.md`

- [ ] **Step 1: Write the SKILL.md**

```markdown
---
name: prometheus-integrate-browser
description: Use when adding browser-side metrics to a project that already has the Node integration. Scaffolds the in-browser client (counter/gauge/histogram batched POST), the server-side relay route with a strict label-value allowlist, and explains the CORS / cardinality reasoning behind the design.
---

# Integrate Prometheus into the browser

> **Depends on `prometheus-integrate-node`.** The relay route lives in the Node server, and the agent scrapes the Node `/metrics` endpoint to ingest browser-relayed data.

## Why a relay (not direct push)?

Browsers cannot speak Prometheus remote_write directly — the protocol needs snappy compression + protobuf serialization + server-side auth secrets. Posting JSON to your own server's relay route is the standard pattern; the relay updates server-side prom-client metrics, and the agent scrapes those.

## Why an allowlist?

If the relay accepted any metric name and any label value, a browser tab — even a malicious one — could inject arbitrary label values and explode metric cardinality. The allowlist constrains each browser-pushable metric to a specific set of label keys and label values. No unknown metric, no unknown label, no unknown value gets in.

## Preflight

1. Confirm Node integration is installed (`src/metrics/index.ts` exists).
2. Confirm a browser app exists (`src/lib/`, `src/components/`, or similar). If the project is server-only, this skill is not applicable.

## Procedure

1. **Scaffold the client.** Copy `templates/browser/metrics-client.ts.tmpl` to `src/lib/metrics.ts` (or the project's idiomatic frontend lib location).

2. **Scaffold the relay route and allowlist.** Copy `templates/browser/relay-route.ts.tmpl` to `src/metrics/relay-route.ts`. Write an empty `src/metrics/relay-allowlist.ts` with the type signature and an example metric in a comment block.

3. **Mount the relay.** Add to the Node server entry file:
   - `import { mountMetricsRelay } from './metrics/relay-route.js';`
   - `app.use(express.json({ limit: '64kb' }));` (if not already present)
   - `mountMetricsRelay(app);`

4. **Populate the allowlist from `metrics-plan.md`.** For each metric in the plan that the *browser* will emit, add an entry to `RELAY_ALLOWLIST` with its full set of allowed label values. Browser-emitted metrics in the plan should be tagged `(browser)` in the "Where" field.

5. **Print scrape-staleness note.** Browser metric updates are scraped on the agent's interval (15s). Frame this in the operator checklist: "Browser counters lag up to 15 seconds in Grafana — they're not live."

## Anti-patterns

- Adding a label to the allowlist with values like `string` or `any` — defeats the purpose. Every label value must be enumerated.
- Adding metrics to the allowlist that aren't in `metrics-plan.md` — discovery is the source of truth.
- Putting `user_id` or `session_id` as a label — high cardinality, banned.

## What this skill does NOT do

- Modify the Node integration (preflight requires it; this skill only adds files alongside)
- Authenticate browser pushes (the relay is open by design; add your own auth if you have one)
- Configure the agent (no change needed; the agent already scrapes the Node `/metrics` endpoint)
```

### Task 6.4: Commit phase 6

- [ ] **Step 1: Stage and commit**

```bash
git add templates/browser skills/prometheus-integrate-browser
git commit -m "$(cat <<'EOF'
feat(integrate-browser): add prometheus-integrate-browser skill

In-browser client batches counter/gauge/histogram updates and flushes
to /internal/metrics-relay (5s tick + on page hide).

Server relay validates every sample against a strict allowlist of
metric names + label keys + label values. Unknown anything is silently
dropped. Prevents browser-driven cardinality explosion.
EOF
)"
git push
```

---

## Phase 7: `prometheus-integrate-python` skill

**Files:**
- Create: `templates/python/metrics-module.py.tmpl`
- Create: `templates/python/verify-bump-route.py.tmpl`
- Create: `skills/prometheus-integrate-python/SKILL.md`
- Create: `test-fixtures/python-minimal/`

### Task 7.1: Write the Python metrics module template

- [ ] **Step 1: Write `templates/python/metrics-module.py.tmpl`**

```python
"""Generated by acro-claude-metrics → prometheus-integrate-python.
Single import surface for the rest of the project.

For services on gunicorn / uvicorn with multiple workers, set the
PROMETHEUS_MULTIPROC_DIR env var BEFORE starting and switch to
multiprocess.MultiProcessCollector. See spec § Per-stack → Python.
"""
import os
from prometheus_client import (
    CollectorRegistry, REGISTRY, Counter, Gauge, Histogram,
    start_http_server,
)
from prometheus_client.process_collector import ProcessCollector
from prometheus_client.platform_collector import PlatformCollector

# Default collectors — process_cpu_seconds_total, process_resident_memory_bytes,
# process_open_fds, process_start_time_seconds. Uptime = time() - process_start_time_seconds.
ProcessCollector(registry=REGISTRY)
PlatformCollector(registry=REGISTRY)

# Build info — always 1; labels carry version + git SHA.
BUILD_INFO = Gauge('${APP_PREFIX}_build_info', 'Build info (always 1).', ['version', 'git_sha'])
BUILD_INFO.labels(
    version=os.environ.get('APP_VERSION', 'unknown'),
    git_sha=os.environ.get('GIT_SHA', 'unknown'),
).set(1)

# Bootstrap verify gauge — used by scripts/verify/check-roundtrip.mjs.
BOOTSTRAP_VERIFY_TS = Gauge('bootstrap_verify_ts', 'Set by check-roundtrip to test ingestion.')

# --- Metrics from metrics-plan.md ---
# (Add Counter / Gauge / Histogram declarations here. See "Where" field in plan.)

def start_metrics_server() -> None:
    """Start the HTTP server that exposes /metrics. Call once at app startup."""
    port = int(os.environ.get('METRICS_PORT', '9100'))
    start_http_server(port)
```

### Task 7.2: Write the Python verify-bump helper

The Python equivalent is a small HTTP handler the user mounts on their existing framework. For maximum framework neutrality, scaffold it as Flask + FastAPI variants. Skill picks based on detected framework.

- [ ] **Step 1: Write `templates/python/verify-bump-route.py.tmpl`**

```python
"""Mount on Flask/FastAPI/etc. Mirrors templates/node/verify-bump-route.ts.tmpl."""
# Flask:
#   from .metrics import BOOTSTRAP_VERIFY_TS
#   from flask import Flask, request
#   app = Flask(__name__)
#   @app.post('/internal/metrics-verify-bump')
#   def metrics_verify_bump():
#       ts = float(request.args.get('ts', 0))
#       if not ts:
#           return ('ts query param required', 400)
#       BOOTSTRAP_VERIFY_TS.set(ts)
#       return ('', 204)
#
# FastAPI:
#   from fastapi import FastAPI, Query
#   from .metrics import BOOTSTRAP_VERIFY_TS
#   app = FastAPI()
#   @app.post('/internal/metrics-verify-bump')
#   def metrics_verify_bump(ts: float = Query(...)):
#       BOOTSTRAP_VERIFY_TS.set(ts)
#       return Response(status_code=204)
```

### Task 7.3: Build the Python fixture

- [ ] **Step 1: Create `test-fixtures/python-minimal/`**

```bash
mkdir -p test-fixtures/python-minimal
cat > test-fixtures/python-minimal/requirements.txt <<'TXT'
flask>=3.0
TXT
cat > test-fixtures/python-minimal/app.py <<'PY'
from flask import Flask
app = Flask(__name__)
@app.get('/')
def home(): return 'hello'
if __name__ == '__main__':
    app.run(port=3000)
PY
```

### Task 7.4: Write `skills/prometheus-integrate-python/SKILL.md`

- [ ] **Step 1: Write the SKILL.md**

```markdown
---
name: prometheus-integrate-python
description: Use when adding Prometheus metrics to a Python project (Flask, FastAPI, scripts, CLI). Installs prometheus_client, scaffolds the metrics module with default collectors and build_info, starts the metrics HTTP server, generates stubs from metrics-plan.md, and runs verification.
---

# Integrate Prometheus into a Python project

## Preflight

1. Confirm `requirements.txt` or `pyproject.toml` exists.
2. Confirm `docs/metrics/metrics-plan.md` exists (or accept minimal default plan).
3. Confirm `prometheus-agent-setup` has been run.
4. Detect framework: Flask vs FastAPI vs plain script. Affects how the verify-bump handler is wired.

## Procedure

1. **Add `prometheus_client` to deps.** Append to `requirements.txt` or run `pip install prometheus_client` and update `pyproject.toml`.

2. **Decide the app prefix.** From metrics plan or derived from package name.

3. **Scaffold `app/metrics.py`.** Copy `templates/python/metrics-module.py.tmpl`, substitute `${APP_PREFIX}`. Place under `app/` (or the project's idiomatic package).

4. **Wire the metrics server.** Add at app startup (before serving requests):
   ```python
   from app.metrics import start_metrics_server
   start_metrics_server()
   ```

5. **Wire the verify-bump route** based on detected framework. For Flask, register a `/internal/metrics-verify-bump` POST handler using the snippet in the template. For FastAPI, use the FastAPI variant. For pure scripts, skip (no HTTP server to mount onto; round-trip verify won't apply).

6. **For multi-worker setups** (gunicorn / uvicorn with `--workers > 1`): set `PROMETHEUS_MULTIPROC_DIR=/tmp/prom-multiproc` in the agent's launch script, switch to `multiprocess.MultiProcessCollector(registry)` in `app/metrics.py`, and document the cleanup-on-startup requirement (clear the multiproc dir before each launch).

7. **Generate metric stubs.** Parse `docs/metrics/metrics-plan.md`. For each metric, append a `Counter` / `Gauge` / `Histogram` declaration with a `# TODO: instrument at <Where>` comment.

8. **Copy verify scripts.** `cp templates/verify/check-*.py templates/verify/check-roundtrip.mjs <project>/scripts/verify/`.

9. **Run verification.** `python3 scripts/verify/check-endpoint.py`.

10. **Print the operator checklist.**

## What this skill does NOT do

- Decide what to measure (use `metrics-discovery`)
- Configure the agent (use `prometheus-agent-setup`)
- Manage multiprocess cleanup beyond the documented startup step
- Cover Django specifically — Django's request hooks differ; if needed, follow the Flask shape and adapt
```

### Task 7.5: Commit phase 7

- [ ] **Step 1: Stage and commit**

```bash
git add templates/python skills/prometheus-integrate-python test-fixtures/python-minimal
git commit -m "$(cat <<'EOF'
feat(integrate-python): add prometheus-integrate-python skill

Scaffolds prometheus_client metrics module + start_http_server +
verify-bump route. Default ProcessCollector + PlatformCollector
enabled. Framework detection picks Flask vs FastAPI verify-bump
variant.

Multiprocess (gunicorn/uvicorn) configuration documented in the
skill body.
EOF
)"
git push
```

---

## Phase 8: `prometheus-integrate-touchdesigner` skill

**Files:**
- Create: `templates/touchdesigner/MetricsExt.py.tmpl`
- Create: `templates/touchdesigner/MetricsConfig-params.md`
- Create: `skills/prometheus-integrate-touchdesigner/SKILL.md`
- Create: `test-fixtures/touchdesigner-readme.md`

### Task 8.1: Write the MetricsExt template

- [ ] **Step 1: Write `templates/touchdesigner/MetricsExt.py.tmpl`**

```python
"""MetricsExt — TouchDesigner COMP extension wrapping prometheus_client.

Attach to a Container COMP. That same COMP carries the custom parameters
(Metricsport, Project, Env, Installationid, Appversion, Gitsha, Vendorpath).
The extension reads them at init and starts an HTTP server thread.

CARDINALITY WARNING:
Labels MUST be a small known set (enums). Never label with op_path, par_name,
asset filename, frame index, or anything that varies per-tick — this will OOM
the local Prometheus agent within minutes.

If pip-install of prometheus_client is unavailable in your TD's Python, vendor
the package into a folder and set the Vendorpath parameter to point at it.
"""
import os
import sys
import time

# Histogram instances live in a separate dict from counters/gauges to avoid
# name collisions if a project ever has a histogram and a counter sharing a name.
_COUNTER_GAUGE = {}
_HISTOGRAM = {}


class MetricsExt:
    def __init__(self, ownerComp):
        self.ownerComp = ownerComp
        self._started = False

        # Vendored-package fallback. Skill writes the path here when pip is unavailable.
        vendor = ownerComp.par.Vendorpath.eval() if hasattr(ownerComp.par, 'Vendorpath') else ''
        if vendor and os.path.isdir(vendor) and vendor not in sys.path:
            sys.path.insert(0, vendor)

        from prometheus_client import Counter, Gauge, Histogram, start_http_server
        self._Counter, self._Gauge, self._Histogram = Counter, Gauge, Histogram

        # Build info from COMP parameters.
        Gauge('${APP_PREFIX}_build_info', 'Build info (always 1).', ['version', 'git_sha']).labels(
            version=ownerComp.par.Appversion.eval() or 'unknown',
            git_sha=ownerComp.par.Gitsha.eval() or 'unknown',
        ).set(1)

        # Health gauge — verify script checks this to confirm the extension is firing.
        self._flush_ts = Gauge('td_metrics_flush_ts', 'Last extension tick timestamp (unix seconds).')

        port = int(ownerComp.par.Metricsport.eval() or 9100)
        try:
            start_http_server(port)
            self._started = True
            debug(f'MetricsExt: serving /metrics on :{port}')
        except OSError as e:
            debug(f'MetricsExt: could not bind :{port} ({e}); metrics disabled')

    # --- public API ---

    def Counter(self, name: str, help_: str, label_names=()):
        return _COUNTER_GAUGE.setdefault(name, self._Counter(name, help_, label_names))

    def Gauge(self, name: str, help_: str, label_names=()):
        return _COUNTER_GAUGE.setdefault(name, self._Gauge(name, help_, label_names))

    def Histogram(self, name: str, help_: str, label_names=(), buckets=None):
        if name in _HISTOGRAM:
            return _HISTOGRAM[name]
        h = self._Histogram(name, help_, label_names, buckets=buckets) if buckets else self._Histogram(name, help_, label_names)
        _HISTOGRAM[name] = h
        return h

    def Incr(self, name: str, labels: dict | None = None, by: float = 1.0):
        m = _COUNTER_GAUGE.get(name)
        if m is None: return
        (m.labels(**labels) if labels else m).inc(by)

    def Set(self, name: str, labels: dict | None = None, value: float = 0):
        m = _COUNTER_GAUGE.get(name)
        if m is None: return
        (m.labels(**labels) if labels else m).set(value)

    def Observe(self, name: str, labels: dict | None = None, value: float = 0):
        m = _HISTOGRAM.get(name)
        if m is None: return
        (m.labels(**labels) if labels else m).observe(value)

    def OnTick(self):
        """Called by a Timer CHOP every N seconds. Updates the health gauge."""
        self._flush_ts.set(time.time())
```

- [ ] **Step 2: Write `templates/touchdesigner/MetricsConfig-params.md`**

```markdown
# MetricsExt COMP parameters

The same COMP that hosts the `MetricsExt` extension also carries its custom
parameters. (One COMP, fewer moving parts.) Add these via
`Customize Component...` on the MetricsExt Container COMP:

| Name | Type | Default | Notes |
|---|---|---|---|
| `Metricsport` | Int | 9100 | Port for the in-TD HTTP server exposing /metrics |
| `Project` | Str | (your project) | Logical project name. Mirrors METRICS_PROJECT in .env. |
| `Env` | Menu | dev | dev / staging / prod. Mirrors METRICS_ENV. |
| `Installationid` | Str |  | Optional. Multi-instance identifier. Mirrors METRICS_INSTALLATION_ID. |
| `Appversion` | Str |  | Read by build_info gauge. |
| `Gitsha` | Str |  | Read by build_info gauge. |
| `Vendorpath` | Folder |  | Optional. Path to vendored prometheus_client folder if pip isn't available. |

These mirror the `.env` values for visibility inside TD — they don't replace
the agent's config. The agent still reads `.env`; these parameters are for
the in-TD `MetricsExt` extension's own use.

The extension reads them via `ownerComp.par.Metricsport.eval()`, etc.
```

### Task 8.2: Write `skills/prometheus-integrate-touchdesigner/SKILL.md`

- [ ] **Step 1: Write the SKILL.md**

```markdown
---
name: prometheus-integrate-touchdesigner
description: Use when adding Prometheus metrics to a TouchDesigner project. Installs prometheus_client into TD's Python (or vendors it), scaffolds a MetricsExt COMP extension that exposes /metrics, adds custom parameters mirroring .env onto the same COMP, wires a Timer CHOP for health-gauge updates.
---

# Integrate Prometheus into TouchDesigner

> TouchDesigner is the highest-cardinality risk surface in this plugin. Read the warning at the top of `MetricsExt.py.tmpl` and the spec § "Per-stack → TouchDesigner specifics" before you label anything.

## Preflight

1. Confirm a `.toe` file is present (or the user is editing a live TD project — the skill can't open the file itself; it scaffolds Python text and provides import instructions).
2. Confirm `docs/metrics/metrics-plan.md` exists (or accept minimal default).
3. Confirm `prometheus-agent-setup` has been run.

## Procedure

1. **Install `prometheus_client` into TD's Python.** Try `<TD>/bin/python3 -m pip install prometheus_client` (path varies by OS). If pip is unavailable in your TD build, vendor the package: `pip install prometheus_client --target ./tools/td-vendor/` and set the `Vendorpath` parameter on `MetricsExt` to that folder.

2. **Scaffold `MetricsExt.py`.** Copy `templates/touchdesigner/MetricsExt.py.tmpl` to `<project>/td/MetricsExt.py`. Substitute `${APP_PREFIX}`.

3. **Document the COMP parameters.** Copy `templates/touchdesigner/MetricsConfig-params.md` to `<project>/td/README-metrics.md`. The team member follows this to create the COMP and add its custom parameters by hand inside TD (we can't automate TD edits from outside).

4. **Print the in-TD wiring steps.**

   1. Create a Container COMP `MetricsExt`. Add the custom parameters listed in `td/README-metrics.md` to that same COMP (`Customize Component...`).
   2. Drag `MetricsExt.py` onto its Extensions parameter, set `extensionName` to `MetricsExt`, `extensionPromoteAll` to `On`.
   3. Create a Timer CHOP next to `MetricsExt`. Length 5 seconds, cycle on, callback: `op('MetricsExt').ext.MetricsExt.OnTick()`.
   4. Save the `.toe`.

5. **Print the cardinality callout.** Repeat the warning prominently: never label with `op_path`, `par_name`, frame number, asset filename, or any per-tick string. Labels must be a small known set of enums. Reference the cardinality smoke test in `metrics-verify`.

6. **Copy verify scripts.** `templates/verify/check-endpoint.py`, `check-cardinality.py`, `check-roundtrip.mjs` → `<project>/scripts/verify/`. The verify scripts run *outside* TD; they hit the in-TD `/metrics` port and the local Prometheus agent.

7. **Print the operator checklist.** What's instrumented (build_info + td_metrics_flush_ts), what's still TODO, how to confirm the extension is actually firing (`td_metrics_flush_ts > time() - 30` in PromQL).

## What this skill does NOT do

- Open or modify `.toe` files (TD edits are manual)
- Manage TD's bundled Python version compatibility — the team must use a TD version with a working Python (most modern TDs are fine)
- Run `python3 -m pip install` if your TD bundles a Python without pip — vendor instead
```

### Task 8.3: Write the TD test-fixture README

- [ ] **Step 1: Write `test-fixtures/touchdesigner-readme.md`**

```markdown
# TouchDesigner fixture

TD edits can't be automated from outside the running app. To verify the
TouchDesigner integration skill end-to-end:

1. Open a fresh empty `.toe` file in TouchDesigner (any recent version with Python 3.11+).
2. Save it to `test-fixtures/touchdesigner-empty.toe` (gitignored).
3. Invoke `prometheus-integrate-touchdesigner` skill against that directory.
4. Follow the printed in-TD wiring steps to create the `MetricsExt` COMP (with its custom parameters) and the Timer CHOP.
5. Start the project's local agent (`tools/prometheus-agent/`) and run `python3 scripts/verify/check-endpoint.py`.
6. Confirm `td_metrics_flush_ts` updates in the `/metrics` output (poll every 5s).

If pip install fails in TD's Python, follow the vendor fallback.
```

### Task 8.4: Commit phase 8

- [ ] **Step 1: Stage and commit**

```bash
git add templates/touchdesigner skills/prometheus-integrate-touchdesigner test-fixtures/touchdesigner-readme.md
git commit -m "$(cat <<'EOF'
feat(integrate-touchdesigner): add prometheus-integrate-touchdesigner skill

MetricsExt COMP extension wraps prometheus_client, starts an in-TD
HTTP /metrics server, and tracks td_metrics_flush_ts so the verify
script can confirm the Timer CHOP is firing.

Cardinality warning prominent both in template comments and skill body
— TD's parameter data is high-risk for accidentally explosive labels.

Pip-install path with vendor fallback documented.
EOF
)"
git push
```

---

## Phase 9: `metrics-dashboard` skill

**Files:**
- Create: `templates/dashboards/starter-panel.json.tmpl`
- Create: `skills/metrics-dashboard/SKILL.md`

### Task 9.1: Write the starter-panel template

- [ ] **Step 1: Write `templates/dashboards/starter-panel.json.tmpl`**

```json
{
  "type": "timeseries",
  "title": "${PANEL_TITLE}",
  "targets": [
    { "expr": "${QUERY}", "legendFormat": "${LEGEND}", "refId": "A" }
  ],
  "gridPos": { "x": 0, "y": 0, "w": 12, "h": 8 },
  "fieldConfig": {
    "defaults": {
      "unit": "${UNIT}",
      "custom": { "drawStyle": "line", "lineInterpolation": "linear" }
    }
  }
}
```

### Task 9.2: Write `skills/metrics-dashboard/SKILL.md`

- [ ] **Step 1: Write the SKILL.md**

```markdown
---
name: metrics-dashboard
description: Use after metrics-verify confirms data is flowing. Reads docs/metrics/metrics-plan.md and produces docs/metrics/starter-queries.md plus docs/metrics/starter-dashboard.json — copyable PromQL queries and an importable Grafana dashboard so the team starts from something, not an empty editor.
---

# Metrics starter dashboard

This skill closes the loop after verification. You have data flowing; this gives you somewhere to look.

## Preflight

1. Confirm `docs/metrics/metrics-plan.md` exists with at least one entry beyond the worked-example.
2. Confirm `metrics-verify` has passed (the round-trip check). If not, instruct the user to run that first — generating a dashboard for metrics that aren't arriving is wasted effort.

## Procedure

1. **Parse `metrics-plan.md`.** Extract each metric's name, type, labels, help text, and unit (derived from name suffix if present).

2. **Generate one canonical query per metric.**

   - **Counter** → `sum by ({primary_label}) (rate({metric}[5m]))`
   - **Gauge** → `{metric}` (or `avg by ({primary_label}) ({metric})` if labeled)
   - **Histogram** → `histogram_quantile(0.95, sum by (le, {primary_label}) (rate({metric}_bucket[5m])))` plus a sum-of-rates panel for total throughput

   For each, pick a sensible `unit` for the Grafana panel: `s` for `_seconds`, `bytes` for `_bytes`, `percentunit` for `_ratio`, `ops` for `_total` counters with rate applied. Inherit from the metric name.

3. **Write `docs/metrics/starter-queries.md`.** One section per metric:

   ```markdown
   ## <metric_name>
   **Type:** counter | gauge | histogram
   **Question this answers:** <Why field from the plan>

   ```promql
   <query>
   ```
   ```

4. **Generate `docs/metrics/starter-dashboard.json`.** Use `templates/dashboards/starter-panel.json.tmpl`. One panel per metric. Lay out in a 2-column grid (gridPos.x alternates 0 / 12). Use defaults aggressively — this is not a polished dashboard, just a starting point.

5. **Print the next-steps checklist.**

   - "Import `starter-dashboard.json` into Grafana via Dashboards → New → Import."
   - "Decide which queries you'd alert on. Alert rules are project-specific — write them in Grafana's alerting UI, guided by `prometheus-reference` § Alerting principles."
   - "Add panels by hand for the queries `starter-queries.md` couldn't infer (e.g., multi-metric overlays, derived ratios)."

## What this skill does NOT do

- Generate alert rules (too project-specific to template — see `prometheus-reference`)
- Polish the dashboard layout (the team should iterate by hand)
- Run a live Grafana to test the import — the team imports manually
```

### Task 9.3: Commit phase 9

- [ ] **Step 1: Stage and commit**

```bash
git add templates/dashboards skills/metrics-dashboard
git commit -m "$(cat <<'EOF'
feat(dashboard): add metrics-dashboard skill

Reads metrics-plan.md and emits docs/metrics/starter-queries.md plus
docs/metrics/starter-dashboard.json. One canonical PromQL per metric:
sum-by-rate for counters, raw for gauges, p95 for histograms.

Closes the DX loop after verify passes — the team imports the
dashboard into Grafana instead of staring at an empty editor.
EOF
)"
git push
```

---

## Phase 10: End-to-end smoke test + 0.1.0 release tag

**Files:**
- Update: `README.md` (move to RC status, add CHANGELOG entry if you keep one)

### Task 10.1: End-to-end against the Node fixture

- [ ] **Step 1: Run the full happy path manually**

In a fresh shell:

1. `cd test-fixtures/node-minimal && npm install`
2. Invoke skills in order (via a new Claude Code session in that directory):
   - `metrics-discovery` → accept minimal default plan
   - `prometheus-agent-setup` (you'll need to provide test endpoint values in `.env` for the round-trip to pass; alternatively skip check 4 for this dry-run)
   - `prometheus-integrate-node`
   - `metrics-verify` → check 1, 2, 5 must pass; 3 and 4 require real endpoint
   - `metrics-dashboard`
3. Confirm at the end:
   - `docs/metrics/metrics-plan.md` exists
   - `tools/prometheus-agent/prometheus` exists and `--version` works
   - `src/metrics/index.ts` exists; `node --check` passes
   - `npm start` runs and `curl localhost:9100/metrics` returns exposition format
   - `docs/metrics/starter-queries.md` and `starter-dashboard.json` exist
4. Tear down: `rm -rf tools node_modules src docs scripts .env`

If anything fails, fix the relevant skill, commit the fix, re-run.

### Task 10.2: End-to-end against the Python fixture

- [ ] **Step 1: Same as 10.1 but for Python**

Walk the python-minimal fixture through `metrics-discovery → prometheus-agent-setup → prometheus-integrate-python → metrics-verify (1, 2, 5) → metrics-dashboard`. Confirm equivalent outputs.

### Task 10.3: Run all automated tests

- [ ] **Step 1: Lint + tests**

```bash
npm run lint:skills
node --test tests/
bash tests/platform-detect.test.sh
```
Expected: all green.

### Task 10.4: Tag v0.1.0

- [ ] **Step 1: Tag and push**

```bash
git tag -a v0.1.0 -m "Initial release — all nine skills working against Node and Python fixtures"
git push origin v0.1.0
```

- [ ] **Step 2: Final README touch-up**

In `README.md` change `## Install` example to refer to the tagged release URL if your marketplace path requires it. (For now, keep the marketplace pointing at the repo root.)

```bash
git add README.md
git commit -m "docs: 0.1.0 release notes in README"
git push
```

---

## Self-review checklist

After execution, the following should be true. Run through this manually after Phase 10:

- [ ] Every skill file passes `node scripts/lint-skills.mjs skills/`
- [ ] Every helper script under `scripts/` has a corresponding test under `tests/`
- [ ] Every `*.tmpl` is referenced from at least one SKILL.md
- [ ] No SKILL.md contains "TBD", "TODO at runtime", or unresolved `[placeholder]` markers
- [ ] The spec's 9 skills appear under `skills/` with frontmatter names matching the spec exactly: `metrics-discovery`, `prometheus-reference`, `prometheus-agent-setup`, `prometheus-integrate-node`, `prometheus-integrate-browser`, `prometheus-integrate-python`, `prometheus-integrate-touchdesigner`, `metrics-verify`, `metrics-dashboard`
- [ ] Both fixtures (`node-minimal`, `python-minimal`) walk all the way through to a passing local verify
- [ ] `tools/prometheus-agent/data/` and `tools/prometheus-agent/prometheus` are in `.gitignore` of any project the integration skills touch
- [ ] `.env.example` (if generated) never contains real credentials

## Notes for the implementer

- **Skills are markdown, not code.** When a step says "write the SKILL.md," include real prose — pull from the design spec at `docs/specs/2026-06-10-prometheus-bootstrap-design.md`. Do not leave bracketed `[Full prose per spec §X]` markers in the committed file.
- **The fixtures are real test rigs.** When you run a skill against `node-minimal`, watch what it actually does — not what it claims to do. If the skill says "I created src/metrics/index.ts" but the file isn't there, the skill failed.
- **Counter resets are dangerous.** This shows up in two places (the Node template and the reference skill). Both must say the same thing.
- **Cardinality warnings appear in three places.** Reference skill (general), TD skill (specific to TD's parameter data), verify skill (smoke test). All three must be consistent.
- **The browser depends on Node.** Don't skip Phase 5 if you want Phase 6 to work.
- **TouchDesigner edits are manual.** The plugin can't open `.toe` files; it writes Python text files and provides instructions for the user to wire them in TD.
