import { describe, expect, it } from 'vitest';
import { BackendExamRepository } from '../examRepository';

describe('BackendExamRepository violation-rule contract', () => {
  it('fails fast for unsupported violation-rule persistence APIs', async () => {
    const repository = new BackendExamRepository();

    await expect(repository.getViolationRulesByScheduleId('sched-1')).rejects.toThrow(
      /not supported/i,
    );
    await expect(
      repository.saveViolationRule({
        id: 'rule-1',
        scheduleId: 'sched-1',
        triggerType: 'violation_count',
        threshold: 1,
        action: 'warn',
        isEnabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        createdBy: 'Admin',
      }),
    ).rejects.toThrow(/not supported/i);
    await expect(repository.deleteViolationRule('rule-1')).rejects.toThrow(/not supported/i);
  });
});
