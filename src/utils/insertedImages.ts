import type { InsertedBlockImage, QuestionBlock, QuestionType } from '../types';

const INSERTED_IMAGE_UNSUPPORTED_TYPES = new Set<QuestionType>(['MAP', 'DIAGRAM_LABELING']);

export function supportsInsertedImages(target: QuestionType | Pick<QuestionBlock, 'type'>): boolean {
  const type = typeof target === 'string' ? target : target.type;
  return !INSERTED_IMAGE_UNSUPPORTED_TYPES.has(type);
}

export function getInsertedImages(block: Pick<QuestionBlock, 'insertedImages'>): InsertedBlockImage[] {
  return Array.isArray(block.insertedImages) ? block.insertedImages : [];
}

export function coerceInsertedImages(
  value: unknown,
  fallbackPrefix = 'img',
): InsertedBlockImage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((candidate, index): InsertedBlockImage | null => {
      if (!candidate || typeof candidate !== 'object') {
        return null;
      }
      const typed = candidate as { id?: unknown; url?: unknown; caption?: unknown };
      const id =
        typeof typed.id === 'string' && typed.id.trim().length > 0
          ? typed.id
          : `${fallbackPrefix}-${index + 1}`;
      const url = typeof typed.url === 'string' ? typed.url : '';
      const caption = typeof typed.caption === 'string' ? typed.caption : undefined;
      return { id, url, caption };
    })
    .filter((image): image is InsertedBlockImage => image !== null);
}
