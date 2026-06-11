# MetricsExt COMP parameters

The same COMP that hosts the `MetricsExt` extension also carries its custom
parameters. (One COMP, fewer moving parts.) Add these via
`Customize Component...` on the MetricsExt Container COMP:

| Name | Type | Default | Notes |
|---|---|---|---|
| `Metricsport` | Int | 9100 | Port for the in-TD HTTP server exposing /metrics |
| `Project` | Str | (your project) | Logical project name. Mirrors `METRICS_PROJECT` in `.env`. |
| `Env` | Menu | dev | dev / staging / prod. Mirrors `METRICS_ENV`. |
| `Installationid` | Str |  | Optional. Multi-instance identifier. Mirrors `METRICS_INSTALLATION_ID`. |
| `Appversion` | Str |  | Read by `build_info` gauge. |
| `Gitsha` | Str |  | Read by `build_info` gauge. |
| `Vendorpath` | Folder |  | Optional. Path to vendored `prometheus_client` folder if `pip install` isn't available in your TD's Python. |

These parameters mirror the `.env` values for visibility inside TD — they don't
replace the agent's config. The agent still reads `.env`; these are for the
in-TD `MetricsExt` extension's own use (e.g. labeling `build_info`, choosing
which port to bind).

The extension reads them via `ownerComp.par.Metricsport.eval()`, etc.

## Wiring after parameters are set

1. Drag `MetricsExt.py` onto the COMP's Extensions parameter, set
   `extensionName` to `MetricsExt`, `extensionPromoteAll` to `On`.
2. Create a Timer CHOP next to the COMP. Length 5 seconds, cycle on.
   Set its callback to: `op('MetricsExt').ext.MetricsExt.OnTick()`.
3. Save the `.toe`.

## Verifying the extension is firing

Outside TD, run:

```
node scripts/verify/check-endpoint.mjs
```

Then in PromQL (or `curl localhost:<METRICS_PORT>/metrics`), confirm
`td_metrics_flush_ts` is within the last 30 seconds. If it's stale, the
Timer CHOP isn't firing or the extension isn't loaded.
