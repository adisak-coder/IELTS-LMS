import { afterEach, describe, expect, it, vi } from 'vitest';

import { isBackendLibraryEnabled } from '../backendBridge';

describe('isBackendLibraryEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    document.cookie = 'app-session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  it('returns false when builder mode is disabled and there is no authenticated session', () => {
    expect(isBackendLibraryEnabled()).toBe(false);
  });

  it('returns true when the builder backend flag is enabled', () => {
    vi.stubEnv('VITE_FEATURE_USE_BACKEND_BUILDER', 'true');

    expect(isBackendLibraryEnabled()).toBe(true);
  });

  it('returns true for authenticated sessions even without the builder backend flag', () => {
    vi.stubEnv('VITE_AUTH_SESSION_COOKIE_NAME', 'app-session');
    document.cookie = 'app-session=active-session; path=/';

    expect(isBackendLibraryEnabled()).toBe(true);
  });
});
