---
name: metrics-verify
description: Use after running an integration skill to confirm the full pipeline works — app /metrics exposition, agent scraping, agent reaching remote endpoint, end-to-end round-trip via the read API, and a cardinality smoke test. Also use when metrics aren't appearing in Grafana and you need a diagnostic.
---

# Metrics verify

Runs five checks against the current project. Each check fails fast with a clear remediation message.

## Procedure

### 1. Detect stack

Read the project for indicators:
- `package.json` present → Node (or Node + browser)
- `requirements.txt` / `pyproject.toml` present → Python
- `.toe` file present → TouchDesigner

Pick the `.mjs` or `.py` variants of the verify scripts accordingly. `check-roundtrip.mjs` is JS regardless of stack — it only speaks HTTP and has no language-specific deps; even Python and TouchDesigner projects run it via Node (it's a one-time check; the Node runtime is acceptable to require for verification).

### 2. Copy verify scripts into the project

From `<plugin-root>/templates/verify/`:

- For Node: `check-endpoint.mjs`, `check-cardinality.mjs`, `check-roundtrip.mjs` → `scripts/verify/`
- For Python and TouchDesigner: `check-endpoint.py`, `check-cardinality.py`, `check-roundtrip.mjs` → `scripts/verify/`

The integration skills already do this as part of their flow; running `metrics-verify` again just re-copies and runs.

### 3. Run the five checks in order

Each check fails fast and prints what to fix.

#### Check 1 — Exposition format

`node scripts/verify/check-endpoint.mjs` (or `.py`). Confirms:
- The app's `/metrics` route returns HTTP 200
- The response contains `# HELP` and `# TYPE` lines (valid exposition format)
- There is at least one metric line

**If this fails:** the app isn't running, the configured port is wrong, or the `/metrics` route isn't mounted. Check `METRICS_PORT` in `.env` matches the app's listen port.

#### Check 2 — Agent scraping the target

Part of `check-endpoint`. Reads the Prometheus agent's own `/metrics` (default port `9090`) and confirms `up{job="app"} = 1`.

**If this fails with `up = 0`:** the agent reached the target host but the app isn't responding on the configured port. Check 1 should have caught this.

**If this fails with "agent has no up{job=\"app\"}":** the agent isn't running, or its `scrape_configs.job_name` isn't `"app"`. Run `prometheus-agent-setup` again if the config is missing or differs from the template.

#### Check 3 — Agent reaching remote_write

Inspect the agent's own metrics for delivery health:

```
curl -s localhost:9090/metrics | grep -E 'prometheus_remote_storage_(samples_total|samples_failed_total|samples_pending|samples_retried_total)'
```

Expect:
- `prometheus_remote_storage_samples_total` increasing (samples being sent)
- `prometheus_remote_storage_samples_failed_total` near zero
- `prometheus_remote_storage_samples_pending` low (not climbing)

**If samples_failed is increasing:** wrong remote_write URL, wrong auth, or the remote endpoint is rejecting payloads. Check the agent's stderr for the actual error response from the remote.

#### Check 4 — End-to-end round-trip

`node scripts/verify/check-roundtrip.mjs`. POSTs to the temporary `/internal/metrics-verify-bump` route the integration skill installed, then queries the remote endpoint's read API for the sentinel `bootstrap_verify_ts` metric, polling every 5 seconds for up to 60 seconds.

This is the only definitive end-to-end check. Checks 1–3 confirm the local pipeline; this confirms the data actually arrives at the hosted endpoint and is queryable.

**If this fails after 60s:** samples are being accepted by the remote but the round-trip read URL derivation is wrong for your hosted endpoint. The script derives the read URL by swapping `/api/prom/push` → `/api/prom/api/v1/query`. If your hosted endpoint uses a different shape (e.g. a hand-rolled Mimir deployment), set `METRICS_READ_URL` explicitly in `.env` and re-run.

**If the verify-bump route is missing:** the integration skill wasn't run, or was run before this skill version. Re-run `prometheus-integrate-<stack>`.

#### Check 5 — Cardinality smoke test

`node scripts/verify/check-cardinality.mjs` (or `.py`). Counts series per metric and total. Warns if any single metric exceeds 50 series or total series across the app exceeds 5000.

**If this triggers:** see `prometheus-reference` §5 (Label hygiene). The offending metric has a label with too many distinct values — likely `user_id`, `email`, a free-form string, a timestamp, or a URL path with IDs. Drop the label or constrain it to an enum.

Cardinality bugs are silent until the billing arrives — running this check before going to production is high-leverage.

## Reading the output

| Result | Meaning |
|---|---|
| All five pass | Metrics are reaching the hosted endpoint and your label hygiene is healthy. Move to `metrics-dashboard`. |
| Check 1 fails | App not running, wrong port, or `/metrics` route missing. |
| Check 2 fails (`up=0`) | Agent can see the target host but the app isn't responding on the configured port. |
| Check 3 fails (samples_failed up) | Wrong remote_write URL, wrong auth, or remote rejecting payloads. |
| Check 4 fails | Samples sent but not arriving — likely read URL derivation issue. Set `METRICS_READ_URL` explicitly. |
| Check 5 fails | Label hygiene issue. Find and constrain the high-cardinality label. |

## What this skill does NOT do

- Restart the agent (must be done manually after `.env` changes)
- Modify the app's metrics module (use `prometheus-integrate-<stack>` for that)
- Generate dashboards (use `metrics-dashboard`)
- Diagnose hosted-endpoint outages — if checks 1–3 pass but check 4 fails repeatedly, the hosted endpoint is the most likely culprit; check the provider's status page
