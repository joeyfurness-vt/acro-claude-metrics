---
name: metrics-dashboard
description: Use after metrics-verify confirms data is flowing. Reads docs/metrics/metrics-plan.md and produces docs/metrics/starter-queries.md plus docs/metrics/starter-dashboard.json — copyable PromQL queries and an importable Grafana dashboard so the team starts from something, not an empty editor.
---

# Metrics starter dashboard

This skill closes the loop after verification. You have data flowing; this gives you somewhere to look.

## Preflight

1. Confirm `docs/metrics/metrics-plan.md` exists with at least one entry beyond the worked-example.
2. Confirm `metrics-verify` has passed (specifically the round-trip check). If not, instruct the user to run that first — generating a dashboard for metrics that aren't arriving is wasted effort.

## Procedure

### 1. Parse `metrics-plan.md`

Extract each metric's name, type, labels, help text. Derive a unit from the metric name suffix (`_seconds` → `s`, `_bytes` → `bytes`, `_ratio` → `percentunit`, `_total` with rate applied → `ops`, otherwise unitless).

Skip the worked-example block at the top — it's a reference shape, not a real metric for the project.

### 2. Generate one canonical query per metric

| Type | Query template | Notes |
|---|---|---|
| Counter (`_total` suffix) | `sum by ({primary_label}) (rate({metric}[5m]))` | Rate before aggregate (Zen #8) |
| Gauge | `{metric}` or `avg by ({primary_label}) ({metric})` if labeled | Raw value; avg when labeled |
| Histogram | `histogram_quantile(0.95, sum by (le, {primary_label}) (rate({metric}_bucket[5m])))` | p95 latency-style |

"Primary label" is the first label in the plan entry (or omit `by (…)` if no labels). For histograms, also add a second panel with `sum(rate({metric}_count[5m]))` to show total throughput alongside the quantile.

### 3. Write `docs/metrics/starter-queries.md`

One section per metric:

```markdown
## <metric_name>

**Type:** counter | gauge | histogram
**Question this answers:** <Why field from the plan>

```promql
<query>
```
```

Include the metric's "Why" line directly under the heading — it gives the reader the *purpose* of the panel, not just its query.

### 4. Generate `docs/metrics/starter-dashboard.json`

Use `<plugin-root>/templates/dashboards/starter-panel.json.tmpl` per panel. One panel per metric. Lay out in a 2-column grid (gridPos.x alternates 0 / 12, gridPos.y increments by 8 per row).

Wrap the panels in the standard Grafana dashboard envelope:

```json
{
  "title": "<project> — starter",
  "schemaVersion": 39,
  "version": 1,
  "refresh": "30s",
  "time": { "from": "now-1h", "to": "now" },
  "panels": [ /* generated panels */ ]
}
```

Use defaults aggressively. This is not a polished dashboard — it's the seed the team iterates from.

### 5. Print the next-steps checklist

- "Import `docs/metrics/starter-dashboard.json` into Grafana via Dashboards → New → Import."
- "Read `docs/metrics/starter-queries.md` for the question each panel answers — that's the conversation you have with future-you when alerting decisions come up."
- "Decide which queries warrant alerts. Alert rules are project-specific — write them in Grafana's alerting UI, guided by `prometheus-reference` §9 (Alerting principles). The plugin does NOT generate alert rules — too easy to ship noisy or wrong defaults."
- "Add panels by hand for queries the starter couldn't infer (multi-metric overlays, derived ratios, stat panels for current state)."

## What this skill does NOT do

- Generate alert rules (too project-specific to template safely)
- Polish the dashboard layout (the team iterates by hand)
- Run a live Grafana to test the import — the team imports manually
- Re-generate dashboards after the plan changes (re-run this skill to regenerate; the output overwrites previous starter files)

## Why one query per metric, not one per panel-shape

The discovery skill is structured so each metric in the plan has a clear *purpose* (the "Why" field). A 1:1 mapping from plan-entry → canonical query → panel keeps that traceable. The team can always combine panels later, but starting from a single canonical view per metric is the lowest-friction path from "data is flowing" to "I'm reading my dashboard."
