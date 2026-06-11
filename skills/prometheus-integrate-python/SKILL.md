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

### 1. Add `prometheus_client` to dependencies

- For `requirements.txt`: append `prometheus_client>=0.23` (v0.23 added OpenMetrics 2.0 native-histogram exposition format — agent already accepts it via `scrape_protocols`).
- For `pyproject.toml`: add to `[project.dependencies]`. If using poetry or hatch, run the appropriate add command.
- Install: `pip install -r requirements.txt` (or the project's idiomatic install command).

### 2. Decide the app prefix

From the metrics plan if available; otherwise derive from the package name (snake_case, single word: `summit-2026` → `summit`). Confirm with the user.

### 3. Scaffold `app/metrics.py`

Copy `<plugin-root>/templates/python/metrics-module.py.tmpl`, substituting `${APP_PREFIX}`. Place under `app/` or the project's idiomatic package directory.

If `app/metrics.py` already exists, do NOT overwrite — print a diff and let the user merge.

### 4. Start the metrics HTTP server

Add at app startup (before serving requests):

```python
from app.metrics import start_metrics_server
start_metrics_server()
```

For Flask: place this above `app.run()` or before the WSGI server picks up the app.
For FastAPI: call inside an `@app.on_event("startup")` handler.
For pure scripts: call once near the top of `main()`.

### 5. Wire the verify-bump route by framework

**Flask:**

```python
from app.metrics import BOOTSTRAP_VERIFY_TS
from flask import request

@app.post('/internal/metrics-verify-bump')
def metrics_verify_bump():
    ts = float(request.args.get('ts', 0))
    if not ts:
        return ('ts query param required', 400)
    BOOTSTRAP_VERIFY_TS.set(ts)
    return ('', 204)
```

**FastAPI:**

```python
from fastapi import Query, Response
from app.metrics import BOOTSTRAP_VERIFY_TS

@app.post('/internal/metrics-verify-bump')
def metrics_verify_bump(ts: float = Query(...)):
    BOOTSTRAP_VERIFY_TS.set(ts)
    return Response(status_code=204)
```

**Pure script / CLI:** skip this step. There's no HTTP server to mount onto. The round-trip check doesn't apply; use `<app>_last_run_timestamp_seconds` (gauge set to `time.time()` at end of each run) and query it as `time() - that` for "minutes since last run."

### 6. For multi-worker setups (gunicorn / uvicorn `--workers > 1`)

Each worker has its own registry by default; with multiple workers, scrapes return whichever worker the scraper happens to hit. Switch to multiprocess mode:

1. Set in the agent's launch script (before `gunicorn`/`uvicorn`):
   ```
   export PROMETHEUS_MULTIPROC_DIR=/tmp/prom-multiproc
   mkdir -p "$PROMETHEUS_MULTIPROC_DIR"
   rm -f "$PROMETHEUS_MULTIPROC_DIR"/*    # clear stale per-PID files
   ```

2. In `app/metrics.py`, replace:
   ```python
   from prometheus_client import REGISTRY
   ```
   with:
   ```python
   from prometheus_client import CollectorRegistry, multiprocess
   REGISTRY = CollectorRegistry()
   multiprocess.MultiProcessCollector(REGISTRY)
   ```

3. Re-attach `ProcessCollector` and `PlatformCollector` to the new registry.

4. The HTTP server should be a separate process or thread that reads from the multiproc registry. `start_http_server(port, registry=REGISTRY)` works for the bundled server.

5. Document the multiproc-dir cleanup requirement: stale `.db` files from a previous run accumulate per-PID and need clearing on startup.

### 7. Generate metric stubs

Parse `docs/metrics/metrics-plan.md`. For each metric, append a `Counter` / `Gauge` / `Histogram` declaration to `app/metrics.py` (above `def start_metrics_server`) with a `# TODO: instrument at <Where>` comment.

Example: a histogram plan entry becomes:

```python
# TODO: instrument at app/scene_router.py, on scene change
SCENE_TRANSITION_DURATION_SECONDS = Histogram(
    'summit_scene_transition_duration_seconds',
    'Time from SCENE_ADVANCE receipt to first rendered frame',
    ['scene_from', 'scene_to'],
    buckets=[1, 2, 5, 10, 20, 30, 60, 120, 300],
)
```

### 8. Copy verify scripts

```
mkdir -p scripts/verify
cp <plugin-root>/templates/verify/check-endpoint.py scripts/verify/
cp <plugin-root>/templates/verify/check-cardinality.py scripts/verify/
cp <plugin-root>/templates/verify/check-roundtrip.mjs scripts/verify/   # JS-only by design
```

### 9. Run check 1 to confirm scaffolding works

After the user starts the app:

```
python3 scripts/verify/check-endpoint.py
```

Checks 1 and 2 should pass if the app is up. Checks 3 and 4 need the agent running and `.env` filled in with real remote credentials.

### 10. Print the operator checklist

- What's instrumented: default Python metrics (`process_*`, `python_*`), `<app>_build_info`, `bootstrap_verify_ts`, and stubs for the N metrics in `metrics-plan.md`
- What's still TODO: the stub call sites
- Where verify scripts live: `scripts/verify/`
- What `.env` keys need real values: same as Node — `METRICS_REMOTE_WRITE_URL`, `METRICS_REMOTE_WRITE_USERNAME`, `METRICS_REMOTE_WRITE_PASSWORD`
- Next: run `metrics-verify` once the agent is up and `.env` has real credentials

## Counter safety in `prometheus_client`

`Counter` in `prometheus_client` does not expose a `.reset()` method — that's by design. If you find yourself wanting to reset a counter, switch to a `Gauge` and `.set(value)`. Manual counter resets break PromQL `rate()` (Zen #7).

## What this skill does NOT do

- Decide what to measure (use `metrics-discovery`)
- Configure the agent (use `prometheus-agent-setup`)
- Cover Django specifically — Django's request hooks differ; follow the Flask shape and adapt. (Django middleware is a common alternative for request-level instrumentation.)
- Manage multiprocess cleanup beyond the documented startup step
- Native histograms — the `prometheus_client` instrumentation API for native histograms is in PR #1104 (open as of June 2026). Until merged, use classic histograms with bucket presets from `prometheus-reference` §6.
