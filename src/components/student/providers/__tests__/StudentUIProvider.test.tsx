import React from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STUDENT_PASSAGE_READABILITY_LEVEL,
  STUDENT_PASSAGE_READABILITY_MAX,
  STUDENT_PASSAGE_READABILITY_MIN,
} from '../../accessibilityScale';
import { StudentUIProvider, useStudentUI } from '../StudentUIProvider';

describe('StudentUIProvider readability controls', () => {
  it('defaults to comfort readability level and clamps increment/decrement', () => {
    let context: ReturnType<typeof useStudentUI> | null = null;

    function Probe() {
      context = useStudentUI();
      return null;
    }

    render(
      <StudentUIProvider>
        <Probe />
      </StudentUIProvider>,
    );

    expect(context).not.toBeNull();
    expect(context!.state.accessibilitySettings.passageReadabilityLevel).toBe(
      DEFAULT_STUDENT_PASSAGE_READABILITY_LEVEL,
    );

    act(() => {
      for (let step = 0; step < 10; step += 1) {
        context!.actions.increasePassageReadability();
      }
    });

    expect(context!.state.accessibilitySettings.passageReadabilityLevel).toBe(
      STUDENT_PASSAGE_READABILITY_MAX,
    );

    act(() => {
      for (let step = 0; step < 10; step += 1) {
        context!.actions.decreasePassageReadability();
      }
    });

    expect(context!.state.accessibilitySettings.passageReadabilityLevel).toBe(
      STUDENT_PASSAGE_READABILITY_MIN,
    );

    act(() => {
      context!.actions.resetPassageReadability();
    });

    expect(context!.state.accessibilitySettings.passageReadabilityLevel).toBe(
      DEFAULT_STUDENT_PASSAGE_READABILITY_LEVEL,
    );
  });
});
