import React, { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '../../../app/api/apiClient';
import { AuthSessionProvider } from '../authSession';
import { RequireAuth } from '../RequireAuth';
import { authService } from '../../../services/authService';

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

function TriggerUnauthorized() {
  useEffect(() => {
    void apiClient
      .get('/v1/admin/exams', { retries: 0 })
      .catch(() => undefined);
  }, []);

  return <div>admin content</div>;
}

describe('AuthSessionProvider unauthorized handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('clears the session and redirects to login when an API request returns 401', async () => {
    vi.spyOn(authService, 'getSession').mockResolvedValue({
      user: {
        id: 'admin-1',
        email: 'admin@example.com',
        displayName: 'Admin User',
        role: 'admin',
        state: 'active',
      },
      csrfToken: 'csrf-1',
      expiresAt: '2026-01-01T12:00:00.000Z',
    });

    const fetchMock = vi.fn(async () => jsonError(401, 'Unauthorized'));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <MemoryRouter initialEntries={['/admin/exams']}>
        <AuthSessionProvider>
          <Routes>
            <Route
              path="/admin/exams"
              element={(
                <RequireAuth allowedRoles={['admin']}>
                  <TriggerUnauthorized />
                </RequireAuth>
              )}
            />
            <Route path="/login" element={<div>login</div>} />
          </Routes>
        </AuthSessionProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('login')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });
});

