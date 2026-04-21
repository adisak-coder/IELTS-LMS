import fs from 'node:fs';
import path from 'node:path';

export type ProdProgressEvent = {
  ts: string;
  runId: string;
  shardIndex: number;
  shardCount: number;
  actor: 'student' | 'control';
  wcode?: string;
  phase: string;
  url?: string;
  detail?: Record<string, unknown>;
};

export function resolveProdProgressPath(params: { runId: string; shardIndex: number; shardCount: number }) {
  const override = process.env['E2E_PROD_PROGRESS_PATH'];
  if (override) return path.resolve(process.cwd(), override);

  return path.resolve(
    process.cwd(),
    'e2e/.generated',
    `prod-progress-${params.runId}-shard-${params.shardIndex}-of-${params.shardCount}.jsonl`,
  );
}

export function makeProgressLogger(params: { runId: string; shardIndex: number; shardCount: number }) {
  const filePath = resolveProdProgressPath(params);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const log = (event: Omit<ProdProgressEvent, 'ts' | 'runId' | 'shardIndex' | 'shardCount'>) => {
    const payload: ProdProgressEvent = {
      ts: new Date().toISOString(),
      runId: params.runId,
      shardIndex: params.shardIndex,
      shardCount: params.shardCount,
      ...event,
    };
    fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
  };

  return { filePath, log };
}

