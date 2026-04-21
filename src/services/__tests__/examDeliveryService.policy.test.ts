import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../../constants/examDefaults';
import { ExamDeliveryService } from '../examDeliveryService';

function buildConfig() {
  const config = createDefaultConfig('Academic', 'Academic');
  config.sections.listening.enabled = true;
  config.sections.reading.enabled = true;
  config.sections.writing.enabled = false;
  config.sections.speaking.enabled = false;
  config.sections.listening.order = 1;
  config.sections.reading.order = 2;
  config.sections.listening.duration = 30;
  config.sections.reading.duration = 45;
  config.sections.listening.gapAfterMinutes = 5;
  config.sections.reading.gapAfterMinutes = 0;
  return config;
}

describe('ExamDeliveryService policy', () => {
  it('buildSectionPlan orders enabled sections and computes offsets', () => {
    const service = new ExamDeliveryService();
    const config = buildConfig();

    const plan = service.buildSectionPlan(config);

    expect(plan.sections.map((entry) => entry.sectionKey)).toEqual(['listening', 'reading']);
    expect(plan.sections[0]).toEqual(
      expect.objectContaining({
        sectionKey: 'listening',
        order: 1,
        startOffsetMinutes: 0,
        endOffsetMinutes: 30,
        gapAfterMinutes: 5,
      }),
    );
    expect(plan.sections[1]).toEqual(
      expect.objectContaining({
        sectionKey: 'reading',
        order: 2,
        startOffsetMinutes: 35,
        endOffsetMinutes: 80,
      }),
    );
    expect(plan.plannedDurationMinutes).toBe(80);
  });

  it('validateScheduleWindow fails when end is before start', () => {
    const service = new ExamDeliveryService();
    const config = buildConfig();
    const result = service.validateScheduleWindow(config, '2026-01-01T10:00:00.000Z', '2026-01-01T09:00:00.000Z');

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'window', type: 'error' }),
      ]),
    );
  });

  it('validateScheduleWindow fails when window is shorter than plan', () => {
    const service = new ExamDeliveryService();
    const config = buildConfig();
    const result = service.validateScheduleWindow(config, '2026-01-01T09:00:00.000Z', '2026-01-01T09:30:00.000Z');

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'window', type: 'error' }),
      ]),
    );
  });

  it('validateScheduleWindow flags duplicate section orders', () => {
    const service = new ExamDeliveryService();
    const config = buildConfig();
    config.sections.reading.order = 1;

    const result = service.validateScheduleWindow(config, '2026-01-01T09:00:00.000Z', '2026-01-01T11:00:00.000Z');

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'sections.order',
          type: 'error',
          message: expect.stringContaining('Duplicate section order'),
        }),
      ]),
    );
  });
});

