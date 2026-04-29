# Idle RAM Measurement (API process)

This guide captures and compares idle memory from `/metrics`.

## 1) Baseline capture (before tuning)

```bash
cd backend
METRICS_URL="https://<prod-host>/metrics" \
IDLE_RAM_DURATION_MINUTES=30 \
IDLE_RAM_INTERVAL_SECONDS=30 \
IDLE_RAM_OUTPUT_PATH=".artifacts/idle-ram-baseline.jsonl" \
node ./scripts/idle-ram-window.js capture
```

## 2) Apply API allocator tuning in deployment

Set these env vars for deployment:

- `MALLOC_ARENA_MAX=1`
- `MALLOC_TRIM_THRESHOLD_=131072`
- `MALLOC_MMAP_THRESHOLD_=131072`
- `OTEL_EXPORTER_OTLP_ENDPOINT=` (empty unless intentionally used)

Optional API-only overrides in this repo's start script:

- `API_MALLOC_ARENA_MAX`
- `API_MALLOC_TRIM_THRESHOLD`
- `API_MALLOC_MMAP_THRESHOLD`
- `API_OTEL_EXPORTER_OTLP_ENDPOINT`

## 3) Tuned capture (after deployment)

```bash
cd backend
METRICS_URL="https://<prod-host>/metrics" \
IDLE_RAM_DURATION_MINUTES=30 \
IDLE_RAM_INTERVAL_SECONDS=30 \
IDLE_RAM_OUTPUT_PATH=".artifacts/idle-ram-tuned.jsonl" \
node ./scripts/idle-ram-window.js capture
```

## 4) Compare baseline vs tuned

```bash
cd backend
node ./scripts/idle-ram-window.js compare \
  .artifacts/idle-ram-baseline.jsonl \
  .artifacts/idle-ram-tuned.jsonl
```

Key fields to inspect:

- `residentMedianBytes`
- `residentP95Bytes`
- `residentMaxBytes`
- `profileFailuresLast` (should remain `0`)

## 5) Functional safety checks

Verify after tuning:

```bash
curl -i "https://<prod-host>/healthz"
curl -i "https://<prod-host>/readyz"
curl -i "https://<prod-host>/metrics"
```

All should return HTTP `200`.
