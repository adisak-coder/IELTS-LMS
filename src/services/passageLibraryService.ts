import {
  PassageLibraryItem,
  PassageLibraryQuery,
  Passage,
  PassageMetadata
} from '../types';
import {
  backendDelete,
  backendGet,
  isBackendLibraryEnabled,
  backendPatch,
  backendPost,
} from './backendBridge';
import { logger } from '../utils/logger';

type BackendPassageItem = {
  id: string;
  passage: Passage;
  metadata: {
    id: string;
    topic: string;
    difficulty: string;
    wordCount: number;
    source: string;
    tags: string[];
    createdAt: string;
    usageCount: number;
    lastUsedAt?: string | undefined;
    estimatedTimeMinutes?: number | undefined;
    author?: string | undefined;
  };
  revision: number;
};

const passageRevisions = new Map<string, number>();

class LocalStoragePassageLibrary {
  private passages: Map<string, PassageLibraryItem> = new Map();
  private readonly STORAGE_KEY = 'passage-library';

  constructor() {
    this.loadFromStorage();
  }

  private saveToStorage(): void {
    try {
      const data = Array.from(this.passages.entries());
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      logger.error('Failed to save passage library to localStorage:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        this.passages = new Map(data);
      }
    } catch (error) {
      logger.error('Failed to load passage library from localStorage:', error);
    }
  }

