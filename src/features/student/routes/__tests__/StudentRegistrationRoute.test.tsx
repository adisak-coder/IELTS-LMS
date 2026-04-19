import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentRegistrationRoute } from '../StudentRegistrationRoute';

const navigateMock = vi.fn();
const originalFetch = global.fetch;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderRoute(scheduleId: string) {
  render(
    <MemoryRouter initialEntries={[`/student/${scheduleId}/register`]}>
      <Routes>
        <Route path="/student/:scheduleId/register" element={<StudentRegistrationRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

function submitForm() {
  fireEvent.change(screen.getByLabelText(/wcode/i), {
    target: { value: 'W250334' },
  });
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: 'student@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/full name/i), {
    target: { value: 'Student One' },
  });
  fireEvent.click(screen.getByRole('button', { name: /register/i }));
}

describe('StudentRegistrationRoute', () => {
  afterEach(() => {
    navigateMock.mockReset();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('posts registration to the backend for UUID schedule ids when backend scheduling is enabled', async () => {
    vi.stubEnv('VITE_FEATURE_USE_BACKEND_SCHEDULING', 'true');
    const scheduleId = '550e8400-e29b-41d4-a716-446655440000';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `/api/v1/schedules/${scheduleId}/register`) {
        return jsonResponse({
          registrationId: 'reg-1',
          wcode: 'W250334',
          email: 'student@example.com',
          studentName: 'Student One',
          accessState: 'registered',
        });
      }

      return new Response(JSON.stringify({
        success: false,
        error: { code: 'NOT_FOUND', message: `Unexpected URL: ${url}` },
      }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    });
    global.fetch = fetchMock as typeof fetch;

    renderRoute(scheduleId);
    submitForm();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/v1/schedules/${scheduleId}/register`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            wcode: 'W250334',
            email: 'student@example.com',
            studentName: 'Student One',
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(`/student/${scheduleId}/W250334`);
    });
  });

  it('falls back to local registration flow for legacy non-UUID schedule ids', async () => {
    vi.stubEnv('VITE_FEATURE_USE_BACKEND_SCHEDULING', 'true');
    const fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;

    renderRoute('sched-1776575458010');
    submitForm();

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/student/sched-1776575458010/W250334');
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
