import { createDefaultConfig } from '../constants/examDefaults';
import type { ExamConfig } from '../types';
import {
  backendGet,
  backendPut,
  isBackendNotFound,
} from './backendBridge';

let defaultsRevision: number | undefined;

class AdminPreferencesRepository {
  getDefaults(): ExamConfig {
    return createDefaultConfig('Academic', 'Academic');
  }

  async loadDefaults(): Promise<ExamConfig> {
    try {
      const payload = await backendGet<{
        configSnapshot: ExamConfig;
        revision?: number | undefined;
      }>('/v1/settings/exam-defaults');
      defaultsRevision = payload.revision;
      return payload.configSnapshot;
    } catch (error) {
      if (!isBackendNotFound(error)) {
        throw error;
      }

      defaultsRevision = 0;
      return this.getDefaults();
    }
  }

  async saveDefaults(config: ExamConfig) {
    const payload = await backendPut<{
      configSnapshot: ExamConfig;
      revision?: number | undefined;
    }>('/v1/settings/exam-defaults', {
      configSnapshot: config,
      revision: defaultsRevision ?? 0,
    });
    defaultsRevision = payload.revision;
  }
}

export const adminPreferencesRepository = new AdminPreferencesRepository();
