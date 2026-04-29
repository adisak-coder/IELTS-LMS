#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const METRIC_NAMES = {
  residentBytes: ['backend_process_resident_memory_bytes'],
  residentHighWaterMarkBytes: ['backend_process_resident_memory_high_water_mark_bytes'],
  virtualBytes: ['backend_process_virtual_memory_bytes'],
  heapBytes: ['backend_process_heap_memory_bytes'],
  swapBytes: ['backend_process_swap_memory_bytes'],
  profileFailuresTotal: [
    'backend_process_memory_profile_collection_failures_total_total',
    'backend_process_memory_profile_collection_failures_total',
  ],
};

async function main() {
  const [command = 'capture', ...rest] = process.argv.slice(2);

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'summary') {
    if (!rest[0]) {
      throw new Error('summary requires a file path');
    }
    const samples = loadSamples(rest[0]);
    printSummary(samples, `Summary for ${rest[0]}`);
    return;
  }

  if (command === 'compare') {
    if (!rest[0] || !rest[1]) {
      throw new Error('compare requires <baseline.jsonl> <tuned.jsonl>');
    }
    const baselineSamples = loadSamples(rest[0]);
    const tunedSamples = loadSamples(rest[1]);
    printComparison(baselineSamples, tunedSamples, rest[0], rest[1]);
    return;
  }

  if (command !== 'capture') {
    throw new Error(`unknown command: ${command}`);
  }

  const metricsUrl = process.env.METRICS_URL ?? 'http://127.0.0.1:4000/metrics';
  const intervalSeconds = Number(process.env.IDLE_RAM_INTERVAL_SECONDS ?? 30);
  const durationMinutes = Number(process.env.IDLE_RAM_DURATION_MINUTES ?? 30);
  const outputPath = process.env.IDLE_RAM_OUTPUT_PATH ?? defaultOutputPath();

  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    throw new Error('IDLE_RAM_INTERVAL_SECONDS must be a positive number');
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error('IDLE_RAM_DURATION_MINUTES must be a positive number');
  }

  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  const samples = [];
  const endAt = Date.now() + durationMinutes * 60 * 1000;
  const intervalMs = intervalSeconds * 1000;

  console.error(
    `[idle-ram] capture start: url=${metricsUrl} duration=${durationMinutes}m interval=${intervalSeconds}s output=${outputPath}`,
  );

  while (Date.now() <= endAt) {
    const sampledAt = new Date().toISOString();
    const sample = await sampleMetrics(metricsUrl, sampledAt);
    samples.push(sample);
    fs.appendFileSync(outputPath, `${JSON.stringify(sample)}\n`);

    if (Date.now() + intervalMs > endAt) {
      break;
    }
    await sleep(intervalMs);
  }

  console.error(`[idle-ram] capture complete: samples=${samples.length}`);
  printSummary(samples, `Summary for ${outputPath}`);
}

function printHelp() {
  console.log(`Usage:
  node scripts/idle-ram-window.js capture
  node scripts/idle-ram-window.js summary <run.jsonl>
  node scripts/idle-ram-window.js compare <baseline.jsonl> <tuned.jsonl>

Environment for capture:
  METRICS_URL                  default: http://127.0.0.1:4000/metrics
  IDLE_RAM_INTERVAL_SECONDS    default: 30
  IDLE_RAM_DURATION_MINUTES    default: 30
  IDLE_RAM_OUTPUT_PATH         default: backend/.artifacts/idle-ram-<timestamp>.jsonl
`);
}

async function sampleMetrics(metricsUrl, sampledAt) {
  try {
    const response = await fetch(metricsUrl, {
      headers: { accept: 'text/plain' },
    });
    const text = await response.text();
    const metrics = parsePrometheus(text);

    return {
      sampledAt,
      ok: response.ok,
      status: response.status,
      residentBytes: pickMetric(metrics, METRIC_NAMES.residentBytes),
      residentHighWaterMarkBytes: pickMetric(metrics, METRIC_NAMES.residentHighWaterMarkBytes),
      virtualBytes: pickMetric(metrics, METRIC_NAMES.virtualBytes),
      heapBytes: pickMetric(metrics, METRIC_NAMES.heapBytes),
      swapBytes: pickMetric(metrics, METRIC_NAMES.swapBytes),
      profileFailuresTotal: pickMetric(metrics, METRIC_NAMES.profileFailuresTotal),
    };
  } catch (error) {
    return {
      sampledAt,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      residentBytes: null,
      residentHighWaterMarkBytes: null,
      virtualBytes: null,
      heapBytes: null,
      swapBytes: null,
      profileFailuresTotal: null,
    };
  }
}

