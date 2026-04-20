import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultConfig } from '../../constants/examDefaults';
import { ExamLifecycleService } from '../examLifecycleService';
import { examRepository } from '../examRepository';
import type { ExamState } from '../../types';

const originalFetch = global.fetch;

function buildState(): ExamState {
  const config = createDefaultConfig('Academic', 'Academic');
  return {
    title: 'Backend-backed Exam',
    type: 'Academic',
    activeModule: 'reading',
    activePassageId: 'p1',
    activeListeningPartId: 'l1',
    config,
    reading: { passages: [] },
    listening: { parts: [] },
    writing: { task1Prompt: 'Task 1', task2Prompt: 'Task 2' },
    speaking: { part1Topics: [], cueCard: '', part3Discussion: [] },
  };
}

describe('ExamLifecycleService backend mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('creates an exam and its initial draft through the backend', async () => {
    vi.stubEnv('VITE_FEATURE_USE_BACKEND_BUILDER', 'true');
    const state = buildState();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              id: '11111111-1111-1111-1111-111111111111',
              slug: 'backend-backed-exam',
              title: 'Backend-backed Exam',
              examType: 'Academic',
              status: 'draft',
              visibility: 'organization',
              ownerId: 'owner-1',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              currentDraftVersionId: null,
              currentPublishedVersionId: null,
              schemaVersion: 3,
              revision: 0,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              id: 'ver-1',
              examId: '11111111-1111-1111-1111-111111111111',
              versionNumber: 1,
              parentVersionId: null,
              contentSnapshot: state,
              configSnapshot: state.config,
              createdBy: 'owner-1',
              createdAt: '2026-01-01T00:00:01.000Z',
              isDraft: true,
              isPublished: false,
              revision: 0,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              id: '11111111-1111-1111-1111-111111111111',
              slug: 'backend-backed-exam',
              title: 'Backend-backed Exam',
              examType: 'Academic',
              status: 'draft',
              visibility: 'organization',
              ownerId: 'owner-1',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:01.000Z',
              currentDraftVersionId: 'ver-1',
              currentPublishedVersionId: null,
              schemaVersion: 3,
              revision: 1,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    global.fetch = fetchMock as typeof fetch;

    const service = new ExamLifecycleService(examRepository);
    const result = await service.createExam('Backend-backed Exam', 'Academic', state, 'owner-1');

    expect(result.success).toBe(true);
    expect(result.exam?.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(result.exam?.currentDraftVersionId).toBe('ver-1');
    expect(result.version?.id).toBe('ver-1');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/v1/exams',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/exams/11111111-1111-1111-1111-111111111111/draft',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('updates the exam title metadata when saving a draft', async () => {
    vi.stubEnv('VITE_FEATURE_USE_BACKEND_BUILDER', 'true');
    const state = buildState();
    state.title = 'New Backend Title';
    state.config.general.title = 'New Backend Title';

    const fetchMock = vi
      .fn()
      // initial exam fetch for revision
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              id: '11111111-1111-1111-1111-111111111111',
              slug: 'backend-backed-exam',
              title: 'Backend-backed Exam',
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
      // save draft
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              id: 'ver-2',
              examId: '11111111-1111-1111-1111-111111111111',
              versionNumber: 2,
              parentVersionId: null,
              contentSnapshot: state,
              configSnapshot: state.config,
              createdBy: 'owner-1',
              createdAt: '2026-01-01T00:00:02.000Z',
              isDraft: true,
              isPublished: false,
              revision: 0,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      // refresh exam after draft save (old title, new revision)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              id: '11111111-1111-1111-1111-111111111111',
              slug: 'backend-backed-exam',
              title: 'Backend-backed Exam',
              examType: 'Academic',
              status: 'draft',
              visibility: 'organization',
              ownerId: 'owner-1',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:02.000Z',
              currentDraftVersionId: 'ver-2',
              currentPublishedVersionId: null,
              schemaVersion: 3,
              revision: 1,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      // patch exam metadata
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              id: '11111111-1111-1111-1111-111111111111',
              slug: 'backend-backed-exam',
              title: 'New Backend Title',
              examType: 'Academic',
              status: 'draft',
              visibility: 'organization',
              ownerId: 'owner-1',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:03.000Z',
              currentDraftVersionId: 'ver-2',
              currentPublishedVersionId: null,
              schemaVersion: 3,
              revision: 2,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      // refresh exam after metadata update
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              id: '11111111-1111-1111-1111-111111111111',
              slug: 'backend-backed-exam',
              title: 'New Backend Title',
              examType: 'Academic',
              status: 'draft',
              visibility: 'organization',
              ownerId: 'owner-1',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:03.000Z',
              currentDraftVersionId: 'ver-2',
              currentPublishedVersionId: null,
              schemaVersion: 3,
              revision: 2,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    global.fetch = fetchMock as typeof fetch;

    const service = new ExamLifecycleService(examRepository);

    const result = await service.saveDraft('11111111-1111-1111-1111-111111111111', state, 'owner-1');

    expect(result.success).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        (call) =>
          call[0] === '/api/v1/exams/11111111-1111-1111-1111-111111111111/draft' &&
          (call[1] as RequestInit | undefined)?.method === 'PATCH',
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        (call) =>
          call[0] === '/api/v1/exams/11111111-1111-1111-1111-111111111111' &&
          (call[1] as RequestInit | undefined)?.method === 'PATCH',
      ),
    ).toBe(true);
  });
});
