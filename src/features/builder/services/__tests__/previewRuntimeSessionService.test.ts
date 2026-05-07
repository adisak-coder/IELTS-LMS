import { describe, expect, it } from 'vitest';
import { isPreviewRuntimeCohortName } from '../previewRuntimeSessionService';

describe('previewRuntimeSessionService', () => {
  it('detects preview runtime cohort names', () => {
    expect(isPreviewRuntimeCohortName('__preview_runtime__:exam-1:user-1:reading')).toBe(true);
    expect(isPreviewRuntimeCohortName('Cohort A')).toBe(false);
  });
});
