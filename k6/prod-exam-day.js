import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { randomBytes } from 'k6/crypto';

function readJson(path) {
  try {
    return JSON.parse(open(path));
  } catch (err) {
    throw new Error(`Failed to read JSON at ${path}: ${String(err)}`);
  }
}

function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function uuidV4() {
  const b = new Uint8Array(randomBytes(16));
  // RFC 4122 version 4
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => (`0${x.toString(16)}`).slice(-2)).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function stableHash32(input) {
  // FNV-1a
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash >>> 0;
}

function computeJitterSeconds(runId, wcode, maxSeconds) {
  if (maxSeconds <= 0) return 0;
  const hash = stableHash32(`${runId}:${wcode}`);
  return (hash % maxSeconds) | 0;
}

function resolveBaseUrl(target) {
  return __ENV.K6_BASE_URL || target.baseURL;
}

function resolveScheduleId(target) {
  if (__ENV.K6_SCHEDULE_ID) return __ENV.K6_SCHEDULE_ID;
  const runtimePath = __ENV.K6_RUNTIME_PATH || '../e2e/.generated/prod-runtime.json';
  try {
    const runtime = readJson(runtimePath);
    if (runtime && runtime.scheduleId) return runtime.scheduleId;
  } catch (_) {
    // ignore
  }
  return target.scheduleId;
}

function cookieValue(jar, baseUrl, candidates) {
  const cookies = jar.cookiesForURL(baseUrl);
  for (const name of candidates) {
    const values = cookies[name];
    if (values && values.length > 0) return values[0];
  }
  return '';
}

function csrfHeader(jar, baseUrl) {
  const configured = __ENV.AUTH_CSRF_COOKIE_NAME;
  const candidates = [
    configured && configured.length > 0 ? configured : null,
    '__Host-csrf',
    'csrf',
  ].filter(Boolean);
  const token = cookieValue(jar, baseUrl, candidates);
  return token ? { 'x-csrf-token': token } : {};
}

function jsonHeaders(extra) {
  return Object.assign({ 'content-type': 'application/json' }, extra || {});
}

function pickFirstQuestionId(snapshot) {
  // Heuristic: find the first `questions[].id`.
  const stack = [snapshot];
  while (stack.length) {
    const value = stack.pop();
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) stack.push(value[i]);
      continue;
    }
    if (Array.isArray(value.questions)) {
      for (let i = 0; i < value.questions.length; i += 1) {
        const q = value.questions[i];
        if (q && typeof q === 'object' && typeof q.id === 'string' && q.id.length > 0) return q.id;
      }
    }
    for (const k of Object.keys(value)) stack.push(value[k]);
  }
  return '';
}

function pickFirstWritingTaskId(snapshot) {
  // Heuristic: common shapes include `writing.tasks[]` or nested `tasks[]` with `{id}`.
  const stack = [snapshot];
  while (stack.length) {
    const value = stack.pop();
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) stack.push(value[i]);
      continue;
    }
    if (Array.isArray(value.tasks)) {
      for (let i = 0; i < value.tasks.length; i += 1) {
        const t = value.tasks[i];
        if (t && typeof t === 'object' && typeof t.id === 'string' && t.id.length > 0) return t.id;
      }
    }
    for (const k of Object.keys(value)) stack.push(value[k]);
  }
  return '';
}

// `open()` paths are resolved relative to this script's folder (`k6/`), not `cwd`.
const targetPath = __ENV.K6_TARGET_PATH || '../e2e/prod-data/prod-target.json';
const credsPath = __ENV.K6_CREDS_PATH || '../e2e/prod-data/prod-creds.json';

const target = readJson(targetPath);
const creds = readJson(credsPath);

const baseUrl = resolveBaseUrl(target);
const scheduleId = resolveScheduleId(target);
const runId = __ENV.K6_RUN_ID || `k6-${Date.now()}`;

const allStudents = new SharedArray('students', () => (target.students || []));
const studentCount = clampInt(__ENV.K6_STUDENTS || '3', 1, allStudents.length || 1);
const students = allStudents.slice(0, studentCount);

export const options = {
  scenarios: {
    control: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      exec: 'controlFlow',
      maxDuration: '30m',
    },
    students: {
      executor: 'per-vu-iterations',
      vus: studentCount,
      iterations: 1,
      exec: 'studentFlow',
      maxDuration: '30m',
      startTime: '1s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
  },
};

