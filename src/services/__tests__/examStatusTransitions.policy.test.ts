import { describe, expect, it } from 'vitest';
import { canTransition } from '../policies/examStatusTransitions';

describe('exam status transition policy', () => {
  it('allows known happy-path transitions', () => {
    expect(canTransition('draft', 'draft')).toBe(true);
    expect(canTransition('draft', 'in_review')).toBe(true);
    expect(canTransition('approved', 'published')).toBe(true);
    expect(canTransition('archived', 'draft')).toBe(true);
  });

  it('rejects transitions outside the policy table', () => {
    expect(canTransition('in_review', 'published')).toBe(false);
    expect(canTransition('approved', 'archived')).toBe(false);
    expect(canTransition('published', 'approved')).toBe(false);
  });
});

