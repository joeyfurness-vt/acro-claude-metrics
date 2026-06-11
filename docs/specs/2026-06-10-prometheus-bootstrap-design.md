# Prometheus Bootstrap Plugin — Design Spec

**Date:** 2026-06-10
**Author:** Joey Furness (with Claude Code)
**Status:** Draft for review

## Context

VTPro Design ships interactive activations — booth installations, touch experiences, generative-art and TouchDesigner-driven AV. The team is competent at shipping code but most members have not instrumented projects with Prometheus before. We have a hosted Prometheus-compatible endpoint (Grafana Cloud or equivalent) ready to receive metrics via `remote_write`.

This spec defines a Claude Code plugin, `prometheus-bootstrap`, that lets any team member spin up production-ready metrics on a new project in minutes — across Node.js, browser, Python, and TouchDesigner stacks — without needing to learn Prometheus first.

## Goals and non-goals

**Goals**
- Bootstrap a working metrics pipeline (instrumented app → local agent → remote endpoint) from one or two skill invocations
- Encode Prometheus best practices (naming, labels, cardinality, histogram strategy, alerting principles) so teammates inherit them by default
- Provide a "what should I measure?" workflow grounded in the team's actual activation patterns
- Verify the full pipeline end-to-end before claiming success
- Stay aligned with upstream Prometheus guidance, including the migration path to native histograms

**Non-goals**
- Not a metrics platform — the data store is a hosted endpoint we already have
- Not a Grafana dashboard authoring tool (we generate starter queries / starter dashboard JSON; full dashboards are still hand-built)
- Not a logs/traces solution — metrics only
- Not a one-size-fits-all instrumentation library — projects retain control of what they measure

## Architecture decision

### The chosen shape

```
┌─────────────────────┐   localhost          ┌──────────────────────┐  remote_write   ┌──────────────────┐
│ Project app         │ ─── /metrics ──────▶ │ Prometheus (--agent) │ ──────────────▶ │ Hosted endpoint  │
│ (Node/Python/TD)    │   scrape every 15s   │ in tools/            │   batch 10s     │ (Grafana Cloud)  │
└─────────────────────┘                       └──────────────────────┘                  └──────────────────┘
        ▲
        │  POST /internal/metrics-relay
        │  (validated against label whitelist)
┌─────────────────────┐
│ Browser client      │
│ (Svelte/React etc)  │
└─────────────────────┘
```

- Each project uses the **standard Prometheus client library** for its language (`prom-client`, `prometheus_client`). The library exposes `/metrics` in Prometheus exposition format on a configurable port.
- Each machine runs **Prometheus in Agent mode** (`prometheus --agent`) co-located with the project at `tools/prometheus-agent/`. The agent scrapes localhost and forwards via `remote_write` to the hosted endpoint.
- **Browser metrics** route through a small relay endpoint on the Node server, which updates the server's `prom-client` registry with strict server-side label validation. The agent scrapes the same `/metrics` endpoint for both server and relayed-browser data.
- **Identity labels** (`project`, `env`, `installation_id`) live in the **agent's `external_labels` / `scrape_configs.static_configs.labels`**, not the app's registry. The app does not need to know its own deployment identity — that's a property of where it's running.

### Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Direct `remote_write` from app code + custom wrapper | Reinvents WAL, buffering, retries, native-histogram support, snappy/protobuf serialization across four stacks. Maintenance burden too high for the value. |
| Pushgateway pattern | Pushgateway replaces all metrics in a group on every push (incompatible with continuous counters); designed for short batch jobs, not long-running services. |
| Grafana Alloy as the local agent | More flexible (also handles logs/traces) but uses Alloy's River config DSL. For metrics-only and a team new to observability, plain `prometheus --agent` with YAML is simpler and aligned with the bulk of Prometheus tutorials online. We can migrate to Alloy later if we add logs/traces. |
| One global agent per machine instead of per-project | Activation machines sometimes run multiple projects across a build/test cycle. Project-scoped agents are self-contained, gitignored, and torn down with the project. |
| Custom client wrapper around `prometheus-remote-write` libraries | Same reasoning as direct push above — and removes us from the standard `prom-client` / `prometheus_client` ergonomics that match every online tutorial. |

