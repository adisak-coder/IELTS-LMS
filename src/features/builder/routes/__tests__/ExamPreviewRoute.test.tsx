import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialExamState } from '../../../../services/examAdapterService';
import { ExamPreviewRoute } from '../ExamPreviewRoute';

const mockNavigate = vi.fn();
const wrapperSpy = vi.fn();
const mockController = vi.fn();
let searchParams = new URLSearchParams('module=writing');
const setSearchParamsMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ examId: 'exam-1' }),
    useSearchParams: () => [searchParams, setSearchParamsMock],
  };
});

vi.mock('@builder/hooks/useBuilderRouteController', () => ({
  useBuilderRouteController: (...args: unknown[]) => mockController(...args),
}));

vi.mock('@components/student/StudentAppWrapper', () => ({
  StudentAppWrapper: (props: unknown) => {
    wrapperSpy(props);
    return <div data-testid="student-app-wrapper" />;
  },
}));

describe('ExamPreviewRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams('module=writing');
  });

  it('renders preview using the same student app wrapper with preview-safe settings', () => {
    const state = createInitialExamState('Preview exam', 'Academic');
    mockController.mockReturnValue({
      isLoading: false,
      error: null,
      state,
    });

    render(<ExamPreviewRoute />);

    expect(screen.getByTestId('student-app-wrapper')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /preview section/i })).toBeInTheDocument();
    expect(wrapperSpy).toHaveBeenCalledTimes(1);

    const props = wrapperSpy.mock.calls[0]?.[0] as {
      state: unknown;
      attemptSnapshot: { phase: string; currentModule: string };
      showSubmitControls: boolean;
      persistenceEnabled: boolean;
      enableMonitoring: boolean;
      onExit: () => void;
    };

    expect(props.state).toBe(state);
    expect(props.showSubmitControls).toBe(false);
    expect(props.persistenceEnabled).toBe(false);
    expect(props.enableMonitoring).toBe(false);
    expect(props.attemptSnapshot.phase).toBe('exam');
    expect(props.attemptSnapshot.currentModule).toBe('writing');

    props.onExit();
    expect(mockNavigate).toHaveBeenCalledWith('/builder/exam-1/builder', { replace: true });
  });

  it('falls back to the first enabled module when query module is disabled', () => {
    const state = createInitialExamState('Preview exam', 'Academic');
    state.config.sections.listening.enabled = false;
    state.config.sections.reading.enabled = true;
    state.config.sections.writing.enabled = true;
    state.config.sections.speaking.enabled = false;
    searchParams = new URLSearchParams('module=speaking');

    mockController.mockReturnValue({
      isLoading: false,
      error: null,
      state,
    });

    render(<ExamPreviewRoute />);

    const props = wrapperSpy.mock.calls[0]?.[0] as {
      attemptSnapshot: { currentModule: string };
    };

    expect(props.attemptSnapshot.currentModule).toBe('reading');
  });

  it('updates the preview section query param when switching modules', () => {
    const state = createInitialExamState('Preview exam', 'Academic');
    mockController.mockReturnValue({
      isLoading: false,
      error: null,
      state,
    });

    render(<ExamPreviewRoute />);

    fireEvent.change(screen.getByRole('combobox', { name: /preview section/i }), {
      target: { value: 'reading' },
    });

    expect(setSearchParamsMock).toHaveBeenCalledTimes(1);
    const [nextParams, options] = setSearchParamsMock.mock.calls[0] as [URLSearchParams, { replace: boolean }];
    expect(nextParams.get('module')).toBe('reading');
    expect(options).toEqual({ replace: true });
  });
});
