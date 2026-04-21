import { afterEach, describe, expect, it, vi } from 'vitest';
import { questionBankService } from '../questionBankService';
import type { QuestionBlock } from '../../types';

const originalFetch = global.fetch;

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('questionBankService revision handling', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('hydrates missing revision via GET then PATCHes', async () => {
    const id = 'qb-rev-test-1';

    const block: QuestionBlock = {
      id: 'blk-1',
      type: 'TFNG',
      mode: 'TFNG',
      instruction: 'Read',
      questions: [{ id: 'q-1', statement: 'S', correctAnswer: 'T' }],
    };

    const getPayload = {
      id,
      questionType: 'TFNG',
      blockSnapshot: block,
      difficulty: 'medium',
      topic: 'General',
      tags: [],
      usageCount: 0,
      createdBy: 'tester',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      revision: 5,
    };

    const patchPayload = {
      ...getPayload,
      topic: 'Updated',
      revision: 6,
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(getPayload))
      .mockResolvedValueOnce(jsonResponse(patchPayload));

    global.fetch = fetchMock as typeof fetch;

    const result = await questionBankService.updateQuestion(id, {
      metadata: { topic: 'Updated' },
    });

    expect(result?.metadata.topic).toBe('Updated');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [firstUrl, firstInit] = fetchMock.mock.calls[0]!;
    expect(String(firstUrl)).toContain(`/api/v1/library/questions/${id}`);
    expect((firstInit as RequestInit | undefined)?.method).toBe('GET');

    const [secondUrl, secondInit] = fetchMock.mock.calls[1]!;
    expect(String(secondUrl)).toContain(`/api/v1/library/questions/${id}`);
    expect((secondInit as RequestInit | undefined)?.method).toBe('PATCH');
    expect(JSON.parse(String((secondInit as RequestInit).body))).toMatchObject({
      revision: 5,
      topic: 'Updated',
    });
  });
});