## Plugin layout

```
prometheus-bootstrap/
├── plugin.json
├── README.md                                    # mental model + onboarding flow
└── skills/
    ├── metrics-discovery/SKILL.md               # interview + categorize + scan → metrics-plan.md
    ├── prometheus-reference/SKILL.md            # types, naming, labels, histograms, Zen, alerting
    ├── prometheus-agent-setup/SKILL.md          # download binary, scaffold prometheus.yml, integrate startup
    ├── prometheus-integrate-node/SKILL.md
    ├── prometheus-integrate-browser/SKILL.md
    ├── prometheus-integrate-python/SKILL.md
    ├── prometheus-integrate-touchdesigner/SKILL.md
    ├── metrics-verify/SKILL.md                  # 5-step verification including cardinality smoke test
    └── metrics-dashboard/SKILL.md               # starter PromQL queries + minimal Grafana dashboard JSON
```

Distributed via `/plugin marketplace add <repo>` then `/plugin install prometheus-bootstrap`.

## The onboarding mental model

The plugin README and the top of `prometheus-agent-setup` lead with this analogy, because every other concept depends on it:

> Your app measures things and posts them to a local bulletin board (`/metrics`). The Prometheus agent reads that bulletin board every 15 seconds and forwards readings to the hosted endpoint. You never send data directly to the cloud — the agent handles buffering and retries. If the agent is down, metrics still accumulate locally in the bulletin board; they're just not forwarded until the agent runs again. If the internet is down, the agent buffers up to its WAL limit (~2h of data at default volumes) and resumes when connectivity returns.

The browser pattern needs its own one-liner because it's the part teammates will question:

> Browsers can't speak the remote_write protocol (it needs snappy + protobuf + server-side auth secrets). Instead, the browser posts to a relay route on your own Node server, which folds the data into the server's metrics. The agent then scrapes one endpoint that covers both.

## Cross-cutting conventions

### Required `.env` keys

```
# App-side (read by the app code)
METRICS_PORT=9100                       # where /metrics is exposed
METRICS_RELAY_ENABLED=true              # only if browser integration installed

# Agent-side (read by prometheus.yml)
METRICS_PROJECT=summit2026
METRICS_ENV=dev                         # dev | staging | prod
METRICS_INSTALLATION_ID=station-03      # optional; only for multi-instance deployments
METRICS_REMOTE_WRITE_URL=https://...
METRICS_REMOTE_WRITE_USERNAME=...
METRICS_REMOTE_WRITE_PASSWORD=...
```

`METRICS_PROJECT`, `METRICS_ENV`, `METRICS_INSTALLATION_ID` are interpolated into the agent's config — not consumed by the app. The app stays portable: rename an instance without redeploying app code.

The default identity label name is `installation_id` (generic; works whether the project is a kiosk, a station, a screen, or anything else). Projects with a more natural term — `station`, `kiosk`, `seat`, `node`, `pod` — can rename it project-wide. The reference skill documents this; the rename is a one-shot find/replace in the agent config + any dashboard queries.

### Global labels (applied by the agent, not the app)

In `prometheus.yml`:

```yaml
global:
  external_labels:
    project: ${METRICS_PROJECT}
    env: ${METRICS_ENV}
scrape_configs:
  - job_name: app
    static_configs:
      - targets: ['localhost:${METRICS_PORT}']
        labels:
          installation_id: ${METRICS_INSTALLATION_ID}
```

Reserved labels we never override: `instance`, `job`, `__name__`, and anything starting with `__`.

### Default cadences

Tuned for low-volume activation projects (1–50 concurrent users), not high-throughput services:

| Setting | Default | Source |
|---|---|---|
| `scrape_interval` | 15s | Common Prometheus / Grafana Cloud default |
| `batch_send_deadline` | 10s | Bumped up from Alloy's 5s default — low-volume systems don't need the latency |
| `max_samples_per_send` | 2000 | Alloy default; irrelevant at this volume |
| `min_backoff` / `max_backoff` | 30ms / 5s | Alloy defaults |

