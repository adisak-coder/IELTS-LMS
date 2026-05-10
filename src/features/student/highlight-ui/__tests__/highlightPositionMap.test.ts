import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import {
  buildTextSegments,
  mapDocPosToOffset,
  mapDocSelectionToOffsets,
  mapOffsetToDocPos,
} from '../highlightPositionMap';

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: {
      content: 'text*',
      group: 'block',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    text: { group: 'inline' },
  },
});

describe('highlightPositionMap', () => {
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('Alpha beta')]),
  ]);
  const segments = buildTextSegments(doc);

  it('maps text offsets to document positions', () => {
    expect(mapOffsetToDocPos(segments, 0)).toBe(1);
    expect(mapOffsetToDocPos(segments, 6)).toBe(7);
    expect(mapOffsetToDocPos(segments, 9)).toBe(10);
  });

  it('maps document positions back to text offsets', () => {
    expect(mapDocPosToOffset(segments, 1)).toBe(0);
    expect(mapDocPosToOffset(segments, 7)).toBe(6);
    expect(mapDocPosToOffset(segments, 10)).toBe(9);
  });

  it('maps a document selection span to text offsets', () => {
    expect(mapDocSelectionToOffsets(segments, 7, 10)).toEqual({
      start: 6,
      end: 9,
    });
  });
});