export function controlFlow() {
  const jar = http.cookieJar();
  const loginResp = http.post(
    `${baseUrl}/api/v1/auth/login`,
    JSON.stringify({ email: creds.editor.email, password: creds.editor.password }),
    { jar, headers: jsonHeaders() },
  );
  check(loginResp, {
    'control login 200': (r) => r.status === 200,
  }) || fail(`Control login failed: status=${loginResp.status} body=${loginResp.body.slice(0, 200)}`);

  // Proctor presence (matches real proctor dashboard behavior).
  const joinResp = http.post(
    `${baseUrl}/api/v1/proctor/sessions/${scheduleId}/presence`,
    JSON.stringify({ action: 'join' }),
    { jar, headers: jsonHeaders(csrfHeader(jar, baseUrl)) },
  );
  check(joinResp, { 'proctor presence join 200': (r) => r.status === 200 }) ||
    fail(`Presence join failed: status=${joinResp.status} body=${joinResp.body.slice(0, 200)}`);

  const threshold = clampInt(__ENV.K6_CHECKED_IN_THRESHOLD || `${Math.min(1, studentCount)}`, 0, studentCount);
  const checkedInTimeoutSeconds = clampInt(__ENV.K6_CHECKED_IN_TIMEOUT_SECONDS || '600', 30, 3600);
  const checkedInStartedAt = Date.now();

  // Wait for at least N student sessions to show up in proctor session detail.
  while (Date.now() - checkedInStartedAt < checkedInTimeoutSeconds * 1000) {
    const detail = http.get(`${baseUrl}/api/v1/proctor/sessions/${scheduleId}`, { jar, headers: csrfHeader(jar, baseUrl) });
    if (detail.status !== 200) {
      sleep(2);
      continue;
    }
    const json = detail.json();
    const sessions = (json && json.data && json.data.sessions) || [];
    if (Array.isArray(sessions) && sessions.length >= threshold) break;
    sleep(2);
  }

  // "Click Start Exam" equivalent: the UI calls this runtime command endpoint.
  const startResp = http.post(
    `${baseUrl}/api/v1/schedules/${scheduleId}/runtime/commands`,
    JSON.stringify({ action: 'start_runtime', reason: `k6 ${runId}` }),
    { jar, headers: jsonHeaders(csrfHeader(jar, baseUrl)) },
  );

  check(startResp, {
    'runtime start 200/409 ok': (r) => r.status === 200 || r.status === 409,
  }) || fail(`Start runtime failed: status=${startResp.status} body=${startResp.body.slice(0, 200)}`);

  const monitorSeconds = clampInt(__ENV.K6_PROCTOR_MONITOR_SECONDS || '180', 0, 1800);
  const heartbeatEverySeconds = clampInt(__ENV.K6_PROCTOR_HEARTBEAT_SECONDS || '15', 5, 120);
  const startedAt = Date.now();
  let lastHeartbeatAt = 0;

  while (Date.now() - startedAt < monitorSeconds * 1000) {
    const now = Date.now();
    if (now - lastHeartbeatAt > heartbeatEverySeconds * 1000) {
      lastHeartbeatAt = now;
      http.post(
        `${baseUrl}/api/v1/proctor/sessions/${scheduleId}/presence`,
        JSON.stringify({ action: 'heartbeat' }),
        { jar, headers: jsonHeaders(csrfHeader(jar, baseUrl)) },
      );
    }

    const detail = http.get(`${baseUrl}/api/v1/proctor/sessions/${scheduleId}`, {
      jar,
      headers: jsonHeaders(csrfHeader(jar, baseUrl)),
    });
    check(detail, { 'proctor session detail 200': (r) => r.status === 200 });

    // Deterministic interventions (optional; default off for stability).
    if (__ENV.K6_PROCTOR_WARN === 'true' && detail.status === 200) {
      const json = detail.json();
      const sessions = ((json || {}).data || {}).sessions || [];
      const first = Array.isArray(sessions) ? sessions[0] : null;
      const attemptId = first && first.attemptId;
      if (attemptId) {
        const warnResp = http.post(
          `${baseUrl}/api/v1/proctor/sessions/${scheduleId}/attempts/${attemptId}/warn`,
          JSON.stringify({ message: `k6 warning ${runId}`, reason: 'k6_warn' }),
          { jar, headers: jsonHeaders(csrfHeader(jar, baseUrl)) },
        );
        check(warnResp, { 'warn 200': (r) => r.status === 200 });
        // Only once.
        __ENV.K6_PROCTOR_WARN = 'done';
      }
    }

    sleep(4);
  }

  http.post(
    `${baseUrl}/api/v1/proctor/sessions/${scheduleId}/presence`,
    JSON.stringify({ action: 'leave' }),
    { jar, headers: jsonHeaders(csrfHeader(jar, baseUrl)) },
  );
}

