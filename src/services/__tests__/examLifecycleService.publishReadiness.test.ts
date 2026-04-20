import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExamLifecycleService } from '../examLifecycleService';
import { examRepository } from '../examRepository';
import { createDefaultConfig } from '../../constants/examDefaults';
import type { ExamState } from '../../types';

const originalFetch = global.fetch;

function buildState(): ExamState {
  const config = createDefaultConfig('Academic', 'Academic');
  return {
    title: 'Exam',
    type: 'Academic',
    activeModule: 'reading',
    activePassageId: 'p1',
    activeListeningPartId: 'l1',
    config,
    reading: {
      passages: [
        {
          id: 'p1',
          title: 'Passage 1',
          content: 'Hello world',
          wordCount: 2,
          images: [],
          blocks: [
            {
              id: 'b1',
              type: 'TFNG',
              mode: 'TFNG',
              instruction: 'Read',
              questions: [{ id: 'q1', statement: 'S', correctAnswer: 'T' }],
            },
          ],
        },
      ],
    },
    listening: {
      parts: [
        {
          id: 'l1',
          title: 'Part 1',
          audioUrl: '',
          pins: [],
          blocks: [
            {
              id: 'b2',
              type: 'CLOZE',
              instruction: 'Fill',
              answerRule: 'TWO_WORDS',
              questions: [{ id: 'q2', prompt: 'A ____', correctAnswer: 'test' }],
            },
          ],
        },
      ],
    },
    writing: { task1Prompt: 'Task 1', task2Prompt: 'Task 2' },
    speaking: { part1Topics: ['t'], cueCard: 'c', part3Discussion: ['d'] },
  };
}

describe('ExamLifecycleService publish readiness', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('computes question counts in backend mode instead of returning zeros', async () => {
    vi.stubEnv('VITE_FEATURE_USE_BACKEND_BUILDER', 'true');
    const state = buildState();
    const fetchMock = vi
      .fn()
      // backend validation summary (shallow)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { canPublish: true, errors: [], warnings: [] } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      // exam entity
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              id: 'exam-1',
              slug: 'exam',
              title: 'Exam',
              examType: 'Academic',
              status: 'draft',
              visibility: 'organization',
              ownerId: 'owner-1',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              currentDraftVersionId: 'ver-1',
              currentPublishedVersionId: null,
              schemaVersion: 3,
              revision: 0,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      // version
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              id: 'ver-1',
              examId: 'exam-1',
              versionNumber: 1,
              parentVersionId: null,
              contentSnapshot: state,
              configSnapshot: state.config,
              createdBy: 'owner-1',
              createdAt: '2026-01-01T00:00:01.000Z',
              isDraft: true,
              isPublished: false,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      // schedules list
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    global.fetch = fetchMock as typeof fetch;

    const service = new ExamLifecycleService(examRepository);
    const readiness = await service.getPublishReadiness('exam-1');

    expect(readiness.questionCounts.total).toBeGreaterThan(0);
    expect(readiness.questionCounts.reading).toBeGreaterThan(0);
    expect(readiness.questionCounts.listening).toBeGreaterThan(0);
  });
});
