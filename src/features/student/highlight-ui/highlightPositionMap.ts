import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export type TextSegment = {
  docFrom: number;
  docTo: number;
  textFrom: number;
  textTo: number;
};

export function buildTextSegments(doc: ProseMirrorNode): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;

  doc.descendants((node, pos) => {
    if (!node.isText) {
      return;
    }
    const text = typeof node.text === 'string' ? node.text : '';
    const length = text.length;
    if (length === 0) {
      return;
    }

    segments.push({
      docFrom: pos,
      docTo: pos + length,
      textFrom: cursor,
      textTo: cursor + length,
    });
    cursor += length;
  });

  return segments;
}

export function mapOffsetToDocPos(
  segments: TextSegment[],
  offset: number,
): number | null {
  if (!Number.isInteger(offset) || offset < 0) {
    return null;
  }

  for (const segment of segments) {
    if (offset < segment.textFrom || offset > segment.textTo) {
      continue;
    }
    return segment.docFrom + (offset - segment.textFrom);
  }

  return null;
}

export function mapDocPosToOffset(
  segments: TextSegment[],
  position: number,
): number | null {
  if (!Number.isInteger(position) || position < 0) {
    return null;
  }

  for (const segment of segments) {
    if (position < segment.docFrom || position > segment.docTo) {
      continue;
    }
    return segment.textFrom + (position - segment.docFrom);
  }

  return null;
}

export function mapDocSelectionToOffsets(
  segments: TextSegment[],
  from: number,
  to: number,
): { start: number; end: number } | null {
  const start = mapDocPosToOffset(segments, Math.min(from, to));
  const end = mapDocPosToOffset(segments, Math.max(from, to));
  if (start === null || end === null || end <= start) {
    return null;
  }
  return { start, end };
}