export function studentFlow() {
  const vuIndex = (__VU - 1) % students.length;
  const student = students[vuIndex];
  const jar = http.cookieJar();

  const maxJitter = clampInt(__ENV.K6_STUDENT_JITTER_MAX_SECONDS || '30', 0, 600);
  const jitter = computeJitterSeconds(runId, student.wcode, maxJitter);
  sleep(jitter);

  const entryResp = http.post(
    `${baseUrl}/api/v1/auth/student/entry`,
    JSON.stringify({
      scheduleId,
      wcode: student.wcode,
      email: student.email,
      studentName: student.fullName,
    }),
    { jar, headers: jsonHeaders() },
  );

  check(entryResp, {
    'student entry 200': (r) => r.status === 200,
  }) || fail(`Student entry failed (${student.wcode}): status=${entryResp.status} body=${entryResp.body.slice(0, 200)}`);

  const clientSessionId = uuidV4();
  const bootstrapResp = http.post(
    `${baseUrl}/api/v1/student/sessions/${scheduleId}/bootstrap`,
    JSON.stringify({
      wcode: student.wcode,
      email: student.email,
      studentKey: '',
      candidateId: '',
      candidateName: '',
      candidateEmail: '',
      clientSessionId,
    }),
    { jar, headers: jsonHeaders(csrfHeader(jar, baseUrl)) },
  );

  check(bootstrapResp, {
    'student bootstrap 200': (r) => r.status === 200,
  }) || fail(`Bootstrap failed (${student.wcode}): status=${bootstrapResp.status} body=${bootstrapResp.body.slice(0, 200)}`);

  const bootstrapJson = bootstrapResp.json();
  const ctx = bootstrapJson && bootstrapJson.data;
  const attempt = ctx && ctx.attempt;
  const attemptId = (attempt && attempt.id) || '';
  const attemptToken = (ctx && ctx.attemptCredential && ctx.attemptCredential.attemptToken) || '';
  const contentSnapshot = (ctx && ctx.version && ctx.version.contentSnapshot) || null;

  if (!attemptId || !attemptToken) {
    fail(`Missing attemptId/attemptToken after bootstrap for ${student.wcode}`);
  }

  // Persist precheck (2-step UI equivalent; backend only needs a snapshot).
  const precheckResp = http.post(
    `${baseUrl}/api/v1/student/sessions/${scheduleId}/precheck`,
    JSON.stringify({
      wcode: student.wcode,
      email: student.email,
      studentKey: '',
      candidateId: '',
      candidateName: '',
      candidateEmail: '',
      clientSessionId,
      preCheck: {
        browser: 'chromium',
        fullscreen: true,
        storage: true,
        network: true,
        screenDetails: true,
      },
      deviceFingerprintHash: null,
    }),
    { jar, headers: jsonHeaders(csrfHeader(jar, baseUrl)) },
  );

  check(precheckResp, {
    'student precheck 200': (r) => r.status === 200,
  }) || fail(`Precheck failed (${student.wcode}): status=${precheckResp.status} body=${precheckResp.body.slice(0, 200)}`);

  // Wait until runtime becomes live via the student session context (matches prod truth).
  const waitTimeoutSeconds = clampInt(__ENV.K6_WAIT_FOR_LIVE_TIMEOUT_SECONDS || '1200', 30, 7200);
  const waitStartedAt = Date.now();
  while (Date.now() - waitStartedAt < waitTimeoutSeconds * 1000) {
    const sessionResp = http.get(`${baseUrl}/api/v1/student/sessions/${scheduleId}`, { jar, headers: jsonHeaders() });
    if (sessionResp.status !== 200) {
      sleep(2);
      continue;
    }
    const json = sessionResp.json();
    const status = (((json || {}).data || {}).runtime || {}).status || '';
    if (status === 'live') break;
    sleep(2);
  }

  // Act like a real client for a short interval: heartbeats + position + some answers.
  const workSeconds = clampInt(__ENV.K6_STUDENT_WORK_SECONDS || '60', 10, 1800);
  const heartbeatEverySeconds = clampInt(__ENV.K6_STUDENT_HEARTBEAT_SECONDS || '10', 5, 120);
  const firstQuestionId = contentSnapshot ? pickFirstQuestionId(contentSnapshot) : '';
  const firstWritingTaskId = contentSnapshot ? pickFirstWritingTaskId(contentSnapshot) : '';
  const workStartedAt = Date.now();
  let lastHbAt = 0;
  let seq = 1;

  while (Date.now() - workStartedAt < workSeconds * 1000) {
    const now = Date.now();
    if (now - lastHbAt > heartbeatEverySeconds * 1000) {
      lastHbAt = now;
      http.post(
        `${baseUrl}/api/v1/student/sessions/${scheduleId}/heartbeat`,
        JSON.stringify({
          attemptId,
          studentKey: '',
          clientSessionId,
          eventType: 'heartbeat',
          payload: null,
          clientTimestamp: new Date().toISOString(),
        }),
        {
          jar,
          headers: jsonHeaders({
            authorization: `Bearer ${attemptToken}`,
          }),
        },
      );
    }

    // Every loop: send a small mutation batch that mirrors the UI adapter behavior.
    const nowIso = new Date().toISOString();
    const module = seq % 3 === 0 ? 'writing' : seq % 2 === 0 ? 'reading' : 'listening';
    const mutations = [
      {
        id: uuidV4(),
        seq,
        timestamp: nowIso,
        mutationType: 'position',
        payload: {
          phase: 'exam',
          currentModule: module,
          currentQuestionId: firstQuestionId || null,
        },
      },
    ];
    seq += 1;

    if (firstQuestionId && module !== 'writing') {
      mutations.push({
        id: uuidV4(),
        seq,
        timestamp: nowIso,
        mutationType: 'answer',
        payload: { questionId: firstQuestionId, value: `k6 ${runId} ${student.wcode} ${module}` },
      });
      seq += 1;
    }
    if (firstWritingTaskId && module === 'writing') {
      mutations.push({
        id: uuidV4(),
        seq,
        timestamp: nowIso,
        mutationType: 'writing_answer',
        payload: { taskId: firstWritingTaskId, value: `k6 ${runId} writing ${student.wcode}` },
      });
      seq += 1;
    }
    if (__ENV.K6_STUDENT_VIOLATIONS === 'true') {
      mutations.push({
        id: uuidV4(),
        seq,
        timestamp: nowIso,
        mutationType: 'violation',
        payload: { violations: [{ type: 'TAB_SWITCH', at: nowIso }] },
      });
      seq += 1;
    }

    const mutationResp = http.post(
      `${baseUrl}/api/v1/student/sessions/${scheduleId}/mutations:batch`,
      JSON.stringify({
        attemptId,
        studentKey: '',
        clientSessionId,
        mutations,
      }),
      {
        jar,
        headers: Object.assign(
          jsonHeaders({
            authorization: `Bearer ${attemptToken}`,
            'Idempotency-Key': uuidV4(),
          }),
        ),
      },
    );
    check(mutationResp, { 'mutation batch 200/409 ok': (r) => r.status === 200 || r.status === 409 }) ||
      fail(`Mutation batch failed (${student.wcode}): status=${mutationResp.status} body=${mutationResp.body.slice(0, 200)}`);

    sleep(2);
  }

  // Submit (end of exam).
  const submitResp = http.post(
    `${baseUrl}/api/v1/student/sessions/${scheduleId}/submit`,
    JSON.stringify({ attemptId, studentKey: '' }),
    {
      jar,
      headers: jsonHeaders({
        authorization: `Bearer ${attemptToken}`,
        'Idempotency-Key': uuidV4(),
      }),
    },
  );

  check(submitResp, {
    'submit 200/409 ok': (r) => r.status === 200 || r.status === 409,
  }) || fail(`Submit failed (${student.wcode}): status=${submitResp.status} body=${submitResp.body.slice(0, 200)}`);

  return;
}
