import { describe, expect, it } from 'vitest';
import { resolveObjectiveAnswerUpdate } from '../resolveObjectiveAnswerUpdate';

describe('resolveObjectiveAnswerUpdate', () => {
  it('updates only the targeted slot when slot metadata is present', () => {
    const result = resolveObjectiveAnswerUpdate(
      ['ONE', 'TWO'],
      'THREE',
      {
        slotIndex: 1,
        slotCount: 2,
        slotValue: 'THREE',
      },
    );

    expect(result).toEqual(['ONE', 'THREE']);
  });

  it('preserves sibling slots when a shorter array arrives without slot metadata', () => {
    const result = resolveObjectiveAnswerUpdate(
      ['ONE', 'TWO', 'THREE'],
      ['ONE'],
      undefined,
    );

    expect(result).toEqual(['ONE', 'TWO', 'THREE']);
  });

  it('expands slots to include sparse indexes when slot metadata targets a higher index', () => {
    const result = resolveObjectiveAnswerUpdate(
      ['ONE'],
      '',
      {
        slotIndex: 3,
        slotCount: 4,
        slotValue: 'FOUR',
      },
    );

    expect(result).toEqual(['ONE', '', '', 'FOUR']);
  });

  it('returns incoming non-slot updates unchanged', () => {
    const result = resolveObjectiveAnswerUpdate(
      ['ONE', 'TWO'],
      'SINGLE',
      undefined,
    );

    expect(result).toBe('SINGLE');
  });
});
