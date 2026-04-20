import { afterEach, describe, expect, it, vi } from 'vitest';

import { isBackendLibraryEnabled } from '../backendBridge';

describe('isBackendLibraryEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    document.cookie = 'app-session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  it('returns true (production backend-only)', () => {
    expect(isBackendLibraryEnabled()).toBe(true);
  });
});
