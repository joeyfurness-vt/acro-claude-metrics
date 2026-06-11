---
name: prometheus-agent-setup
description: Use when installing or upgrading the local Prometheus Agent for a project. Downloads the binary, scaffolds tools/prometheus-agent/prometheus.yml from the project's .env, configures startup integration, and confirms reachability of the remote_write endpoint.
---

# Prometheus Agent setup

This skill installs Prometheus in **agent mode** (`prometheus --agent`) at `tools/prometheus-agent/` inside the current project. The agent scrapes the project's local `/metrics` endpoint and forwards via `remote_write` to the hosted endpoint specified in the project's `.env`.

> **This is not Grafana Alloy.** Both are Prometheus-compatible scrape-and-forward agents. We use plain `prometheus --agent` because it uses YAML config and matches the bulk of Prometheus tutorials. If you Google "Prometheus agent" you may land in Alloy docs — that's a different tool with its own River/Alloy config DSL. Stick with what this skill installs.

## Mental model

Your app exposes metrics on a local bulletin board (`/metrics`). The Prometheus agent reads the bulletin board every 15 seconds and forwards the readings to your hosted endpoint. You never push from app code; the agent owns the wire protocol, retries, and buffering.

If the remote endpoint is unreachable, the agent buffers ~2 hours of metrics in its WAL (write-ahead log) and resumes when connectivity returns. For activation projects that occasionally lose internet, this is expected and OK.

## Procedure

### 1. Detect the platform

Run the bundled helper:

```
bash <plugin-root>/scripts/platform-detect.sh
```

Supported platforms: `darwin-arm64`, `darwin-amd64`, `linux-amd64`, `linux-arm64`. If the helper exits non-zero (e.g., Windows, FreeBSD, ARMv7), instruct the user to download the matching release manually from <https://github.com/prometheus/prometheus/releases/latest> and place the `prometheus` binary at `tools/prometheus-agent/prometheus`.

### 2. Resolve the latest stable release

```
node <plugin-root>/scripts/resolve-latest-prometheus.mjs <platform>
```

The script prints `<version>\t<url>` to stdout. Example: `3.12.0\thttps://github.com/.../prometheus-3.12.0.darwin-arm64.tar.gz`.

### 3. Download, verify, and install

```
mkdir -p tools/prometheus-agent
curl -L -o /tmp/prometheus.tgz <url>
tar xz -C /tmp -f /tmp/prometheus.tgz
mv /tmp/prometheus-<version>.<platform>/prometheus tools/prometheus-agent/prometheus
chmod +x tools/prometheus-agent/prometheus
rm /tmp/prometheus.tgz
rm -rf /tmp/prometheus-<version>.<platform>
```

Confirm the install:

```
tools/prometheus-agent/prometheus --version
```

Expected: a 3.x version string. If the binary fails to execute on macOS, it may need to be cleared from quarantine: `xattr -d com.apple.quarantine tools/prometheus-agent/prometheus`.

### 4. Render `prometheus.yml`

Copy `<plugin-root>/templates/prometheus-yml/prometheus.yml.tmpl` to `tools/prometheus-agent/prometheus.yml`. The template uses `${VAR}` env-var substitution; do not pre-interpolate — Prometheus reads the environment at startup.

The template includes:

- `global.scrape_interval: 15s`
- `global.external_labels` for `project` and `env` (substituted from `.env`)
- A single `scrape_configs` entry for `localhost:${METRICS_PORT}` with `installation_id` label
- `scrape_protocols` ordered protobuf → OpenMetrics 1.0.0 → text 0.0.4 — accepts native histograms automatically once client libraries ship them
- `remote_write` with `queue_config` tuned for low-volume activation projects: `batch_send_deadline: 10s`, `max_samples_per_send: 2000`, `capacity: 10000`

### 5. Append `.env` entries

If the project has no `.env`, copy `<plugin-root>/templates/env/metrics.env.tmpl` to `.env`. If `.env` exists, append only the missing keys; never overwrite existing values. The required keys are:

- `METRICS_PORT` — where the app exposes `/metrics`
- `METRICS_PROJECT` — logical project name, used as `external_labels.project`
- `METRICS_ENV` — `dev` | `staging` | `prod`
- `METRICS_INSTALLATION_ID` — optional; only set when the project deploys multiple identical instances
- `METRICS_REMOTE_WRITE_URL` — hosted endpoint URL (e.g. Grafana Cloud's `/api/prom/push`)
- `METRICS_REMOTE_WRITE_USERNAME` — for Grafana Cloud this is the numeric instance ID
- `METRICS_REMOTE_WRITE_PASSWORD` — API token

The template values are placeholders. Real secrets get filled in by the team after this skill finishes.

### 6. Update `.gitignore`

Ensure these lines are present (append if missing):

```
tools/prometheus-agent/prometheus
tools/prometheus-agent/data/
```

The binary is platform-specific (don't commit it). The WAL data directory is local state (definitely don't commit it).

### 7. Add the agent launcher

**Node projects** — add a script to `package.json`:

```json
{
  "scripts": {
    "metrics:agent": "set -a; source .env; set +a; ./tools/prometheus-agent/prometheus --agent --config.file=tools/prometheus-agent/prometheus.yml --storage.agent.path=tools/prometheus-agent/data"
  }
}
```

**Non-Node projects** — create `tools/prometheus-agent/start.sh` with the equivalent command and `chmod +x` it.

**Windows** — write the equivalent as `tools/prometheus-agent/start.ps1` and document it in `tools/prometheus-agent/README.md`. The flag set is the same.

### 8. Print the operator checklist

After everything is in place, surface this checklist to the user:

- Fill in `METRICS_REMOTE_WRITE_URL`, `METRICS_REMOTE_WRITE_USERNAME`, `METRICS_REMOTE_WRITE_PASSWORD` in `.env` before starting the agent. The template values are placeholders.
- Set `METRICS_PROJECT` (the project name that will appear as a label on every metric) and `METRICS_ENV`. Optionally set `METRICS_INSTALLATION_ID` if multiple machines run this same project.
- The agent binary is platform-specific. Re-run this skill on each production machine; do not commit the binary.
- The WAL buffers up to ~2 hours of metrics when the remote endpoint is unreachable. For activations that may lose internet, this is expected behavior. The agent will resume forwarding automatically when connectivity returns.
- Run `npm run metrics:agent` (or the platform equivalent) to start the agent in foreground. For production, background the process in whatever way the project already manages long-running processes (systemd, launchd, supervisor, the project's existing boot script).

## What this skill does NOT do

- Configure the project app (use `prometheus-integrate-<stack>` for that)
- Run the agent — that's a manual `npm run metrics:agent` after `.env` is filled in
- Generate alert rules (out of scope; see `prometheus-reference` for principles)
- Generate dashboards (use `metrics-dashboard` after metrics are flowing)
- Install Prometheus system-wide — every project gets its own agent, gitignored and torn down with the project

## Troubleshooting quick-reference

- `up{job="app"}=0` in the agent's local metrics → the agent can reach the host but the app isn't responding on `METRICS_PORT`. Confirm the app is running and exposing `/metrics`.
- `prometheus_remote_storage_samples_failed_total` increasing → auth wrong, endpoint URL wrong, or the hosted endpoint is rejecting payloads. Check the agent's stderr for the exact remote response.
- Agent won't start on macOS, "cannot be opened because the developer cannot be verified" → `xattr -d com.apple.quarantine tools/prometheus-agent/prometheus`.
- Agent runs but metrics don't appear at the hosted endpoint after several minutes → run `metrics-verify`, which does an end-to-end round-trip check.
