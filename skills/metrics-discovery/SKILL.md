---
name: metrics-discovery
description: Use when starting metrics work on a project — produces docs/metrics/metrics-plan.md by interviewing the user, suggesting from a curated catalog of activation-relevant metric categories, and scanning existing code. Always run this before any prometheus-integrate-<stack> skill.
---

# Metrics discovery

This skill produces `docs/metrics/metrics-plan.md` — the source of truth for what the project measures. Every integration skill reads it; every starter dashboard derives from it.

Discovery has three modes that can be mixed. Always load `prometheus-reference` for type recommendations and naming guidance during this skill.

## Mode 1 — Interview

Ask each question in turn (one per message). Reasonable defaults are fine; the goal is to ground the metric list in the project's actual shape, not produce a comprehensive ethnography.

1. **One-line description of the project.** What does it do?
2. **User-facing surface.** Booth installation / kiosk / projection / immersive AV / headless service / something else?
3. **Golden path.** What does "this is working correctly" look like end-to-end? (What sequence of events should always happen?)
4. **Top 3 failure modes** you've seen or worry about.
5. **Clock / scene / phase concept.** Is there a state machine where timing matters between states?
6. **Hardware dependencies.** Camera, projector, MIDI, OSC, DMX, sensor, kiosk hardware?
7. **Throughput-sensitive paths.** Anything that runs per-frame, per-message, per-request where latency or drop rate matters?
8. **Multi-instance deployment.** Is this deployed on multiple identical machines simultaneously? (If yes, the agent's `installation_id` label distinguishes them.)

Map answers to metric category suggestions using the catalog below.

## Mode 2 — Categorize (the catalog)

Present the seven categories. For each that applies, recommend specific metrics from the table, explaining *why* each one matters (not just what it is). Let the team member pick what to include.

### User flow / engagement

For interactive experiences where success looks like sessions completed.

| Metric | Type | Labels | Why |
|---|---|---|---|
| `<app>_sessions_started_total` | counter | `entry_point` | Funnel top; baseline for everything else |
| `<app>_sessions_completed_total` | counter | (none) | Funnel bottom; ratio with starts is the completion rate |
| `<app>_session_duration_seconds` | histogram (scene-duration buckets) | (none) | p50/p95 catches drift in pacing |
| `<app>_abandoned_at_step_total` | counter | `step` | Where in the flow people drop off; informs UX iteration |

### Scene / state machine

For projects organized around scenes, stages, or phases.

| Metric | Type | Labels | Why |
|---|---|---|---|
| `<app>_scene_transitions_total` | counter | `from`, `to` | Confirms the state machine is exercised as expected |
| `<app>_time_in_scene_seconds` | histogram (scene-duration buckets) | `scene` | Pacing — a scene running long or short is usually a content issue |
| `<app>_active_scene` | gauge (info-style) | `scene` (always 1 for current) | Lets you query "what's running right now across the fleet" |

### Hardware health

For activations with physical dependencies.

| Metric | Type | Labels | Why |
|---|---|---|---|
| `<app>_device_connected` | gauge 0/1 | `device` | Drives the "is the camera plugged in" alert |
| `<app>_device_disconnects_total` | counter | `device` | Catches flapping connections that briefly recover before scrape |
| `<app>_device_last_event_timestamp_seconds` | gauge | `device` | `time() - this` reveals "no events from device X in N seconds" |

### Hub / connection

For projects with WebSocket or other long-lived connection topologies.

| Metric | Type | Labels | Why |
|---|---|---|---|
| `<app>_ws_clients_connected` | gauge | `role` | Capacity sanity check; sudden zero is a hub crash |
| `<app>_ws_messages_total` | counter | `type`, `direction` | Per-message-type throughput; spots stalled messages |
| `<app>_ws_reconnects_total` | counter | (none) | A high reconnect rate is a sign of network instability or a hub leak |

### Errors

Every project. Don't skip this category.

| Metric | Type | Labels | Why |
|---|---|---|---|
| `<app>_errors_total` | counter | `component`, `kind` | One metric covers all error sites; rate is the alert |
| `<app>_unhandled_rejections_total` | counter | (none) | Surfaces uncaught async failures (Node) |

For every line of error logging you add, add a counter increment. Zen #9: "If you can log it, you can have a metric for it."

### Performance

For latency-sensitive paths.

| Metric | Type | Labels | Why |
|---|---|---|---|
| `<app>_frame_duration_seconds` | histogram (frame-time buckets) | (none) | p95 above 16ms = visible jank |
| `<app>_asset_load_seconds` | histogram (asset-load buckets) | `asset_kind` | Slow asset loads delay scene transitions |
| `<app>_render_drops_total` | counter | (none) | Dropped frames; complementary to frame_duration |

### Process health

Most of this is free. Default collectors (Node `collectDefaultMetrics`, Python `ProcessCollector` + `PlatformCollector`) give you:

- `process_cpu_seconds_total` (counter)
- `process_resident_memory_bytes` (gauge)
- `process_open_fds` (gauge)
- `process_start_time_seconds` (gauge)
- Language-specific GC / event loop / handle counts

Uptime is `time() - process_start_time_seconds`. Do not invent a separate `<app>_uptime_seconds` gauge.

The one extra metric you add: `<app>_build_info` (gauge, always 1, labels `version` + `git_sha`). Lets every dashboard answer "what version is this?"

## Mode 3 — Scan (existing code only)

When the project has code already, grep for patterns and propose metrics grounded in what's there. Skip this mode for greenfield projects.

| Grep target | Suggested metric |
|---|---|
| Public route handlers (Express/Fastify/Flask routes, WS message handlers) | `<app>_requests_total{route,method}` counter; `<app>_request_duration_seconds{route,method}` histogram |
| `try { … } catch` blocks and `logger.error(…)` lines | `<app>_errors_total{component,kind}` counter |
| State machine `switch (scene)` / state transitions | `<app>_scene_transitions_total{from,to}` counter + `<app>_active_scene` gauge |
| `setInterval` / `requestAnimationFrame` / event-loop work | duration histogram with appropriate buckets |
| Hardware open/connect calls | connectivity gauge + reconnect counter |
| Message dispatch (e.g. `switch (msg.type)`) | per-type counter with `type` label |

For each proposal, include the actual file path and line range where the metric should be inserted. The integration skill uses that for the `// TODO: instrument here` comment placement.

## Output

Render `docs/metrics/metrics-plan.md` from `<plugin-root>/templates/metrics-plan-template.md`. Include the worked-example block at the top — it is the reference shape; do not delete it.

For each chosen metric, fill in:

- **Type** with the recommendation from `prometheus-reference`'s decision tree
- **Labels** with a cardinality estimate (multiply distinct values per label; warn if estimate exceeds ~10)
- **Help** as a one-line description (will become the metric's `help` text in exposition)
- **Why** as the question the metric answers / the alert it would drive (per Zen #11, "if you can graph it, you can alert on it")
- **Where** with file paths (for the integration skill's stub comments)

## Anti-patterns to call out during discovery

- **High-cardinality labels.** `user_id`, `email`, free-form strings, full URLs, timestamps. Reject these explicitly; suggest grouping by enum-like alternatives.
- **Counters where a gauge is needed**, and vice versa. Consult `prometheus-reference` §2 (decision tree).
- **Metrics without a unit suffix.** Every value-bearing metric needs `_seconds`, `_bytes`, `_ratio`, etc., per `prometheus-reference` §4.
- **Vanity metrics.** Metrics with no alert or dashboard purpose. Ask: "what would you do if this number changed?" If the answer is "I don't know," cut the metric.
- **Embedding values in names.** `scene_intro_count`, `scene_quiz_count`, etc. → one metric with a `scene` label.
- **Pre-aggregation client-side.** Exposing `requests_per_second` (a rate) instead of `requests_total` (a counter). Rates belong in PromQL, not in instrumentation.

## After this skill

Offer to invoke `prometheus-integrate-<stack>` next based on the detected project type. Do not auto-jump — the user should review the plan before instrumentation begins. The plan file lives at `docs/metrics/metrics-plan.md` and is checked into git.
