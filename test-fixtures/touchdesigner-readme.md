# TouchDesigner fixture

TD edits can't be automated from outside the running app. To verify the
TouchDesigner integration skill end-to-end:

1. Open a fresh empty `.toe` file in TouchDesigner (any recent version with Python 3.11+).
2. Save it inside `test-fixtures/touchdesigner-empty/` as `project.toe` (the directory is gitignored alongside other fixture build artifacts).
3. Invoke `prometheus-integrate-touchdesigner` skill against that directory.
4. Follow the printed in-TD wiring steps to create the `MetricsExt` COMP (with its custom parameters) and the Timer CHOP.
5. Start the project's local agent (`tools/prometheus-agent/prometheus --agent --config.file=tools/prometheus-agent/prometheus.yml`).
6. Run `python3 scripts/verify/check-endpoint.py` from outside TD.
7. Confirm `td_metrics_flush_ts` updates in the `/metrics` output (poll `curl localhost:<port>/metrics` every 5s and watch the value increase).

If pip install fails in TD's Python, follow the vendor fallback documented in the skill.

This fixture is documented but not committed — TD `.toe` files are large binaries and don't belong in the repo. Each developer runs the verification once locally to confirm the integration skill works against their TD version.
