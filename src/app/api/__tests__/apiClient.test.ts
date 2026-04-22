import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '../apiClient';

const originalFetch = global.fetch;

function jsonError(status: number, message: string) {
  return new Response(
    JSON.stringify({
      success: false,
      error: { code: 'UNAUTHORIZED', message },
    }),
    {
      status,
      headers: { 'content-type': 'application/json' },
    },
  );
}

describe('apiClient', () => {
  afterEach(() => {
    apiClient.setUnauthorizedHandler(null);
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('invokes the unauthorized handler and rejects with a 401 error', async () => {
    const handler = vi.fn();
    apiClient.setUnauthorizedHandler(handler);

    const fetchMock = vi.fn(async () => jsonError(401, 'Unauthorized'));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiClient.get('/v1/auth/session', { retries: 0 })).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });
});

