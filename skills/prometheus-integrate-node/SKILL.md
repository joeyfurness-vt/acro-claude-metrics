---
name: prometheus-integrate-node
description: Use when adding Prometheus metrics to a Node.js project (Express, Fastify, generic http). Installs prom-client, scaffolds the metrics module, mounts /metrics and /internal/metrics-verify-bump routes, instantiates default collectors and build_info, generates stub declarations from docs/metrics/metrics-plan.md, and runs verification.
---

# Integrate Prometheus into a Node project

## Preflight

1. Confirm the cwd has a `package.json` and at least one of: a `src/` directory, a top-level `.ts`/`.js` entry point, or a path identified in `package.json` `main`.
2. Confirm `docs/metrics/metrics-plan.md` exists. If not, prompt the user to run `metrics-discovery` first, or accept the minimal default plan (just `build_info` and default collectors — no project-specific metrics).
3. Confirm the agent is set up at `tools/prometheus-agent/prometheus.yml`. If not, prompt the user to run `prometheus-agent-setup` first — without the agent there's no way to verify the integration end-to-end.

## Procedure

### 1. Install `prom-client`

```
npm install prom-client
```

Confirm it appears in `package.json` `dependencies` (not `devDependencies`).

### 2. Decide the app prefix

From the metrics plan if available (look at the metric name prefixes in `metrics-plan.md`); otherwise derive from `package.json` `name` (snake_case, single word: `summit-2026` → `summit`). Confirm with the user before committing — this prefix becomes part of every metric name and is hard to change later.

### 3. Scaffold `src/metrics/index.ts`

Copy `<plugin-root>/templates/node/metrics-module.ts.tmpl`, substituting `${APP_PREFIX}`.

If `src/metrics/index.ts` already exists, DO NOT overwrite. Print a diff between the template and the existing file and let the user merge. Re-running this skill should be safe.

### 4. Scaffold the routes

- `src/metrics/route.ts` ← `<plugin-root>/templates/node/metrics-route.ts.tmpl`
- `src/metrics/verify-bump.ts` ← `<plugin-root>/templates/node/verify-bump-route.ts.tmpl`

### 5. Wire the routes into the main app file

Locate the project's main file (`server.ts`, `index.ts`, `app.ts`, or the `main` field in `package.json`). Add (preserving the user's import style — match the file's existing import conventions for `.js` extension or not):

```typescript
import { register } from './metrics/index.js';
import { metricsHandler } from './metrics/route.js';
import { mountVerifyBump } from './metrics/verify-bump.js';

app.get('/metrics', metricsHandler);
mountVerifyBump(app);
```

For Fastify or other frameworks, adapt the route registration syntax; the underlying `register.metrics()` call is the same.

### 6. Verify the bind address

Read the existing `app.listen()` call. If the app binds to `0.0.0.0` (or `::`), warn the user that `/internal/*` routes will be reachable from outside the host. Recommend one of:

- Add an `if (req.ip !== '127.0.0.1' && req.ip !== '::1') return res.status(403).end();` guard inside `mountVerifyBump`
- Mount the verify route on a separate localhost-only HTTP server

If the app binds to `127.0.0.1` only, no change needed.

### 7. Generate metric stubs from the plan

Parse `docs/metrics/metrics-plan.md`. For each metric entry, append a TypeScript declaration to `src/metrics/index.ts` (above the `export { register, … }` line) using `Counter` / `Gauge` / `Histogram` from `prom-client`. Include a `// TODO: instrument at <Where>` comment pointing at the "Where" field from the plan.

Example: a plan entry like

```markdown
### summit_scene_transition_duration_seconds
- **Type:** histogram (scene-duration buckets `[1, 2, 5, 10, 20, 30, 60, 120, 300]`)
- **Labels:** scene_from, scene_to
- **Help:** "Time from SCENE_ADVANCE receipt to first rendered frame"
- **Where:** SceneRouter.svelte, on scene-key change
```

becomes:

```typescript
// TODO: instrument at SceneRouter.svelte, on scene-key change
export const sceneTransitionDurationSeconds = new Histogram({
  name: 'summit_scene_transition_duration_seconds',
  help: 'Time from SCENE_ADVANCE receipt to first rendered frame',
  labelNames: ['scene_from', 'scene_to'] as const,
  buckets: [1, 2, 5, 10, 20, 30, 60, 120, 300],
  registers: [register],
});
```

### 8. Copy verify scripts

```
mkdir -p scripts/verify
cp <plugin-root>/templates/verify/check-endpoint.mjs scripts/verify/
cp <plugin-root>/templates/verify/check-cardinality.mjs scripts/verify/
cp <plugin-root>/templates/verify/check-roundtrip.mjs scripts/verify/
```

### 9. Run check 1 (exposition) to confirm scaffolding works

After the user starts the app, run:

```
node scripts/verify/check-endpoint.mjs
```

This is a partial verification — checks 1 and 2 will pass if the app is up; checks 3 and 4 require the agent running and `.env` filled in with real remote credentials.

### 10. Print the operator checklist

- What's instrumented: default Node metrics (`process_*`, `nodejs_*`), `<app>_build_info`, and stubs for the N metrics in `metrics-plan.md`
- What's still TODO: the stub call sites (each has a `// TODO: instrument at <path>` comment)
- Where verify scripts live: `scripts/verify/`
- What `.env` keys need real values: `METRICS_REMOTE_WRITE_URL`, `METRICS_REMOTE_WRITE_USERNAME`, `METRICS_REMOTE_WRITE_PASSWORD`
- Next skill to run: `metrics-verify` once the agent is running and `.env` has real credentials

## Counter safety

Every scaffolded `Counter` stub gets this inline comment:

```ts
// Never call counter.reset() — it makes rate() spike and breaks alerting.
// For resettable counts, use a Gauge with .set(value) instead.
```

This is Zen #7 ("Counters rule, gauges suck") and the upstream Prometheus instrumentation guidance: counters monotonically increase except on process restart; PromQL `rate()` handles restart resets correctly. Manual `.reset()` calls confuse `rate()`.

## What this skill does NOT do

- Decide what to measure (use `metrics-discovery`)
- Configure the agent (use `prometheus-agent-setup`)
- Generate dashboards (use `metrics-dashboard`)
- Modify route handlers to actually call the instruments (that's a human-driven step — the skill scaffolds declarations with TODO comments at the right places)
