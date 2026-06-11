---
name: prometheus-integrate-browser
description: Use when adding browser-side metrics to a project that already has the Node integration. Scaffolds the in-browser client (counter/gauge/histogram batched POST), the server-side relay route with a strict label-value allowlist, and explains the CORS / cardinality reasoning behind the design.
---

# Integrate Prometheus into the browser

> **Depends on `prometheus-integrate-node`.** The relay route lives in the Node server, and the agent scrapes the Node `/metrics` endpoint to ingest browser-relayed data.

## Why a relay (not direct push)?

Browsers cannot speak Prometheus remote_write directly — the protocol needs snappy compression + protobuf serialization + server-side auth secrets that don't belong in the client. Posting JSON to your own server's relay route is the standard pattern; the relay updates server-side `prom-client` metrics, and the agent scrapes those.

## Why an allowlist?

If the relay accepted any metric name and any label value, a browser tab — even a malicious one — could inject arbitrary label values and explode cardinality. That cost is silent until billing arrives. The allowlist constrains each browser-pushable metric to:

- A specific metric name (no `eval`-style injection)
- A specific set of label keys
- A specific set of allowed label values per key (enums only — no free-form strings)

Unknown metric, unknown label key, unknown label value → silently dropped, no telemetry.

## Preflight

1. Confirm Node integration is installed (`src/metrics/index.ts` exists). If not, instruct the user to run `prometheus-integrate-node` first — the relay depends on the server's `prom-client` registry.
2. Confirm a browser app exists (`src/lib/`, `src/components/`, a `vite.config.*`, a `next.config.*`, or similar). If the project is server-only, this skill is not applicable.
3. Confirm `docs/metrics/metrics-plan.md` lists at least one browser-emitted metric (tagged "(browser)" in the Where field). If not, prompt the user to update the plan first — browser metrics shouldn't be invented during this skill.

## Procedure

### 1. Scaffold the in-browser client

Copy `<plugin-root>/templates/browser/metrics-client.ts.tmpl` to `src/lib/metrics.ts` (or the project's idiomatic frontend lib location).

For Svelte: typically `src/lib/metrics.ts`.
For React/Next: typically `src/lib/metrics.ts` or `app/lib/metrics.ts`.
For vanilla bundlers: `src/metrics.ts`.

### 2. Scaffold the relay route + allowlist on the server

- `src/metrics/relay-route.ts` ← `<plugin-root>/templates/browser/relay-route.ts.tmpl`
- `src/metrics/relay-allowlist.ts` ← `<plugin-root>/templates/browser/relay-allowlist.ts.tmpl`

The allowlist template ships empty with one commented example. Replace with real entries derived from the plan.

### 3. Mount the relay in the server entry file

Add (next to the existing `app.get('/metrics', metricsHandler)` line):

```typescript
import express from 'express';
import { mountMetricsRelay } from './metrics/relay-route.js';

app.use(express.json({ limit: '64kb' }));   // if not already configured globally
mountMetricsRelay(app);
```

The 64kb limit guards against oversized batches; the in-browser client never sends more than ~100 samples × ~200 bytes ≈ 20kb per batch.

### 4. Populate the allowlist from `metrics-plan.md`

For each metric in the plan tagged "(browser)" in the Where field, add an entry to `RELAY_ALLOWLIST`:

```typescript
{
  name: 'summit_browser_action_total',
  type: 'counter',
  help: 'User-initiated browser actions.',
  labels: {
    action: ['click_start', 'click_continue', 'tap_card'] as const,
    archetype: ['deep-diver', 'pivoter', 'visionary', 'circle-backer', 'ocean-boiler', 'ladder-upper'] as const,
  },
},
```

**Enumerate every allowed value.** No `string`, no `any`, no regex. If you can't enumerate, the metric doesn't belong as a browser-pushable counter.

### 5. Instrument the browser code

For each plan entry, import and call:

```typescript
import { incr, set, observe } from '$lib/metrics';

// On user action:
incr('summit_browser_action_total', { action: 'click_start', archetype: 'deep-diver' });
```

The integration skill places `// TODO: instrument at <Where>` comments per plan entry inside `src/lib/metrics.ts` to remind the developer of the call sites; the actual `incr/set/observe` calls happen by hand at the right point in the UI flow.

### 6. Print the scrape-staleness note

Tell the user: "Browser metric updates are scraped on the agent's 15s interval. Counters increment in the relay immediately, but Grafana sees the change at the next scrape. Do not frame browser counters as 'live' — they lag up to 15s. Use a smaller scrape_interval only if you have a real reason; the network/CPU cost compounds across projects."

### 7. Print the operator checklist

- What's instrumented: an empty allowlist with one commented example, plus the relay route
- What's still TODO: populate `RELAY_ALLOWLIST`, then add `incr/set/observe` calls in the UI
- Where the client lives: `src/lib/metrics.ts`
- Where the allowlist lives: `src/metrics/relay-allowlist.ts`
- Re-run `metrics-verify` after adding allowlist entries and exercising the UI to confirm browser samples appear in the server's `/metrics` output

## Anti-patterns

- **Adding `string` or `any` as an allowed label value type.** Defeats the entire purpose; every label value must be enumerated.
- **Adding metrics to the allowlist that aren't in `metrics-plan.md`.** Discovery is the source of truth; if a metric isn't in the plan, decide whether it belongs there before adding to the allowlist.
- **`user_id` / `session_id` / `email` as labels.** High cardinality; banned at the plan stage and again here.
- **Returning detailed error responses from the relay route.** The relay drops invalid samples silently. An attacker probing the allowlist shouldn't get back "label `archetype` does not include `xyz`" — that's reconnaissance.

## What this skill does NOT do

- Modify the Node integration. Preflight requires the Node skill to have run; this skill only adds files alongside.
- Authenticate browser pushes. The relay is open by design; if the project has user authentication, add the existing middleware before the relay-mount line.
- Configure the agent. No agent change is needed — it still scrapes the Node `/metrics` endpoint, which now also contains browser-relayed data.
