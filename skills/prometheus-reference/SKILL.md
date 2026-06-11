---
name: prometheus-reference
description: Use when choosing metric types, naming metrics, designing labels, or reviewing existing metrics for best-practice violations. Loaded by other metrics skills and also valid standalone for ad-hoc questions like "is this a counter or a gauge?"
---

# Prometheus reference

This skill is the shared knowledge spine for the rest of the `acro-claude-metrics` plugin. Other skills load it; you can also invoke it directly when you have a single specific question — for example, "is this a counter or a gauge?", "what buckets should I use for this histogram?", or "is this label safe to add?"

The advice here is drawn from the official Prometheus practices documentation ([the Zen of Prometheus](https://prometheus.io/docs/practices/the_zen/), [naming](https://prometheus.io/docs/practices/naming/), [histograms and summaries](https://prometheus.io/docs/practices/histograms/), [instrumentation](https://prometheus.io/docs/practices/instrumentation/)) and from years of running these libraries in production. Where it disagrees with upstream, the local note is called out explicitly.

---

## 1. The Zen of Prometheus

The Prometheus project publishes sixteen guiding principles. They're worth reading in full at <https://prometheus.io/docs/practices/the_zen/>. The short list, with one-line summaries:

1. **Instrument first, ask questions later.** Add metrics during development without waiting for a known requirement. Cheap to add, expensive to add later.
2. **Measure what users care about.** Latency, availability, error rate, throughput — the things a user would notice. Internal counters are secondary.
3. **Labels are the new hierarchies.** Don't bake values into metric names (`scene_intro_count`) — use labels (`scene_count{scene="intro"}`).
4. **Avoid missing metrics.** Export `0` for every label combination you know about, so a missing series doesn't break a dashboard or silence an alert.
5. **Cardinality matters.** Every distinct label-value combination creates a new time series. Keep label values to a small, bounded, enum-like set.
6. **Naming is hard.** Pick a convention and apply it consistently across the project. See §4.
7. **Counters rule and gauges suck.** A counter (monotonically increasing total) is almost always more useful than a gauge of "current rate", because Prometheus can derive the rate, and a counter survives scrape gaps and restarts more gracefully.
8. **First the rate, then aggregate.** `sum(rate(x[5m]))` is correct; `rate(sum(x)[5m])` is not. Apply `rate()` per-series before aggregating, or you'll get reset glitches.
9. **If you can log it, you can have a metric for it.** Every meaningful log line is a candidate counter — turn "error happened" into `errors_total{kind=…}` so it shows up on dashboards and drives alerts.
10. **Native histograms are almost always better than classic histograms.** When client libraries ship support, prefer native histograms — they're cheaper and self-bucketing. See §3.
11. **If you can graph it, you can alert on it.** Any PromQL expression that produces a number can become an alert rule.
12. **If you run it, then you should put an alert on it.** At minimum, alert on `up{job="…"} == 0` for everything you're scraping.
13. **Alerts should be urgent, important, actionable, and real.** Don't page on what you wouldn't wake up for. See §9.
14. **Symptom-based alerts for paging, cause-based for troubleshooting.** Page on user-facing pain ("checkout latency p99 > 2s"). Route causes ("memory > 80%") to dashboards and queues, not pagers.
15. **"Please five more minutes."** Use a minimum `for: 5m` duration on alert rules so transient blips don't page.
16. **Context is king.** Keep enough labels on a series that an alert firing tells the on-call who, what, and where without further investigation.

The two that should anchor every decision in this plugin are **#1 ("Instrument first")** and **#7 ("Counters rule and gauges suck")**. If you're not sure whether to add a metric, add it. If you're not sure whether a thing should be a counter or a gauge, it's a counter.

---

## 2. Decision tree: which metric type?

Prometheus has four metric types. Pick by asking what the metric *is*, not how it'll be used.

```
                  Is the value a count of events
                  that have already happened?
                                │
                        ┌───────┴────────┐
                       yes               no
                        │                │
                        ▼                ▼
                    COUNTER       Does it represent
                    (only goes    a current measurement
                     up; reset    that can go up and down?
                     on restart                │
                     is fine)         ┌────────┴────────┐
                                     yes               no
                                      │                │
                                      ▼                ▼
                                  GAUGE          Do you need a
                                                 distribution
                                                 (quantiles,
                                                  p95, p99)?
                                                      │
                                              ┌───────┴────────┐
                                             yes               no
                                              │                │
                                              ▼                ▼
                                          HISTOGRAM        (rare —
                                          (or SUMMARY,     pick the
                                          but read §7      closest fit;
                                          first)           usually counter)
```

### Counter

A monotonically increasing integer that resets to zero on process restart. Always suffixed `_total`.

Use when you want to count something that has already happened.

Examples for an activation booth:

- `sessions_started_total{entry_point="ipad"}` — one increment per session
- `scene_transitions_total{from="intro", to="quiz"}` — one increment per transition
- `errors_total{component="ws_hub", kind="parse_error"}` — one increment per error
- `ws_messages_total{type="QUIZ_UPDATE", direction="in"}` — one increment per message

Query as `rate(sessions_started_total[5m])` to get sessions-per-second over the last 5 minutes. **Never** expose a "sessions per second" gauge directly — that loses information and breaks during scrape gaps. See §7.

### Gauge

A floating-point value that can go up or down. No special suffix; the name should describe the current quantity (`ws_clients_connected`, `queue_depth`, `temperature_celsius`).

Use when you want to know the current value of something — a population, a level, a temperature, a binary state.

Examples:

- `ws_clients_connected{role="ipad"}` — current WebSocket client count
- `device_connected{device="projector"}` — 0 or 1
- `active_scene{scene="quiz"}` — set the matching scene to 1 and all others to 0
- `queue_depth{queue="render"}` — current queue length

A boolean-style gauge (0/1 per label value) is the right shape for "what state am I in?" — set the active label to 1 and the others to 0. Don't use a string-typed gauge; Prometheus has no string values.

### Histogram

A composite metric that records observations into pre-declared buckets. On the wire you get three series per name: `<name>_bucket{le=…}` (cumulative counts per bucket), `<name>_count`, and `<name>_sum`.

Use for durations, sizes, and any distribution where you care about percentiles or "% of requests under threshold".

Examples:

- `scene_duration_seconds{scene="quiz"}` — how long users spend in each scene
- `http_request_duration_seconds{route, method}` — request latency
- `asset_load_seconds{asset_kind="image"}` — asset load time
- `frame_duration_seconds` — per-frame render time

Bucket choice is critical — see §6 for presets. Bad buckets render the metric useless (everything falls into the `+Inf` bucket and quantiles become noise).

Quantile queries look like `histogram_quantile(0.95, sum by (le, scene) (rate(scene_duration_seconds_bucket[5m])))`. Always `rate()` the bucket counters first — see §8.

### Summary

Like a histogram, but quantiles are calculated client-side and exposed directly. Faster to query, but **cannot be aggregated across instances** — you cannot meaningfully average a p99 across machines, so summaries are a dead-end in multi-instance deployments.

Use only for single-process metrics where you don't care about aggregation. In practice, in this plugin, **prefer histograms**. If you're tempted to reach for a summary, ask whether you actually need quantiles at all, or whether a counter plus a max-gauge would be cheaper and clearer.

### Quick reference

| You want to know… | Type |
|---|---|
| How many of X have happened? | counter |
| What's the current value of X? | gauge |
| What's the rate of X right now? | counter (then `rate()`) |
| What's the p95 / p99 / p50 of X? | histogram |
| What's a single-machine quantile and I don't care about aggregation? | summary (rare) |

---

## 3. Native histograms — the canonical direction

[Native histograms](https://prometheus.io/docs/specs/native_histograms/) are a newer Prometheus data type that records distributions without pre-declared buckets. The server picks bucket boundaries dynamically based on the actual observed values, using a configurable resolution. The result: better accuracy at lower storage cost and no need to pick buckets up-front.

**Zen #10:** *"Native histograms are almost always better than classic histograms."* This is the direction the ecosystem is moving.

### Current library status (as of June 2026)

Despite being the canonical direction, **the major non-Go client libraries do not yet have a stable native-histogram instrumentation API**:

- **Node — `prom-client`**: no native histogram support. Tracked at [`siimon/prom-client#576`](https://github.com/siimon/prom-client/issues/576) — issue open since 2023, no merged PR.
- **Python — `prometheus_client`**: exposition format support shipped in v0.23.0 ([PR #1087](https://github.com/prometheus/client_python/pull/1087) merged August 2025), so the library *can read and forward* native histograms on the OpenMetrics 2.0 protocol. The **instrumentation API** — i.e. the user-facing `Histogram(...)` call that produces native histograms instead of classic ones — is still tracked at [PR #1104](https://github.com/prometheus/client_python/pull/1104), which remains open and not merged. Until #1104 ships, `prometheus_client.Histogram(...)` produces classic histograms only.
- **Go — `client_golang`**: full native histogram instrumentation support has been available for years. Not relevant to this plugin (we don't target Go projects), but it's why everything else is "in flight".

In TouchDesigner we use the Python `prometheus_client` library inside TD's bundled Python, so the same constraint applies.

### What we do today

Use classic histograms with documented bucket presets (§6). Configure the agent to accept native histograms when libraries eventually emit them, so the migration is a one-line change in app code rather than a config rewrite.

The `prometheus-agent-setup` skill configures the agent's `scrape_protocols` to include both the Prometheus protobuf format and OpenMetrics 1.0.0 text:

```yaml
scrape_configs:
  - job_name: app
    scrape_protocols:
      - PrometheusProto       # required for native histograms
      - OpenMetricsText1.0.0  # native histograms also supported here
      - PrometheusText0.0.4   # fallback
```

`PrometheusProto` is the first-choice protocol because native histograms require it. Servers that don't emit native histograms will fall back to text and nothing breaks.

### Migration shape, when the time comes

When `prom-client` or `prometheus_client` ships native histogram instrumentation, the change is local to each metric definition. For Node, that's likely:

```typescript
// Today (classic)
new Histogram({
  name: 'scene_duration_seconds',
  help: 'Time spent in each scene',
  labelNames: ['scene'],
  buckets: [1, 2, 5, 10, 20, 30, 60, 120, 300],
});

// Future (native, illustrative — actual API may differ)
new Histogram({
  name: 'scene_duration_seconds',
  help: 'Time spent in each scene',
  labelNames: ['scene'],
  nativeHistogramBucketFactor: 1.1,   // resolution
});
```

For Python, replacing the `buckets=` arg with a native-mode flag. No PromQL changes — `histogram_quantile()` and `rate()` work identically against native histograms.

The metric wrapper API in this plugin's integration skills (`counter()`, `gauge()`, `histogram()`) does not lock in classic-specific concepts, so the migration is a localized change inside the wrapper rather than every call site.

---

## 4. Naming rules

A metric name is the most stable part of your instrumentation contract — once a dashboard or alert references it, renaming is costly. Spend a minute picking a good name; it will save hours later.

### App prefix

Every metric you define gets a single-word prefix identifying the application:

```
summit_sessions_started_total
acrobat_pdf_renders_total
booth_active_scene
```

The prefix should be the project's short name, lowercase, snake_case, no version. Don't prefix with the company name unless it's genuinely useful — `summit_…` is better than `vtpro_summit_…`.

This is enforced by convention, not by the agent — but consistency is what makes a Grafana data source navigable.

### Base units (always)

Use base SI units, never their multiples or submultiples. The full list from upstream:

| Quantity | Unit | Suffix |
|---|---|---|
| Time | seconds (not ms, not us) | `_seconds` |
| Bytes | bytes (not KB, not MB) | `_bytes` |
| Information | bits | `_bits` |
| Percentages / ratios | unitless 0–1 (not 0–100) | `_ratio` |
| Mass | grams | `_grams` |
| Energy | joules | `_joules` |
| Temperature | celsius | `_celsius` |
| Voltage | volts | `_volts` |
| Current | amperes | `_amperes` |

Examples:

- `http_request_duration_seconds` (not `_milliseconds`)
- `process_resident_memory_bytes` (not `_megabytes`)
- `cpu_usage_ratio` with values in 0–1 (not `_percent` with values in 0–100)

If you need to display the metric in ms or MB, Grafana can scale at display time. The stored values stay in base units.

### Suffixes

Three suffixes carry semantic meaning to Prometheus and to anyone reading the metric:

| Suffix | Meaning | Example |
|---|---|---|
| `_total` | Counter (monotonic, only goes up) | `requests_total` |
| `_info` | Pseudo-metric with `value=1`, used to attach metadata labels | `build_info{version, git_sha}` |
| `_timestamp_seconds` | An event timestamp (Unix epoch); query as `time() - <metric>` to get age | `last_run_timestamp_seconds`, `boot_timestamp_seconds` |

Other suffixes are descriptive only. The `_bucket`, `_count`, and `_sum` suffixes are *generated* by histograms — never write them yourself.

`_info` metrics are a pattern, not a type. They're gauges that always have value 1 and exist purely to expose label values. Use them for things like build version, deployment region, or feature-flag state that you want to join into other queries.

`_timestamp_seconds` metrics are how you expose an event time. Never compute "seconds since X" client-side — emit the timestamp and let PromQL compute `time() - <metric>`. This way the meaning stays correct even if the metric is queried minutes after it was scraped.

### One metric, one quantity, one unit

A metric name MUST refer to a single unit and a single quantity. Don't do this:

```
# Bad — bytes for some labels, count for others
items_total{kind="size_bytes"} 4096
items_total{kind="count"} 17
```

```
# Good — two metrics
items_size_bytes 4096
items_total 17
```

This is the single most-violated naming rule. When you find yourself reaching for a label that switches the unit, split the metric.

### Lowercase snake_case

All ASCII. No camelCase, no hyphens, no dots. Underscores between words. Numbers allowed except as the first character.

### Be consistent within a project

Within a single project, the same kind of thing should always have the same shape:

- All durations end `_duration_seconds`
- All counts end `_total`
- All sizes end `_size_bytes`
- All current-value-of-X gauges follow the same naming pattern

Pick a convention, document it in `docs/metrics/metrics-plan.md`, stick to it.

---

## 5. Label hygiene

Labels are the most powerful and most dangerous feature in Prometheus. Each unique combination of label values creates a new time series. A metric with five labels at 100 values each is half a million series — your agent runs out of memory, your bill explodes, your queries get slow.

### Cardinality budget: ~10 unique values per label

Aim for *no more than ~10 unique values per label per metric*, with rare exceptions. For low-volume activation projects, this is more than enough headroom.

A useful sanity check: across the whole metric (all label combinations), aim for **under 100 active series**. If you're nearing 1000, something is wrong. Cardinality bugs are silent — Prometheus accepts everything and only complains via memory pressure and slow queries. `metrics-verify` runs a cardinality smoke test that warns at >50 series per metric and >5000 series across the app.

### Reserved labels — never set these

Prometheus and the agent both write these. You must not use them as label names on your application metrics:

- **`instance`** — set by the agent to the scrape target's `host:port`
- **`job`** — set by the agent from the scrape config's `job_name`
- **`__name__`** — the metric name itself, queryable as a pseudo-label
- **`__*`** — any label starting with double underscore is reserved for internal use

If you try to set one of these on a metric, the client library may silently drop it or the agent may relabel it. Either way, your data won't end up where you expect.

### Forbidden label values

These categories of values will explode cardinality:

| Forbidden | Why | Use instead |
|---|---|---|
| User IDs (`user_id="42a7b…"`) | Unbounded — one series per user | Don't label by user; aggregate at query time if you must |
| Emails | Same, plus PII | Don't expose PII via metrics; route to logs |
| Free-form strings (error messages, file paths, URLs with query strings) | Unbounded by construction | Bucket into a small enum: `kind="parse_error"`, not `message="…"` |
| Timestamps as label values | Cardinality grows with time forever | Use the metric value or a `_timestamp_seconds` metric |
| Full URLs (`url="/api/v1/things/42a7b/comments/9?ref=…"`) | Path parameters and query strings explode | Normalize to a route template: `route="/api/v1/things/:id/comments/:id"` |
| Per-frame asset names | One series per asset | Bucket into kinds: `asset_kind="image"`, `asset_kind="video"` |
| TouchDesigner operator paths or parameter names | Unbounded; rich and easy to grab | Bucket into op kinds |

When in doubt: would the set of possible values fit on a printed page? If not, it's too high-cardinality to be a label.

### Always export `0` for known label combinations

If you know a label can take values A, B, C, *initialize all three series at startup* with value 0. Do not wait for the first event to create the series.

```typescript
// Bad — series doesn't exist until first error
errors_total.inc({ kind: 'parse_error' });

// Good — series exists at startup, increments later
['parse_error', 'timeout', 'auth_failure'].forEach(kind => {
  errors_total.labels({ kind }).inc(0);
});
```

Why: a missing series breaks dashboards (no line on the graph means the panel is empty, not zero) and silences alerts (`rate(errors_total[5m]) > 0.1` cannot fire if `errors_total` never existed). This is Zen #4.

### Labels are dimensions, not values

If you're tempted to embed a value in a label, ask whether it would be cleaner as two metrics or as the metric value itself. A label is a *dimension you slice by*, not a place to stash data.

```
# Bad — value embedded as label
api_requests_total{response_size="1024"} 1
api_requests_total{response_size="2048"} 1

# Good — value as the metric value of a separate metric
api_requests_total 2
api_response_size_bytes_bucket{le="1024"} 1
api_response_size_bytes_bucket{le="2048"} 2
```

---

## 6. Histogram bucket presets

A histogram's buckets must be picked before you start observing. Bad buckets produce useless quantiles — everything falling into `+Inf` or everything in the first bucket gives you no resolution. The presets below cover the common cases for activation projects.

All buckets are in seconds (Prometheus base unit; see §4). Buckets are cumulative — a value goes into every bucket with `le >=` the value.

### HTTP / RPC requests (library default)

For general request latency. This is `prom-client`'s default and matches the upstream Go library default:

```
[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
```

Resolution is finest at the low end (5ms steps below 50ms), coarser as values grow. Suitable for any web request, gRPC call, internal API call, or short async operation.

### Scene / state durations

For "how long was the user in scene X" or "how long was the FSM in state Y", where durations are seconds to minutes:

```
[1, 2, 5, 10, 20, 30, 60, 120, 300]
```

5-minute (`300s`) ceiling is appropriate for activation sessions where total session length is bounded. If your scenes can run longer, extend with `600, 1800, 3600`.

### Per-frame render time (16ms = 60fps target)

For per-frame durations in a real-time render loop where the target is 60fps (16.67ms per frame):

```
[0.005, 0.010, 0.016, 0.020, 0.033, 0.050, 0.100]
```

The `0.016` bucket is the 60fps target. `0.033` is 30fps. `0.050` is 20fps (visible jank). `0.100` is "the user definitely noticed". 100ms is the ceiling — anything past that is just "very bad", and rendering p99 above 100ms means the system is broken, not that you need more buckets.

### Asset load time

For non-frame I/O — image loads, video metadata, asset prefetches:

```
[0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]
```

50ms floor (anything faster is cached/instant from the user's perspective). 10s ceiling — anything beyond is failure, not slow.

### Picking buckets for a new use case

If none of these fit, follow these rules:

1. **Pick the SLO threshold first.** What's the value that distinguishes "good" from "bad"? Make that a bucket boundary.
2. **Cover at least one order of magnitude on each side** of the SLO threshold with at least 3 buckets each.
3. **End with a bucket that catches the pathological case.** If your SLO is 500ms, a 5s or 10s top bucket lets you spot "completely stuck" cases without polluting the lower buckets.
4. **5–10 buckets is usually right.** Fewer than 5 and you lose resolution. More than ~15 and you're paying for series count without buying useful information.

---

## 7. Anti-patterns

These are the patterns that look reasonable when you write them and that you'll regret later. They appear in roughly the order they're encountered when first instrumenting an app.

### 1. Embedding values in metric names

```
# Bad — one metric per value
scene_intro_count
scene_quiz_count
scene_processing_count

# Good — one metric, value as a label
scene_count{scene="intro"}
scene_count{scene="quiz"}
scene_count{scene="processing"}
```

The bad form makes it impossible to write a generic query like "total scene events across all scenes" — you'd have to enumerate every metric name. The good form lets you write `sum(scene_count)` or `sum by (scene) (scene_count)` directly. Zen #3: labels are the new hierarchies.

### 2. Counters that decrement

A counter is monotonic. If you find yourself reaching for `.dec()` or subtracting from a counter, you've picked the wrong type — use a gauge.

```
# Bad — using a counter to track "in flight" requests
requests_in_flight_total.inc();
// later
requests_in_flight_total.dec();   // counters can't decrement

# Good — gauge for current value
requests_in_flight.inc();
// later
requests_in_flight.dec();
```

The `_total` suffix is your warning sign: it should only ever appear on monotonic counters.

### 3. Manual counter resets

`counter.reset()` exists in some client libraries. **Don't call it.**

`rate()` is designed to handle process restarts (it detects the discontinuity), but a manual reset looks like a spike to the *negative*, which `rate()` cannot distinguish from a normal reset. The query produces wrong values, your dashboards lie, and alerts misfire.

If you need a resettable count (e.g. "items since last clear"), use a gauge — that's the type that can decrement.

### 4. Client-side rate aggregation

```
# Bad — computing the rate in app code and exposing it as a gauge
const requestsPerSecond = recentCount / 60;
requestsPerSecondGauge.set(requestsPerSecond);

# Good — expose the raw counter, let Prometheus rate() it
requestsTotal.inc();
// query: rate(requests_total[1m])
```

The bad form loses information (you can't change the window after the fact), is incorrect during scrape gaps (the gauge holds stale data), and forces you to pick the averaging window in app code. The good form lets you query at any window from any caller.

Same principle for any pre-aggregation: pre-aggregating in app code is almost always a mistake. Prometheus is designed to aggregate at query time; let it.

### 5. Summary aggregation across instances

You cannot meaningfully aggregate a p99 across multiple machines. A `Summary` exposes pre-computed quantiles per instance, and there's no math to combine those into a global p99 — `avg(p99)` is not p99.

If your service runs on >1 instance, use histograms, not summaries. `histogram_quantile()` aggregates the buckets first, then computes the quantile, which is correct.

### 6. Pre-aggregated dimensions instead of labels

```
# Bad — one metric per (kind, status) pair
errors_parse_handled_total
errors_parse_unhandled_total
errors_timeout_handled_total
errors_timeout_unhandled_total

# Good — two labels
errors_total{kind="parse",   handled="true"}
errors_total{kind="parse",   handled="false"}
errors_total{kind="timeout", handled="true"}
errors_total{kind="timeout", handled="false"}
```

The bad form is the same anti-pattern as #1 but at a larger scale. Any time you have N×M variations and you're creating N×M metric names, you want one metric with two labels.

### 7. Querying by metric name pattern

Related to the above: if you find yourself writing `{__name__=~"errors_.*"}` to sum across a family of metrics, the family should have been one metric with a label.

### 8. Histograms with bad bucket choices

Buckets that are too narrow (everything in `+Inf`) or too wide (everything in the first bucket) give you nothing. Spend the 30 seconds to pick from the presets in §6 or to apply the picking rules at the bottom of §6.

### 9. High-cardinality labels (the big one)

See §5. This is the anti-pattern that bills you per month for the rest of your life.

---

## 8. PromQL pattern primer

This section is not a PromQL tutorial. It's the set of canonical shapes you'll write and read most often when working with the metrics this plugin generates, plus the two correctness traps you'll otherwise hit.

### Rate before aggregate (Zen #8)

```promql
# Correct — rate each series, then sum
sum by (route) (rate(http_requests_total[5m]))

# Wrong — sum (which doesn't know about counter resets), then rate
rate(sum by (route) (http_requests_total)[5m:])
```

`rate()` looks at the per-series time-series and detects resets (when the value drops, it's treated as a counter restart, not a negative delta). If you `sum()` first, you lose the per-series structure, and a single instance restarting looks like a global drop. Always `rate()` first.

The same rule applies to `increase()` and `irate()`.

### Canonical counter rate query

```promql
# Total rate (events per second) over the last 5 minutes
sum(rate(events_total[5m]))

# Per-label rate
sum by (kind) (rate(events_total[5m]))

# Per-label rate, top 5
topk(5, sum by (kind) (rate(events_total[5m])))
```

5 minutes is a good default `rate()` window — long enough to smooth scrape jitter (4× the default 15s scrape interval), short enough to catch real changes within a couple of minutes.

### Canonical histogram quantile query

```promql
# p95 latency, per route
histogram_quantile(
  0.95,
  sum by (le, route) (rate(http_request_duration_seconds_bucket[5m]))
)
```

Note the structure:

1. `rate(…_bucket[5m])` first — rates the cumulative bucket counters
2. `sum by (le, route)` — `le` MUST be in the `by` clause; it's the bucket boundary label
3. `histogram_quantile(0.95, …)` outermost

If you forget `le` in the `by` clause, you get `NaN` for everything. This is the most common histogram_quantile mistake; if your quantiles are blank, check this first.

### Gauge queries

Gauges are values, not rates — query them directly:

```promql
ws_clients_connected
sum by (role) (ws_clients_connected)
max_over_time(ws_clients_connected[1h])    # peak over the last hour
avg_over_time(ws_clients_connected[1h])    # average over the last hour
```

For "what fraction of the time was X true?" on a 0/1 gauge:

```promql
avg_over_time(device_connected{device="projector"}[1h])
```

That returns the connected fraction (0–1) over the last hour.

### Uptime / age

```promql
# Uptime (seconds since process start)
time() - process_start_time_seconds

# Age of a timestamp metric
time() - last_run_timestamp_seconds
```

This is why we expose timestamps as `_timestamp_seconds` and never as "age" — querying gives you a current, accurate age, even if the metric was scraped a minute ago.

### up{}

Every scraped target gets an automatic `up{job="…", instance="…"}` gauge from the agent — 1 if the last scrape succeeded, 0 if not. This is the foundation of "is this thing alive" alerts.

```promql
up{job="app"} == 0
```

### Top-N and bottom-N

```promql
topk(5, sum by (route) (rate(http_requests_total[5m])))
bottomk(5, ws_clients_connected)
```

### Ratios

```promql
# Error rate as a fraction of total requests
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))
```

Result is unitless 0–1. Match the §4 rule: don't expose ratios in 0–100, derive them at query time and let Grafana format.

---

## 9. Alerting principles

Alerting is where metrics earn their keep, and where most teams get it wrong. The principles below are abridged from [the Prometheus alerting guide](https://prometheus.io/docs/practices/alerting/) and from operational experience on this kind of system.

### One filter: urgent, important, actionable, real

Before adding any alert, ask:

- **Urgent.** Does this need attention *now*, not tomorrow? If not, it's a dashboard, not an alert.
- **Important.** If it fires and nobody responds, does something bad happen? If not, why is anyone being woken up for it?
- **Actionable.** Is there a specific thing the on-call can do? If the answer is "nothing, just acknowledge", it's not an alert.
- **Real.** Is the underlying signal trustworthy? Will it fire on real conditions and not on benign noise?

An alert that fails any one of these is the alert that gets ignored. After enough ignored alerts, the real ones get ignored too. Be aggressive about *deleting* alert rules that don't pass this filter.

### Page on symptoms, route causes to dashboards (Zen #14)

Page on what the user notices:

- "session completion rate has dropped below 50% for 10 minutes"
- "scene transition p95 is above 5 seconds for 10 minutes"
- "no sessions have started in the last 10 minutes during operating hours"

Don't page on causes:

- ~~"memory usage above 80%"~~ — high memory is a metric to dashboard, not a wake-up call (it might be fine, or might cause a symptom you'd page on anyway)
- ~~"CPU load above 4"~~ — same
- ~~"error count is non-zero"~~ — too noisy; rate-based with a threshold is better

Causes belong on dashboards the on-call uses *after* a symptom-based page wakes them up.

### Minimum `for: 5m` (Zen #15)

Every alert rule should have a `for:` duration, and it should default to 5 minutes:

```yaml
- alert: SessionCompletionLow
  expr: rate(sessions_completed_total[10m]) / rate(sessions_started_total[10m]) < 0.5
  for: 5m
  labels: { severity: warn }
  annotations:
    summary: Session completion under 50%
```

The `for:` clause means the condition must hold for that duration before the alert fires. This filters out transient blips — a single failed scrape, a brief network hiccup, a deploy rollover. 5 minutes is the lower bound; for less urgent alerts use 15 or 30 minutes.

If you're tempted to set `for: 0s`, you almost certainly want a dashboard, not an alert.

### Context labels are mandatory (Zen #16)

When an alert fires, the on-call should know *immediately* what's broken and where. The labels on the firing series do this work.

For this plugin, expect these labels on every series via the agent's `external_labels`:

- `project` (which app)
- `env` (dev / staging / prod)
- `installation_id` (which station, if multi-instance)

Route alerts to channels using these labels. Silence by them. Group by them. If a label is missing, the on-call gets a useless "something is broken somewhere" — that's worse than no alert at all.

### One rule per real on-call concern

If you have ten alert rules that all fire when one underlying thing breaks, you have one *concern* — split the alerts only when the *response* differs:

- "session completion is low" and "scene p95 is high" might be different concerns (different remediation paths)
- "session completion is low" and "session completion is 0%" are the same concern (degree, not kind) — collapse to one with severity escalation

### If you can graph it, you can alert on it (Zen #11)

Any PromQL query that returns a number can become an alert rule. The progression is:

1. Add the metric (Zen #1)
2. Graph it on a dashboard (Zen #11)
3. Add an alert when you know what threshold is "bad"

You don't need to plan the alert when adding the metric. You just need to have the metric so the alert is possible when the threshold becomes clear.

### If you run it, alert on it (Zen #12)

At minimum, every scraped target should have an `up{job="…"} == 0` alert. This is the "the thing isn't even running" baseline. The agent provides `up{}` automatically; you only need to write the rule.

```yaml
- alert: AppDown
  expr: up{job="app"} == 0
  for: 5m
  labels: { severity: page }
  annotations:
    summary: '{{ $labels.project }}/{{ $labels.installation_id }} app is not being scraped'
```

If `for: 5m` is too long for a particular concern, drop it to `2m` — but never lower than the scrape interval × 2 (or you'll false-fire on a single missed scrape).

### What this plugin generates and what it doesn't

This plugin generates **metrics** and **starter dashboards**. It deliberately does **not** generate alert rules — those are too project-specific. Use the principles in this section to write your own once metrics are flowing.
