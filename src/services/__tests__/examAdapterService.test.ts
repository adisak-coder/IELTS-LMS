import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../../constants/examDefaults';
import { hydrateExamState } from '../examAdapterService';

describe('hydrateExamState', () => {
  it('fills missing exam sections when a corrupted draft only contains config', () => {
    const config = createDefaultConfig('Academic', 'Academic');
    config.general.title = 'Recovered Exam';

    const hydrated = hydrateExamState({ config } as any);

    expect(hydrated.title).toBe('Recovered Exam');
    expect(hydrated.reading.passages).toHaveLength(config.sections.reading.passageCount);
    expect(hydrated.listening.parts).toHaveLength(config.sections.listening.partCount);
    expect(hydrated.writing.customPromptTemplates).toEqual([]);
    expect(hydrated.speaking.part1Topics.length).toBeGreaterThan(0);
  });
});