  addPassage(passage: Passage, metadata: Omit<PassageMetadata, 'id' | 'createdAt' | 'usageCount'>): PassageLibraryItem {
    const id = `pl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fullMetadata: PassageMetadata = {
      ...metadata,
      id,
      createdAt: new Date().toISOString(),
      usageCount: 0
    };

    const item: PassageLibraryItem = {
      id,
      passage,
      metadata: fullMetadata
    };

    this.passages.set(id, item);
    this.saveToStorage();
    return item;
  }

  updatePassage(id: string, updates: Partial<{ passage: Passage; metadata: Partial<PassageMetadata> }>): PassageLibraryItem | null {
    const existing = this.passages.get(id);
    if (!existing) return null;

    const updated: PassageLibraryItem = {
      ...existing,
      ...(updates.passage && { passage: updates.passage }),
      ...(updates.metadata && { metadata: { ...existing.metadata, ...updates.metadata } })
    };

    this.passages.set(id, updated);
    this.saveToStorage();
    return updated;
  }

  deletePassage(id: string): boolean {
    const result = this.passages.delete(id);
    if (result) {
      this.saveToStorage();
    }
    return result;
  }

  getPassage(id: string): PassageLibraryItem | null {
    return this.passages.get(id) || null;
  }

  getAllPassages(): PassageLibraryItem[] {
    return Array.from(this.passages.values());
  }

  queryPassages(query: PassageLibraryQuery): PassageLibraryItem[] {
    let results = Array.from(this.passages.values());

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

    if (query.minWordCount !== undefined) {
      results = results.filter(item => item.metadata.wordCount >= query.minWordCount!);
    }

    if (query.maxWordCount !== undefined) {
      results = results.filter(item => item.metadata.wordCount <= query.maxWordCount!);
    }

    if (query.searchTerm) {
      const term = query.searchTerm.toLowerCase();
      results = results.filter(item => {
        const titleMatch = item.passage.title.toLowerCase().includes(term);
        const contentMatch = item.passage.content.toLowerCase().includes(term);
        const topicMatch = item.metadata.topic.toLowerCase().includes(term);
        const sourceMatch = item.metadata.source.toLowerCase().includes(term);
        const tagMatch = item.metadata.tags.some(t => t.toLowerCase().includes(term));
        return titleMatch || contentMatch || topicMatch || sourceMatch || tagMatch;
      });
    }

    return results;
  }

  incrementUsageCount(id: string): void {
    const item = this.passages.get(id);
    if (item) {
      item.metadata.usageCount += 1;
      item.metadata.lastUsedAt = new Date().toISOString();
      this.saveToStorage();
    }
  }

  getTopics(): string[] {
    const topics = new Set<string>();
    this.passages.forEach(item => topics.add(item.metadata.topic));
    return Array.from(topics).sort();
  }

  getSources(): string[] {
    const sources = new Set<string>();
    this.passages.forEach(item => sources.add(item.metadata.source));
    return Array.from(sources).sort();
  }

  getTags(): string[] {
    const tags = new Set<string>();
    this.passages.forEach(item => {
      item.metadata.tags.forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }

  getPassageCount(): number {
    return this.passages.size;
  }

  clear(): void {
    this.passages.clear();
    this.saveToStorage();
  }
}

class BackendPassageLibrary {
  async getAllPassages(): Promise<PassageLibraryItem[]> {
    const items = await backendGet<BackendPassageItem[]>('/v1/library/passages');
    return items.map((item) => this.mapBackendItem(item));
  }

  async getPassage(id: string): Promise<PassageLibraryItem | null> {
    try {
      const item = await backendGet<BackendPassageItem>(`/v1/library/passages/${id}`);
      return this.mapBackendItem(item);
    } catch (error) {
      if (this.isNotFound(error)) return null;
      throw error;
    }
  }

  async addPassage(passage: Passage, metadata: Omit<PassageMetadata, 'id' | 'createdAt' | 'usageCount'>): Promise<PassageLibraryItem> {
    const item = await backendPost<BackendPassageItem>('/v1/library/passages', {
      passage,
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString(),
        usageCount: 0,
      },
    });
    return this.mapBackendItem(item);
  }

  async updatePassage(id: string, updates: Partial<{ passage: Passage; metadata: Partial<PassageMetadata> }>): Promise<PassageLibraryItem | null> {
    const revision = passageRevisions.get(id);
    if (revision === undefined) return null;

    const item = await backendPatch<BackendPassageItem>(`/v1/library/passages/${id}`, {
      ...updates,
      revision,
    });
    return this.mapBackendItem(item);
  }

  async deletePassage(id: string): Promise<boolean> {
    try {
      await backendDelete(`/v1/library/passages/${id}`);
      passageRevisions.delete(id);
      return true;
    } catch (error) {
      if (this.isNotFound(error)) return false;
      throw error;
    }
  }

  async queryPassages(query: PassageLibraryQuery): Promise<PassageLibraryItem[]> {
    const items = await backendGet<BackendPassageItem[]>('/v1/library/passages');
    let results = items.map((item) => this.mapBackendItem(item));

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

    if (query.minWordCount !== undefined) {
      results = results.filter(item => item.metadata.wordCount >= query.minWordCount!);
    }

    if (query.maxWordCount !== undefined) {
      results = results.filter(item => item.metadata.wordCount <= query.maxWordCount!);
    }

    if (query.searchTerm) {
      const term = query.searchTerm.toLowerCase();
      results = results.filter(item => {
        const titleMatch = item.passage.title.toLowerCase().includes(term);
        const contentMatch = item.passage.content.toLowerCase().includes(term);
        const topicMatch = item.metadata.topic.toLowerCase().includes(term);
        const sourceMatch = item.metadata.source.toLowerCase().includes(term);
        const tagMatch = item.metadata.tags.some(t => t.toLowerCase().includes(term));
        return titleMatch || contentMatch || topicMatch || sourceMatch || tagMatch;
      });
    }

    return results;
  }

  async incrementUsageCount(id: string): Promise<void> {
    await backendPatch(`/v1/library/passages/${id}/increment-usage`, {});
  }

  async getTopics(): Promise<string[]> {
    const items = await this.getAllPassages();
    const topics = new Set<string>();
    items.forEach(item => topics.add(item.metadata.topic));
    return Array.from(topics).sort();
  }

  async getSources(): Promise<string[]> {
    const items = await this.getAllPassages();
    const sources = new Set<string>();
    items.forEach(item => sources.add(item.metadata.source));
    return Array.from(sources).sort();
  }

  async getTags(): Promise<string[]> {
    const items = await this.getAllPassages();
    const tags = new Set<string>();
    items.forEach(item => {
      item.metadata.tags.forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }

  async getPassageCount(): Promise<number> {
    const items = await this.getAllPassages();
    return items.length;
  }

  async clear(): Promise<void> {
    throw new Error('Clear operation not supported for backend passage library');
  }

  private mapBackendItem(item: BackendPassageItem): PassageLibraryItem {
    passageRevisions.set(item.id, item.revision);
    return {
      id: item.id,
      passage: item.passage,
      metadata: {
        ...item.metadata,
        difficulty: item.metadata.difficulty as 'easy' | 'medium' | 'hard',
        estimatedTimeMinutes: item.metadata.estimatedTimeMinutes ?? 0,
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

class HybridPassageLibrary {
  constructor(
    private readonly local: LocalStoragePassageLibrary,
    private readonly backend: BackendPassageLibrary,
  ) {}

  private useBackend(): boolean {
    return isBackendLibraryEnabled();
  }

  getAllPassages(): Promise<PassageLibraryItem[]> {
    return this.useBackend() ? this.backend.getAllPassages() : Promise.resolve(this.local.getAllPassages());
  }

  getPassage(id: string): Promise<PassageLibraryItem | null> {
    return this.useBackend() ? this.backend.getPassage(id) : Promise.resolve(this.local.getPassage(id));
  }

  addPassage(passage: Passage, metadata: Omit<PassageMetadata, 'id' | 'createdAt' | 'usageCount'>): Promise<PassageLibraryItem> {
    return this.useBackend() ? this.backend.addPassage(passage, metadata) : Promise.resolve(this.local.addPassage(passage, metadata));
  }

  updatePassage(id: string, updates: Partial<{ passage: Passage; metadata: Partial<PassageMetadata> }>): Promise<PassageLibraryItem | null> {
    return this.useBackend() ? this.backend.updatePassage(id, updates) : Promise.resolve(this.local.updatePassage(id, updates));
  }

  deletePassage(id: string): Promise<boolean> {
    return this.useBackend() ? this.backend.deletePassage(id) : Promise.resolve(this.local.deletePassage(id));
  }

  queryPassages(query: PassageLibraryQuery): Promise<PassageLibraryItem[]> {
    return this.useBackend() ? this.backend.queryPassages(query) : Promise.resolve(this.local.queryPassages(query));
  }

  incrementUsageCount(id: string): Promise<void> {
    return this.useBackend() ? this.backend.incrementUsageCount(id) : Promise.resolve(this.local.incrementUsageCount(id));
  }

  getTopics(): Promise<string[]> {
    return this.useBackend() ? this.backend.getTopics() : Promise.resolve(this.local.getTopics());
  }

  getSources(): Promise<string[]> {
    return this.useBackend() ? this.backend.getSources() : Promise.resolve(this.local.getSources());
  }

  getTags(): Promise<string[]> {
    return this.useBackend() ? this.backend.getTags() : Promise.resolve(this.local.getTags());
  }

  getPassageCount(): Promise<number> {
    return this.useBackend() ? this.backend.getPassageCount() : Promise.resolve(this.local.getPassageCount());
  }

  clear(): Promise<void> {
    return this.useBackend() ? this.backend.clear() : Promise.resolve(this.local.clear());
  }
}

// Singleton instance
export const passageLibraryService = new HybridPassageLibrary(
  new LocalStoragePassageLibrary(),
  new BackendPassageLibrary(),
);