All exposed as named values at the top of `prometheus.yml` so they're discoverable and tunable.

### Default metrics installed by every integration skill

| Metric | Source |
|---|---|
| `process_*` (CPU, RSS memory, FDs, GC counts) | `collectDefaultMetrics()` / `ProcessCollector` enabled by default |
| `<app>_build_info{version, git_sha}` gauge = 1 | Scaffolded in the metrics module |
| `up{job=...}` | Provided automatically by the agent for the scrape target |
| `process_start_time_seconds` | Standard collector. Query as `time() - process_start_time_seconds` for uptime — do not invent a separate `uptime_seconds` gauge. |

### Histogram strategy

Classic histograms with documented bucket presets — necessary today because neither `prom-client` (Node, issue #576) nor `prometheus_client` (Python, PR #1104) has shipped stable native histogram support yet.

The reference skill explicitly names native histograms as the canonical Prometheus direction (Zen #10: "native histograms are almost always better"). The agent config sets `scrape_native_histograms: true` from day one, and the integration skills use a metric wrapper API that does not lock in classic-specific concepts — when libraries ship native support, the migration is a localized change.

Bucket presets in the reference skill:

| Use case | Buckets (seconds) |
|---|---|
| HTTP / RPC requests | `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]` (lib default) |
| Scene / state durations | `[1, 2, 5, 10, 20, 30, 60, 120, 300]` |
| Per-frame render time (16ms target) | `[0.005, 0.010, 0.016, 0.020, 0.033, 0.050, 0.100]` |
| Asset load time | `[0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]` |

## Skill-by-skill detail

### 1. `metrics-discovery`

Produces `docs/metrics/metrics-plan.md` — the source of truth for what gets instrumented.

**Three modes (combined):**

- **Interview** — 6–8 focused questions. The set: one-line description; user-facing surface (booth / kiosk / projection / headless); golden path; top 3 failure modes you've seen or worry about; clock/scene/phase concept; hardware dependencies; throughput-sensitive code paths; **"is this deployed in multiple identical instances?"** (drives whether `installation_id` is set).
- **Categorize** — a curated catalog of metric categories relevant to activations: user-flow funnels, scene/state machines, hardware health, WebSocket / hub connections, errors, performance, process health. Each entry explains *why* the metric matters, not just *what* it is.
- **Scan** — greps the codebase for entry points / route handlers / WS message types (→ counters), `try/catch` and error logs (→ error counter candidates), state machine transitions (→ transition counters + state gauges), intervals/loops/event handlers (→ duration histograms), hardware/external IO (→ connectivity gauges).

**Output format** — `docs/metrics/metrics-plan.md` with one entry per metric, including a worked example at the top so teammates know what good "why" looks like:

```markdown
## summit_scene_transition_duration_seconds
- **Type:** histogram (classic, scene-duration buckets)
- **Labels:** scene_from, scene_to  (cardinality: ~36 — 6×6 transition matrix)
- **Help:** "Time from SCENE_ADVANCE receipt to first rendered frame of next scene"
- **Why:** "p95 catches stuck transitions before the audience notices — would drive a warn alert"
- **Where:** SceneRouter.svelte, on scene-key change
```

**Loads** `prometheus-reference` for type and naming guidance during recommendation. **Offers** to invoke the appropriate `prometheus-integrate-<stack>` next but does not auto-jump.

**Anti-pattern calls during discovery:** high-cardinality label proposals, counters where gauges are needed (and vice versa), missing unit suffixes, "vanity metrics" with no alert or dashboard purpose ("what would you do if this number changed?").

### 2. `prometheus-reference`

The shared knowledge spine. Loaded by other skills (discovery for type decisions; verify for naming-convention checks) and also standalone for ad-hoc questions.

**Sections:**

1. **The Zen of Prometheus** — sixteen principles, brief. Lead with "Instrument first, ask questions later" and "Counters rule, gauges suck."
2. **Decision tree** — counter vs gauge vs histogram vs summary, with concrete activation examples for each.
3. **Native histograms** — explicit section. Why they exist, why they're the canonical direction (Zen #10), current library status (Node: not yet; Python: in-flight via PR #1104), what the agent is configured to accept, and the migration shape when libs ship native.
4. **Naming rules** — single-word app prefix, base units (seconds, bytes, ratio 0–1, grams, joules), `_total` / `_info` / `_timestamp_seconds` suffixes, snake_case, single unit per metric, lexicographic grouping when sensible.
5. **Label hygiene** — cardinality budget ~10 per metric, reserved labels (`instance`, `job`, `__name__`, `__*`), forbidden label values (user IDs, emails, free-form strings, timestamps, full URLs), required default 0 for known label combinations.
6. **Histogram bucket presets** — table above.
7. **Anti-patterns** — embedding values in metric names (`scene_intro_count` vs `scene_count{scene="intro"}`); counters that decrement; manual counter resets; computing client-side rates (e.g. exposing `requests_per_second` instead of `requests_total`); summary aggregation across instances; pre-aggregated dimensions instead of labels.
8. **PromQL pattern primer** — rate before aggregate, the canonical shape `sum by (lbl) (rate(metric_total[5m]))` and `histogram_quantile(0.95, sum by (le, lbl) (rate(metric_bucket[5m])))`.
9. **Alerting principles** — urgent / important / actionable / real; symptom not cause; minimum `for: 5m`; context labels; one rule per real on-call concern.

### 3. `prometheus-agent-setup`

Installs and configures the local agent.

**Flow:**

1. **Platform detect** — darwin-arm64 / darwin-amd64 / linux-amd64 / linux-arm64 / windows-amd64 — fail explicitly on unknown platforms with instructions for manual download
2. **Download** the Prometheus binary into `tools/prometheus-agent/` (gitignored). Pin a known-good version. Verify checksum.
3. **Scaffold `tools/prometheus-agent/prometheus.yml`** with `--agent`-compatible config: global scrape_interval, external_labels for project/env, scrape_configs.static_configs.labels for station, remote_write block, `scrape_native_histograms: true` for forward-compatibility.
4. **Append `.env` entries** for the agent-consumed values. Real secrets stay as placeholders; the skill prints what the teammate needs to supply.
5. **Add a startup integration** — `npm run metrics:agent` / equivalent for foreground debugging, and a one-line addition to the project's existing boot script for backgrounded production launch. Never inline credentials in the startup script.
6. **Confirm `.gitignore`** includes `tools/prometheus-agent/prometheus` (binary), `tools/prometheus-agent/data/` (WAL).
7. **Print a "what this is, what it isn't" callout** — including the explicit "we use `prometheus --agent`, not Grafana Alloy" note so a teammate googling "Prometheus agent" doesn't land in Alloy docs and get confused.
8. **Document offline behavior** — WAL buffers up to ~2h at default volumes when the remote endpoint is unreachable. This is expected for activations that may lose internet.

### 4. `prometheus-integrate-node`

Installs `prom-client`, enables `collectDefaultMetrics()`, exposes `/metrics`, scaffolds the metrics module, and wires from the metrics plan.

**Flow:**

1. Preflight — `package.json` exists; `docs/metrics/metrics-plan.md` exists (or accept a minimal default).
2. `npm install prom-client`.
3. Scaffold `src/metrics/index.ts` — `Registry`, `collectDefaultMetrics({ register })`, `<app>_build_info` gauge set to 1 with `version` + `git_sha` from `package.json` / git, helpers `counter()` / `gauge()` / `histogram()` that register on the shared registry.
4. Add an Express (or Fastify / generic Node http) route handler at `GET /metrics` returning `register.metrics()` with `Content-Type: text/plain; version=0.0.4`.
5. For each metric in the plan, generate a stub definition with a `// TODO: instrument here — see metrics-plan.md` comment pointing at the "Where" field.
6. **Counter-safety callout** — comment in the scaffolded module noting that `counter.reset()` is dangerous (causes `rate()` to spike); for resettable counts, use a gauge.
7. Drop in `scripts/verify-metrics.mjs` and run it once.

### 5. `prometheus-integrate-browser`

Depends on the Node integration being present. Scaffolds the in-browser client + the Node-side relay route.

**Flow:**

1. Preflight — Node integration installed; `/metrics` route present.
2. Frontend: `src/lib/metrics.ts` — typed `incr()`, `set()`, `observe()` API, in-memory batching (~100 events or 5s, whichever first), flush via `fetch` + via `navigator.sendBeacon` on `visibilitychange→hidden`.
3. Server relay route: `POST /internal/metrics-relay` — accepts JSON `{metric, type, labels, value}[]`, validates each entry against a server-side **whitelist** of allowed metric names and allowed label values per metric, rejects unknown metrics or unknown label values with 4xx. This is non-negotiable: without it, a browser can inject arbitrary label values and explode cardinality.
4. The relay updates the server's `prom-client` registry; the agent scrapes the same `/metrics` endpoint.
5. Document scrape-staleness implication: browser metric latency-to-Grafana is bounded by `scrape_interval` (15s default), not real time. Avoid framing browser counters as "live."

### 6. `prometheus-integrate-python`

Installs `prometheus_client`, enables `ProcessCollector` + `PlatformCollector`, starts the metrics HTTP server, scaffolds the metrics module, and wires from the plan.

**Flow:**

1. Preflight — `requirements.txt` / `pyproject.toml` present.
2. Add `prometheus_client` to deps.
3. Scaffold `app/metrics.py` — registry, default collectors, `build_info`, helpers, and `start_http_server(int(os.environ["METRICS_PORT"]))` invocation at app startup.
4. For services on gunicorn / uvicorn with multiple workers, use `prometheus_client.multiprocess` mode and a shared directory — the skill detects worker setup and configures accordingly.
5. For CLI / batch scripts: register metrics, run work, write `process_start_time_seconds` + `<app>_last_run_timestamp_seconds`, flush before exit. (The agent still scrapes during the run; for very short runs, prefer ephemeral push-style via a future enhancement — out of scope for v1.)
6. Same "TODO: instrument here" stubs and verify script as Node.

### 7. `prometheus-integrate-touchdesigner`

Installs `prometheus_client` into TD's bundled Python environment, scaffolds a `MetricsExt` COMP extension, exposes `/metrics` on a configured port.

**Flow:**

1. Preflight — `.toe` file present in the project; document where the `MetricsExt` COMP will be created and how to import the `.tox` snippet.
2. Install `prometheus_client` via TD's Python `pip` (modern TD versions ship a working pip; the skill probes for it). If pip is unavailable on the target TD version, fall back to vendoring the library into a `vendor/` folder added to `sys.path` from the COMP extension's init.
3. Generate a `.tox` snippet containing a `MetricsConfig` COMP (TD parameters mirror the `.env` values for in-TD visibility) and a `MetricsExt` Container COMP holding the extension class.
4. `MetricsExt` exposes `Incr(name, labels, by=1)`, `Set(name, labels, value)`, `Observe(name, labels, value)`. Internally uses `prometheus_client` `Counter` / `Gauge` / `Histogram`. Starts the HTTP server on init via `start_http_server`.
5. **Hard cardinality callout** — TD's parameter and operator data are rich and easy to label with. The skill prints a prominent warning: *never label metrics with `op_path`, `par_name`, asset filenames, or any per-frame / per-asset string. Labels must be a small known set of enum-like values. This will crash your agent's memory.*
6. Add a `td_metrics_flush_ts` gauge updated on every extension tick — the verify script reads it from outside TD to confirm the extension is actually firing.

### 8. `metrics-verify`

Five checks in order, fail-fast, each with a clear remediation message.

1. **Exposition format** — `curl localhost:$METRICS_PORT/metrics` returns 200 with valid Prometheus exposition format. Parse a few sample metrics to confirm.
2. **Agent scraping** — query the agent's own metrics endpoint for `up{job="app"}` — should be 1. If 0, agent can see the target host but the target isn't responding.
3. **Agent reaching remote** — DNS + TCP + TLS + auth check against `METRICS_REMOTE_WRITE_URL`. Use a HEAD or empty-body POST to elicit a known response rather than parsing agent logs.
4. **End-to-end round-trip** — push a sentinel metric (`bootstrap_verify_ts` set to `time()`), query the hosted endpoint's read API (Grafana Cloud's `/api/v1/query`) for the sentinel within ~30s. This is the only definitive end-to-end check.
5. **Cardinality smoke test** — fetch `/metrics`, count series per metric and total. Warn if any single metric has >50 series or total series across the app exceeds 5000. Cardinality bugs are silent until billing arrives; catching them at bootstrap is high-leverage.

### 9. `metrics-dashboard`

Closes the DX loop. After verification passes, the teammate has data flowing but stares at an empty Grafana — this skill gives them somewhere to start.

**Flow:**

1. Read `docs/metrics/metrics-plan.md`.
2. For each metric in the plan, generate one canonical PromQL query (rate for counters, raw for gauges, p95 for histograms).
3. Output `docs/metrics/starter-queries.md` with copyable queries and one-line explanations.
4. Generate a minimal `docs/metrics/starter-dashboard.json` — a Grafana dashboard with one panel per metric, ready to import. Use defaults aggressively — not a polished dashboard, just a starting point.
5. Print a checklist of next steps: import the dashboard, decide which queries warrant alerts, define alert rules in Grafana's alerting UI (the plugin does not generate alert rules — too project-specific).

## Templates and shared assets

```
prometheus-bootstrap/templates/
├── verify/
│   ├── check-endpoint.mjs           # used by Node and Browser integrations
│   ├── check-endpoint.py            # used by Python and TouchDesigner integrations
│   ├── check-cardinality.mjs
│   └── check-cardinality.py
├── prometheus-yml/
│   └── prometheus.yml.tmpl          # parameterized agent config
└── dashboards/
    └── starter-panel.json.tmpl      # one-panel scaffold reused by metrics-dashboard
```

## Known limitations and future work

| Item | Notes |
|---|---|
| Native histograms | Defer until `prom-client` and `prometheus_client` ship stable support. Reference skill names them as canonical and the agent already accepts them; integration skills migrate when libs are ready. |
| Logs and traces | Out of scope for v1. Future migration to Grafana Alloy would unlock these in one collector. |
| Alert-rule generation | Out of scope. Too project-specific for templating without risking noisy or wrong alerts. The reference skill teaches the principles; alert authoring is human-driven. |
| Short-lived CLI / batch scripts | Python integration covers them with start-time + last-run timestamp metrics. Push-style for sub-15s scripts deferred to a future enhancement. |
| Cross-machine aggregation | Each machine's agent forwards independently. Hosted endpoint aggregates. We do not run a central Prometheus. |

## Open questions (deferred, not blocking)

- **Touch up TouchDesigner integration** — the pip-vs-vendor fallback is specified, but the exact `.tox` snippet layout, parameter naming on `MetricsConfig`, and the Timer CHOP wiring are best designed against a live TD project during implementation.
- **Browser sample volume** — at very high event rates, the relay route could become a bottleneck. The label-whitelist validation cost should be O(1) per event with a Map. Revisit if a project hits visible latency.
- **Multi-tenant identity** — if a single agent eventually scrapes multiple projects on one machine, the `external_labels` shape needs revisiting. Out of scope for v1 since we chose per-project agents.

## Verification plan for the plugin itself

Before publishing the plugin, manually run all eight skills against a fresh test project to confirm:

- Discovery produces a valid `metrics-plan.md`
- Agent setup installs and configures cleanly on macOS arm64 and Linux amd64 (the two primary developer platforms)
- Each integration skill produces a working `/metrics` endpoint
- Verify catches a deliberately broken endpoint (wrong port), wrong auth, and an injected high-cardinality metric
- Dashboard skill generates a Grafana JSON that imports without errors
- End-to-end: a sentinel metric pushed during verification is queryable on Grafana Cloud within 30s

This verification is itself a task in the implementation plan.