function parsePrometheus(text) {
  const values = new Map();

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(/^([^\s{]+)(?:\{[^}]*\})?\s+([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)$/);
    if (!match) {
      continue;
    }

    values.set(match[1], Number(match[2]));
  }

  return values;
}

function pickMetric(values, names) {
  for (const name of names) {
    if (values.has(name)) {
      const value = values.get(name);
      return Number.isFinite(value) ? value : null;
    }
  }
  return null;
}

function defaultOutputPath() {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[:]/g, '-')
    .replace(/\.\d{3}Z$/, 'Z');
  return path.resolve(process.cwd(), `.artifacts/idle-ram-${stamp}.jsonl`);
}

function loadSamples(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function printSummary(samples, title) {
  const fields = [
    'residentBytes',
    'residentHighWaterMarkBytes',
    'virtualBytes',
    'heapBytes',
    'swapBytes',
  ];

  const summary = {
    title,
    sampleCount: samples.length,
    successfulSamples: samples.filter(sample => sample.ok).length,
    firstSampledAt: samples[0]?.sampledAt ?? null,
    lastSampledAt: samples[samples.length - 1]?.sampledAt ?? null,
    metrics: {},
    profileFailures: summarizeSeries(samples, 'profileFailuresTotal'),
  };

  for (const field of fields) {
    summary.metrics[field] = summarizeSeries(samples, field);
  }

  console.log(JSON.stringify(summary, null, 2));
}

function printComparison(baselineSamples, tunedSamples, baselineName, tunedName) {
  const baseline = summaryForComparison(baselineSamples);
  const tuned = summaryForComparison(tunedSamples);

  const comparison = {
    baseline: baselineName,
    tuned: tunedName,
    residentMedianBytes: diffMetric(baseline.residentMedianBytes, tuned.residentMedianBytes),
    residentP95Bytes: diffMetric(baseline.residentP95Bytes, tuned.residentP95Bytes),
    residentMaxBytes: diffMetric(baseline.residentMaxBytes, tuned.residentMaxBytes),
    profileFailuresLast: {
      baseline: baseline.profileFailuresLast,
      tuned: tuned.profileFailuresLast,
    },
  };

  console.log(JSON.stringify(comparison, null, 2));
}

function summaryForComparison(samples) {
  const resident = valuesFor(samples, 'residentBytes');
  const failures = valuesFor(samples, 'profileFailuresTotal');

  return {
    residentMedianBytes: percentile(resident, 0.5),
    residentP95Bytes: percentile(resident, 0.95),
    residentMaxBytes: resident.length > 0 ? Math.max(...resident) : null,
    profileFailuresLast: failures.length > 0 ? failures[failures.length - 1] : null,
  };
}

function diffMetric(baseline, tuned) {
  if (!Number.isFinite(baseline) || !Number.isFinite(tuned)) {
    return {
      baseline,
      tuned,
      absoluteDelta: null,
      percentDelta: null,
    };
  }

  const absoluteDelta = tuned - baseline;
  const percentDelta = baseline === 0 ? null : (absoluteDelta / baseline) * 100;

  return {
    baseline,
    tuned,
    absoluteDelta,
    percentDelta,
  };
}

function summarizeSeries(samples, field) {
  const values = valuesFor(samples, field);
  if (values.length === 0) {
    return {
      count: 0,
      min: null,
      median: null,
      p95: null,
      max: null,
      latest: null,
    };
  }

  return {
    count: values.length,
    min: Math.min(...values),
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
    latest: values[values.length - 1],
  };
}

function valuesFor(samples, field) {
  return samples
    .map(sample => sample[field])
    .filter(value => Number.isFinite(value));
}

function percentile(values, quantile) {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile));
  return sorted[index];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(error => {
  console.error(`[idle-ram] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
