import {
  QuestionBankItem,
  QuestionBankQuery,
  QuestionBlock,
  QuestionMetadata
} from '../types';
import {
  backendDelete,
  backendGet,
  isBackendLibraryEnabled,
  backendPatch,
  backendPost,
} from './backendBridge';
import { logger } from '../utils/logger';

type BackendQuestionBankItem = {
  id: string;
  block: QuestionBlock;
  metadata: {
    id: string;
    difficulty: string;
    topic: string;
    tags: string[];
    createdAt: string;
    usageCount: number;
    lastUsedAt?: string | undefined;
    estimatedTimeMinutes?: number | undefined;
    author?: string | undefined;
  };
  revision: number;
};

const questionRevisions = new Map<string, number>();

class LocalStorageQuestionBank {
  private questions: Map<string, QuestionBankItem> = new Map();
  private readonly STORAGE_KEY = 'question-bank';

  constructor() {
    this.loadFromStorage();
  }

  private saveToStorage(): void {
    try {
      const data = Array.from(this.questions.entries());
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      logger.error('Failed to save question bank to localStorage:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        this.questions = new Map(data);
      }
    } catch (error) {
      logger.error('Failed to load question bank from localStorage:', error);
    }
  }

  addQuestion(block: QuestionBlock, metadata: Omit<QuestionMetadata, 'id' | 'createdAt' | 'usageCount'>): QuestionBankItem {
    const id = `qb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fullMetadata: QuestionMetadata = {
      ...metadata,
      id,
      createdAt: new Date().toISOString(),
      usageCount: 0
    };

    const item: QuestionBankItem = {
      id,
      block,
      metadata: fullMetadata
    };

    this.questions.set(id, item);
    this.saveToStorage();
    return item;
  }

  updateQuestion(id: string, updates: Partial<{ block: QuestionBlock; metadata: Partial<QuestionMetadata> }>): QuestionBankItem | null {
    const existing = this.questions.get(id);
    if (!existing) return null;

    const updated: QuestionBankItem = {
      ...existing,
      ...(updates.block && { block: updates.block }),
      ...(updates.metadata && { metadata: { ...existing.metadata, ...updates.metadata } })
    };

    this.questions.set(id, updated);
    this.saveToStorage();
    return updated;
  }

  deleteQuestion(id: string): boolean {
    const result = this.questions.delete(id);
    if (result) {
      this.saveToStorage();
    }
    return result;
  }

  getQuestion(id: string): QuestionBankItem | null {
    return this.questions.get(id) || null;
  }

  getAllQuestions(): QuestionBankItem[] {
    return Array.from(this.questions.values());
  }

  queryQuestions(query: QuestionBankQuery): QuestionBankItem[] {
    let results = Array.from(this.questions.values());

    if (query.type) {
      results = results.filter(item => item.block.type === query.type);
    }

    if (query.difficulty) {
      results = results.filter(item => item.metadata.difficulty === query.difficulty);
    }

    if (query.topic) {
      results = results.filter(item => item.metadata.topic === query.topic);
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter(item =>
        query.tags!.some(tag => item.metadata.tags.includes(tag))
      );
    }

    if (query.searchTerm) {
      const term = query.searchTerm.toLowerCase();
      results = results.filter(item => {
        const blockJson = JSON.stringify(item.block).toLowerCase();
        const topicMatch = item.metadata.topic.toLowerCase().includes(term);
        const tagMatch = item.metadata.tags.some(t => t.toLowerCase().includes(term));
        return blockJson.includes(term) || topicMatch || tagMatch;
      });
    }

    return results;
  }

  incrementUsageCount(id: string): void {
    const item = this.questions.get(id);
    if (item) {
      item.metadata.usageCount += 1;
      item.metadata.lastUsedAt = new Date().toISOString();
      this.saveToStorage();
    }
  }

  getTopics(): string[] {
    const topics = new Set<string>();
    this.questions.forEach(item => topics.add(item.metadata.topic));
    return Array.from(topics).sort();
  }

  getTags(): string[] {
    const tags = new Set<string>();
    this.questions.forEach(item => {
      item.metadata.tags.forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }

  getQuestionCount(): number {
    return this.questions.size;
  }

  getQuestionCountByType(): Record<string, number> {
    const counts: Record<string, number> = {};
    this.questions.forEach(item => {
      counts[item.block.type] = (counts[item.block.type] || 0) + 1;
    });
    return counts;
  }

  clear(): void {
    this.questions.clear();
    this.saveToStorage();
  }
}

class BackendQuestionBank {
  async getAllQuestions(): Promise<QuestionBankItem[]> {
    const items = await backendGet<BackendQuestionBankItem[]>('/v1/library/questions');
    return items.map((item) => this.mapBackendItem(item));
  }

  async getQuestion(id: string): Promise<QuestionBankItem | null> {
    try {
      const item = await backendGet<BackendQuestionBankItem>(`/v1/library/questions/${id}`);
      return this.mapBackendItem(item);
    } catch (error) {
      if (this.isNotFound(error)) return null;
      throw error;
    }
  }

  async addQuestion(block: QuestionBlock, metadata: Omit<QuestionMetadata, 'id' | 'createdAt' | 'usageCount'>): Promise<QuestionBankItem> {
    const item = await backendPost<BackendQuestionBankItem>('/v1/library/questions', {
      block,
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString(),
        usageCount: 0,
      },
    });
    return this.mapBackendItem(item);
  }

  async updateQuestion(id: string, updates: Partial<{ block: QuestionBlock; metadata: Partial<QuestionMetadata> }>): Promise<QuestionBankItem | null> {
    const revision = questionRevisions.get(id);
    if (revision === undefined) return null;

    const item = await backendPatch<BackendQuestionBankItem>(`/v1/library/questions/${id}`, {
      ...updates,
      revision,
    });
    return this.mapBackendItem(item);
  }

  async deleteQuestion(id: string): Promise<boolean> {
    try {
      await backendDelete(`/v1/library/questions/${id}`);
      questionRevisions.delete(id);
      return true;
    } catch (error) {
      if (this.isNotFound(error)) return false;
      throw error;
    }
  }

  async queryQuestions(query: QuestionBankQuery): Promise<QuestionBankItem[]> {
    const items = await backendGet<BackendQuestionBankItem[]>('/v1/library/questions');
    let results = items.map((item) => this.mapBackendItem(item));

    if (query.type) {
      results = results.filter(item => item.block.type === query.type);
    }

    if (query.difficulty) {
      results = results.filter(item => item.metadata.difficulty === query.difficulty);
    }

    if (query.topic) {
      results = results.filter(item => item.metadata.topic === query.topic);
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter(item =>
        query.tags!.some(tag => item.metadata.tags.includes(tag))
      );
    }

    if (query.searchTerm) {
      const term = query.searchTerm.toLowerCase();
      results = results.filter(item => {
        const blockJson = JSON.stringify(item.block).toLowerCase();
        const topicMatch = item.metadata.topic.toLowerCase().includes(term);
        const tagMatch = item.metadata.tags.some(t => t.toLowerCase().includes(term));
        return blockJson.includes(term) || topicMatch || tagMatch;
      });
    }

    return results;
  }

  async incrementUsageCount(id: string): Promise<void> {
    await backendPatch(`/v1/library/questions/${id}/increment-usage`, {});
  }

  async getTopics(): Promise<string[]> {
    const items = await this.getAllQuestions();
    const topics = new Set<string>();
    items.forEach(item => topics.add(item.metadata.topic));
    return Array.from(topics).sort();
  }

  async getTags(): Promise<string[]> {
    const items = await this.getAllQuestions();
    const tags = new Set<string>();
    items.forEach(item => {
      item.metadata.tags.forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }

  async getQuestionCount(): Promise<number> {
    const items = await this.getAllQuestions();
    return items.length;
  }

  async getQuestionCountByType(): Promise<Record<string, number>> {
    const items = await this.getAllQuestions();
    const counts: Record<string, number> = {};
    items.forEach(item => {
      counts[item.block.type] = (counts[item.block.type] || 0) + 1;
    });
    return counts;
  }

  async clear(): Promise<void> {
    throw new Error('Clear operation not supported for backend question bank');
  }

  private mapBackendItem(item: BackendQuestionBankItem): QuestionBankItem {
    questionRevisions.set(item.id, item.revision);
    return {
      id: item.id,
      block: item.block,
      metadata: {
        ...item.metadata,
        difficulty: item.metadata.difficulty as 'easy' | 'medium' | 'hard',
        author: item.metadata.author ?? '',
      },
    };
  }

  private isNotFound(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      (error as { statusCode?: unknown }).statusCode === 404
    );
  }
}

class HybridQuestionBank {
  constructor(
    private readonly local: LocalStorageQuestionBank,
    private readonly backend: BackendQuestionBank,
  ) {}

  private useBackend(): boolean {
    return isBackendLibraryEnabled();
  }

  getAllQuestions(): Promise<QuestionBankItem[]> {
    return this.useBackend() ? this.backend.getAllQuestions() : Promise.resolve(this.local.getAllQuestions());
  }

  getQuestion(id: string): Promise<QuestionBankItem | null> {
    return this.useBackend() ? this.backend.getQuestion(id) : Promise.resolve(this.local.getQuestion(id));
  }

  addQuestion(block: QuestionBlock, metadata: Omit<QuestionMetadata, 'id' | 'createdAt' | 'usageCount'>): Promise<QuestionBankItem> {
    return this.useBackend() ? this.backend.addQuestion(block, metadata) : Promise.resolve(this.local.addQuestion(block, metadata));
  }

  updateQuestion(id: string, updates: Partial<{ block: QuestionBlock; metadata: Partial<QuestionMetadata> }>): Promise<QuestionBankItem | null> {
    return this.useBackend() ? this.backend.updateQuestion(id, updates) : Promise.resolve(this.local.updateQuestion(id, updates));
  }

  deleteQuestion(id: string): Promise<boolean> {
    return this.useBackend() ? this.backend.deleteQuestion(id) : Promise.resolve(this.local.deleteQuestion(id));
  }

  queryQuestions(query: QuestionBankQuery): Promise<QuestionBankItem[]> {
    return this.useBackend() ? this.backend.queryQuestions(query) : Promise.resolve(this.local.queryQuestions(query));
  }

  incrementUsageCount(id: string): Promise<void> {
    return this.useBackend() ? this.backend.incrementUsageCount(id) : Promise.resolve(this.local.incrementUsageCount(id));
  }

  getTopics(): Promise<string[]> {
    return this.useBackend() ? this.backend.getTopics() : Promise.resolve(this.local.getTopics());
  }

  getTags(): Promise<string[]> {
    return this.useBackend() ? this.backend.getTags() : Promise.resolve(this.local.getTags());
  }

  getQuestionCount(): Promise<number> {
    return this.useBackend() ? this.backend.getQuestionCount() : Promise.resolve(this.local.getQuestionCount());
  }

  getQuestionCountByType(): Promise<Record<string, number>> {
    return this.useBackend() ? this.backend.getQuestionCountByType() : Promise.resolve(this.local.getQuestionCountByType());
  }

  clear(): Promise<void> {
    return this.useBackend() ? this.backend.clear() : Promise.resolve(this.local.clear());
  }
}

// Singleton instance
export const questionBankService = new HybridQuestionBank(
  new LocalStorageQuestionBank(),
  new BackendQuestionBank(),
);
