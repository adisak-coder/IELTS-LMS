import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../../constants/examDefaults';
import { getExamStateFromEntity } from '../examAdapterService';
import type { ExamState } from '../../types';
import type { ExamEntity, ExamVersion } from '../../types/domain';

describe('getExamStateFromEntity', () => {
  it('hydrates using configSnapshot when it differs from contentSnapshot.config', async () => {
    const configFromContent = createDefaultConfig('Academic', 'Academic');
    configFromContent.general.title = 'Content Title';

    const configFromSnapshot = createDefaultConfig('Academic', 'Academic');
    configFromSnapshot.general.title = 'Snapshot Title';

    const entity: ExamEntity = {
      id: 'exam-1',
      slug: 'exam-1',
      title: 'Exam 1',
      type: 'Academic',
      status: 'draft',
      visibility: 'organization',
      owner: 'System',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentDraftVersionId: 'ver-1',
      currentPublishedVersionId: null,
      canEdit: true,
      canPublish: true,
      canDelete: true,
      schemaVersion: 1,
    };

    const version: ExamVersion = {
      id: 'ver-1',
      examId: 'exam-1',
      versionNumber: 1,
      parentVersionId: null,
      contentSnapshot: {
        title: 'Exam 1',
        type: 'Academic',
        config: configFromContent,
      } as ExamState,
      configSnapshot: configFromSnapshot,
      createdBy: 'System',
      createdAt: new Date().toISOString(),
      isDraft: true,
      isPublished: false,
    };

    const repository = {
      getVersionById: async (versionId: string) => (versionId === 'ver-1' ? version : null),
    };

    const state = await getExamStateFromEntity(entity, repository);
    expect(state.config.general.title).toBe('Snapshot Title');
  });
});

