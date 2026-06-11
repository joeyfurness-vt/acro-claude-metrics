# acro-claude-metrics

A Claude Code plugin for bootstrapping Prometheus metrics on activation / installation projects.

## What it does

When you invoke the skills in this plugin against a new project, you get:

- A `/metrics` endpoint in your app exposing the right metrics, named correctly, with safe labels
- A local Prometheus Agent (`tools/prometheus-agent/`) that scrapes your app and forwards to your hosted Prometheus endpoint
- Verified end-to-end delivery from your app to the cloud, before anything claims to be working
- A starter set of PromQL queries and a starter Grafana dashboard

## Mental model

Your app measures things and posts them to a local bulletin board (`/metrics`). The Prometheus agent reads that bulletin board every 15 seconds and forwards readings to the hosted endpoint. You never send data directly to the cloud — the agent handles buffering and retries. If the agent is down, metrics still accumulate locally; they're just not forwarded until the agent runs again. If the internet is down, the agent buffers up to its WAL limit (~2h of data at default volumes) and resumes when connectivity returns.

Browsers can't speak the remote_write protocol (snappy + protobuf + server-side auth secrets are involved). Instead, the browser posts to a relay route on your own Node server, which folds the data into the server's metrics. The agent then scrapes one endpoint that covers both.

## Install

```bash
/plugin marketplace add https://github.com/joeyfurness-vt/acro-claude-metrics
/plugin install acro-claude-metrics
```

## Typical workflow

1. `/metrics-discovery` — produces `docs/metrics/metrics-plan.md` for your project
2. `/prometheus-agent-setup` — installs the local agent
3. `/prometheus-integrate-<stack>` — one of: node, browser, python, touchdesigner
4. `/metrics-verify` — confirms end-to-end delivery
5. `/metrics-dashboard` — generates starter PromQL + Grafana JSON

## Skills

| Skill | Purpose |
|---|---|
| `metrics-discovery` | Interview + categorize + scan to produce a metrics plan |
| `prometheus-reference` | Cheat sheet: types, naming, labels, histograms, alerting principles |
| `prometheus-agent-setup` | Download Prometheus binary, configure agent mode, integrate startup |
| `prometheus-integrate-node` | `prom-client` + `/metrics` endpoint scaffolding |
| `prometheus-integrate-browser` | In-browser client + Node relay with label whitelist |
| `prometheus-integrate-python` | `prometheus_client` + `start_http_server` scaffolding |
| `prometheus-integrate-touchdesigner` | `MetricsExt` COMP extension for TD |
| `metrics-verify` | 5-step pipeline verification including cardinality smoke test |
| `metrics-dashboard` | Starter PromQL queries + minimal Grafana dashboard JSON |

See `docs/specs/2026-06-10-prometheus-bootstrap-design.md` for the full design.

## License

MIT — see `LICENSE`.
