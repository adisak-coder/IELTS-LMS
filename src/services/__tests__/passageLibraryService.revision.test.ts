import { afterEach, describe, expect, it, vi } from 'vitest';
import { passageLibraryService } from '../passageLibraryService';
import type { Passage } from '../../types';

const originalFetch = global.fetch;

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('passageLibraryService revision handling', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('hydrates missing revision via GET then PATCHes', async () => {
    const id = 'passage-rev-test-1';

    const passage: Passage = {
      id,
      title: 'Title',
      content: '<p>Hello</p>',
      blocks: [],
      images: [],
      wordCount: 1,
    };

    const getPayload = {
      id,
      title: passage.title,
      passageSnapshot: passage,
      difficulty: 'medium',
      topic: 'General',
      tags: [],
      wordCount: 1,
      estimatedTimeMinutes: 5,
      usageCount: 0,
      createdBy: 'tester',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      revision: 3,
    };

    const patchPayload = {
      ...getPayload,
      topic: 'Updated',
      revision: 4,
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(getPayload))
      .mockResolvedValueOnce(jsonResponse(patchPayload));

    global.fetch = fetchMock as typeof fetch;

    const result = await passageLibraryService.updatePassage(id, {
      metadata: { topic: 'Updated' },
    });

    expect(result?.metadata.topic).toBe('Updated');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [firstUrl, firstInit] = fetchMock.mock.calls[0]!;
    expect(String(firstUrl)).toContain(`/api/v1/library/passages/${id}`);
    expect((firstInit as RequestInit | undefined)?.method).toBe('GET');

    const [secondUrl, secondInit] = fetchMock.mock.calls[1]!;
    expect(String(secondUrl)).toContain(`/api/v1/library/passages/${id}`);
    expect((secondInit as RequestInit | undefined)?.method).toBe('PATCH');
    expect(JSON.parse(String((secondInit as RequestInit).body))).toMatchObject({
      revision: 3,
      topic: 'Updated',
    });
  });
});

