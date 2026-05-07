import { useEffect, useMemo, useState } from 'react';
import { listStudentSaveLifecycleEvents, type StudentSaveLifecycleEvent } from '@services/studentSaveLifecycleService';

type StageFilter = '' | 'flush' | 'submit';
type StatusFilter = '' | 'succeeded' | 'failed';

export function StudentSaveLifecyclePage() {
  const [events, setEvents] = useState<StudentSaveLifecycleEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduleId, setScheduleId] = useState('');
  const [attemptId, setAttemptId] = useState('');
  const [stage, setStage] = useState<StageFilter>('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [limit, setLimit] = useState(200);

  const query = useMemo(
    () => ({
      scheduleId: scheduleId.trim() || undefined,
      attemptId: attemptId.trim() || undefined,
      stage: stage || undefined,
      status: status || undefined,
      limit,
    }),
    [attemptId, limit, scheduleId, stage, status],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listStudentSaveLifecycleEvents(query)
      .then((next) => {
        if (!cancelled) {
          setEvents(next);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load save lifecycle events.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Schedule ID</label>
          <input
            value={scheduleId}
            onChange={(event) => setScheduleId(event.target.value)}
            className="w-72 rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="sched-uuid"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Attempt ID</label>
          <input
            value={attemptId}
            onChange={(event) => setAttemptId(event.target.value)}
            className="w-72 rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="attempt-uuid"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Stage</label>
          <select
            value={stage}
            onChange={(event) => setStage(event.target.value as StageFilter)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">all</option>
            <option value="flush">flush</option>
            <option value="submit">submit</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">all</option>
            <option value="failed">failed</option>
            <option value="succeeded">succeeded</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Limit</label>
          <input
            type="number"
            min={1}
            max={1000}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value) || 200)}
            className="w-24 rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {error ? <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Schedule</th>
              <th className="px-3 py-2">Attempt</th>
              <th className="px-3 py-2">Cycle</th>
              <th className="px-3 py-2">Counts</th>
              <th className="px-3 py-2">Latency</th>
              <th className="px-3 py-2">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={9}>
                  Loading...
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={9}>
                  No lifecycle events found.
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <tr key={event.id}>
                  <td className="px-3 py-2">{new Date(event.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{event.stage}</td>
                  <td className="px-3 py-2">{event.status}</td>
                  <td className="px-3 py-2">{event.scheduleId}</td>
                  <td className="px-3 py-2">{event.attemptId}</td>
                  <td className="px-3 py-2">{event.cycleId ?? '-'}</td>
                  <td className="px-3 py-2">
                    {event.requestedMutationCount ?? '-'} / {event.appliedMutationCount ?? '-'}
                  </td>
                  <td className="px-3 py-2">{event.durationMs ?? '-'} ms</td>
                  <td className="px-3 py-2 text-red-700">{event.errorMessage ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

