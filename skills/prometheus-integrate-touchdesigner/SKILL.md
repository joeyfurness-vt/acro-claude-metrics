---
name: prometheus-integrate-touchdesigner
description: Use when adding Prometheus metrics to a TouchDesigner project. Installs prometheus_client into TD's Python (or vendors it), scaffolds a MetricsExt COMP extension that exposes /metrics, adds custom parameters mirroring .env onto the same COMP, wires a Timer CHOP for health-gauge updates.
---

# Integrate Prometheus into TouchDesigner

> TouchDesigner is the highest-cardinality risk surface in this plugin. Read the warning at the top of `MetricsExt.py.tmpl` and `prometheus-reference` §5 (Label hygiene) before you label anything.

## Preflight

1. Confirm a `.toe` file is present in the project directory (or the user is editing a live TD project — the skill can't open `.toe` files; it scaffolds Python text and provides in-TD wiring instructions).
2. Confirm `docs/metrics/metrics-plan.md` exists (or accept the minimal default plan).
3. Confirm `prometheus-agent-setup` has been run.

## Procedure

### 1. Install `prometheus_client` into TD's Python

Try the pip path first:

```
<TD-install>/bin/python3 -m pip install prometheus_client
```

Path varies by OS:
- macOS: `/Applications/TouchDesigner.app/Contents/MacOS/python3.11`
- Windows: `C:\Program Files\Derivative\TouchDesigner\bin\python.exe`
- Linux: depends on installation method

If pip isn't available in your TD build, vendor the package:

```
pip install prometheus_client --target ./tools/td-vendor/
```

Then set the `Vendorpath` parameter on the `MetricsExt` COMP to point at `./tools/td-vendor/`. The extension adds that path to `sys.path` before importing.

### 2. Scaffold `MetricsExt.py`

Copy `<plugin-root>/templates/touchdesigner/MetricsExt.py.tmpl` to `<project>/td/MetricsExt.py`. Substitute `${APP_PREFIX}` with the project's metric prefix (from `docs/metrics/metrics-plan.md` or derived from the project name).

If `td/MetricsExt.py` already exists, do NOT overwrite — print a diff.

### 3. Document the COMP parameters

Copy `<plugin-root>/templates/touchdesigner/MetricsConfig-params.md` to `<project>/td/README-metrics.md`. The team member follows this to create the COMP and add its custom parameters by hand inside TD (no way to automate TD edits from outside the running app).

### 4. Print the in-TD wiring steps

1. Create a Container COMP `MetricsExt`. Open `Customize Component...` and add the seven custom parameters listed in `td/README-metrics.md` (Metricsport, Project, Env, Installationid, Appversion, Gitsha, Vendorpath).
2. Drag `td/MetricsExt.py` onto the COMP's Extensions parameter. Set `extensionName` to `MetricsExt` and `extensionPromoteAll` to `On`.
3. Create a Timer CHOP next to the `MetricsExt` COMP. Length 5 seconds, cycle on. Callback: `op('MetricsExt').ext.MetricsExt.OnTick()`.
4. Save the `.toe`.

### 5. Print the cardinality callout (prominently)

Repeat the warning every time this skill runs:

> **NEVER** label metrics with `op_path`, `par_name`, frame number, asset filename, or any per-tick string. Labels must be a small known set of enum-like values (scene names, archetype IDs, device kinds). TD's parameter data is rich and easy to label with — that's the trap. A label with thousands of values will OOM the local Prometheus agent within minutes and you won't notice until the agent crashes.
>
> Run `metrics-verify` after exercising the project to catch cardinality bugs at bootstrap.

### 6. Copy verify scripts

```
mkdir -p <project>/scripts/verify
cp <plugin-root>/templates/verify/check-endpoint.py <project>/scripts/verify/
cp <plugin-root>/templates/verify/check-cardinality.py <project>/scripts/verify/
cp <plugin-root>/templates/verify/check-roundtrip.mjs <project>/scripts/verify/
```

The verify scripts run **outside** TD; they hit the in-TD `/metrics` port and the local Prometheus agent on `localhost:9090`.

### 7. Print the operator checklist

- What's instrumented: `<app>_build_info` and `td_metrics_flush_ts` (auto). Stubs for metrics in `metrics-plan.md` go in `td/MetricsExt.py` below the comment block.
- What's still TODO: wire the in-TD COMP (parameters, extension, Timer CHOP) by hand; instrument call sites by calling `op('MetricsExt').ext.MetricsExt.Incr/Set/Observe(...)` from the project's other extensions or DAT scripts.
- How to confirm the extension is actually firing: in PromQL, `td_metrics_flush_ts > time() - 30` should be true. If it's stale, the Timer CHOP isn't running or the extension isn't loaded.
- Verify scripts: `python3 scripts/verify/check-endpoint.py` and the others.

## What this skill does NOT do

- Open or modify `.toe` files (TD edits are manual — they happen inside TouchDesigner)
- Manage TD's bundled Python version compatibility — most modern TDs ship Python 3.11+ which is fine; older TDs may need vendoring
- Run `pip install` if your TD bundles a Python without pip — fall back to vendoring
- Native histograms — `prometheus_client`'s native-histogram instrumentation API is in PR #1104 (open as of June 2026). Until merged, use classic histograms with bucket presets from `prometheus-reference` §6.

## Why `MetricsExt` is a COMP extension, not a Script DAT

Following the project convention (and TD best practice for stateful Python logic):

- A Script DAT is a flat callbacks file with no encapsulation
- A COMP extension is a Python class attached to a Container COMP — it holds state as `self.*` attributes, exposes named methods, and is callable from other operators

For metrics, where instrument state (counters, gauges, histograms) lives across the project lifetime, COMP extension is the right shape.
