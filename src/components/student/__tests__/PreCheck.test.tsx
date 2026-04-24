import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultConfig } from '../../../constants/examDefaults';
import { PreCheck } from '../PreCheck';

describe('PreCheck', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      configurable: true,
    });
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    Object.defineProperty(window, 'getScreenDetails', { value: vi.fn(), configurable: true });
    Object.defineProperty(window, 'localStorage', { value: window.localStorage, configurable: true });
  });

  it('enables continue after checks run and submits precheck', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const config = createDefaultConfig('Academic', 'Academic');

    render(<PreCheck config={config} onComplete={onComplete} onExit={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not block continue when checks fail', async () => {
    const config = createDefaultConfig('Academic', 'Academic');
    config.security.requireFullscreen = true;
    config.security.detectSecondaryScreen = true;

    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    Reflect.deleteProperty(window, 'getScreenDetails');

    render(<PreCheck config={config} onComplete={vi.fn()} onExit={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled(),
    );
  });

  it('shows submit error and allows retry', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    onComplete.mockRejectedValueOnce(new Error('Nope'));
    const config = createDefaultConfig('Academic', 'Academic');

    render(<PreCheck config={config} onComplete={onComplete} onExit={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled(),
    );

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(screen.getByText(/Nope/i)).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled(),
    );

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onComplete).toHaveBeenCalledTimes(2);
  });
});
