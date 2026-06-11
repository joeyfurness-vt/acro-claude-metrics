# Metrics Plan — <project-name>

> Source of truth for what this project measures. Update this file when you
> add, remove, or rename a metric. The integration skills read this file
> when scaffolding instrumentation.

## Worked example (do not delete — used as a reference shape)

### summit_scene_transition_duration_seconds
- **Type:** histogram (classic, scene-duration buckets `[1, 2, 5, 10, 20, 30, 60, 120, 300]`)
- **Labels:** `scene_from`, `scene_to` (cardinality: ~36 — 6×6 transition matrix)
- **Help:** "Time from SCENE_ADVANCE receipt to first rendered frame of next scene"
- **Why:** "p95 catches stuck transitions before the audience notices; would drive a warn alert"
- **Where:** `SceneRouter.svelte`, on scene-key change

---

## <metric_name_1>
- **Type:**
- **Labels:**
- **Help:**
- **Why:**
- **Where:**

## <metric_name_2>
- **Type:**
- **Labels:**
- **Help:**
- **Why:**
- **Where:**
