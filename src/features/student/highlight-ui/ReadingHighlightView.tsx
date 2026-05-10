import React, { useMemo, useRef } from 'react';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { getStudentHighlightClassName } from '../../../components/student/highlightPalette';
import type { HighlightRange, HighlightSet } from '../highlight-domain/highlightTypes';
import {
  buildTextSegments,
  mapDocPosToOffset,
  mapDocSelectionToOffsets,
  mapOffsetToDocPos,
} from './highlightPositionMap';

function buildReadOnlyDoc(content: string): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: content.length > 0 ? [{ type: 'text', text: content }] : [],
      },
    ],
  };
}

function toDecorations(doc: ProseMirrorNode, ranges: HighlightSet): DecorationSet {
  const decorations: Decoration[] = [];
  const segments = buildTextSegments(doc);

  for (const range of ranges) {
    if (range.end <= range.start) {
      continue;
    }

    const from = mapOffsetToDocPos(segments, range.start);
    const to = mapOffsetToDocPos(segments, range.end);
    if (from === null || to === null || to <= from) {
      continue;
    }

    decorations.push(
      Decoration.inline(from, to, {
        class: getStudentHighlightClassName(range.color),
        'data-highlighted': 'true',
        'data-highlight-color': range.color,
      }),
    );
  }

  return DecorationSet.create(doc, decorations);
}

export function ReadingHighlightView({
  content,
  ranges,
  className,
  onApplySelection,
  onRemoveAtOffset,
}: {
  content: string;
  ranges: HighlightSet;
  className?: string;
  onApplySelection?: ((selection: { start: number; end: number; selectedText: string }) => void) | undefined;
  onRemoveAtOffset?: ((offset: number) => void) | undefined;
}) {
  const doc = useMemo(() => buildReadOnlyDoc(content), [content]);
  const lastSelectionApplyAtRef = useRef<number>(0);
  const rangesKey = useMemo(
    () => ranges.map((range) => `${range.start}:${range.end}:${range.color}`).join('|'),
    [ranges],
  );

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: false,
      extensions: [
        StarterKit.configure({
          blockquote: false,
          codeBlock: false,
          bulletList: false,
          orderedList: false,
          history: false,
        }),
      ],
      content: doc,
      editorProps: {
        attributes: {
          class:
            className ??
            'whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-gray-900',
          'data-student-highlightable': 'true',
        },
        decorations: (state) => toDecorations(state.doc, ranges),
        handleDOMEvents: {
          mouseup: (view) => {
            if (!onApplySelection) {
              return false;
            }
            const mapped = mapDocSelectionToOffsets(
              buildTextSegments(view.state.doc),
              view.state.selection.from,
              view.state.selection.to,
            );
            if (!mapped) {
              return false;
            }
            onApplySelection({
              start: mapped.start,
              end: mapped.end,
              selectedText: content.slice(mapped.start, mapped.end),
            });
            lastSelectionApplyAtRef.current = Date.now();
            return false;
          },
          touchend: (view) => {
            if (!onApplySelection) {
              return false;
            }
            const mapped = mapDocSelectionToOffsets(
              buildTextSegments(view.state.doc),
              view.state.selection.from,
              view.state.selection.to,
            );
            if (!mapped) {
              return false;
            }
            onApplySelection({
              start: mapped.start,
              end: mapped.end,
              selectedText: content.slice(mapped.start, mapped.end),
            });
            lastSelectionApplyAtRef.current = Date.now();
            return false;
          },
          click: (view, event) => {
            if (!onRemoveAtOffset) {
              return false;
            }
            if (Date.now() - lastSelectionApplyAtRef.current < 450) {
              return false;
            }
            const target = event.target instanceof HTMLElement ? event.target : null;
            if (!target?.closest('[data-highlighted="true"]')) {
              return false;
            }
            const coords = view.posAtCoords({
              left: (event as MouseEvent).clientX,
              top: (event as MouseEvent).clientY,
            });
            if (!coords) {
              return false;
            }
            const offset = mapDocPosToOffset(buildTextSegments(view.state.doc), coords.pos);
            if (offset === null) {
              return false;
            }
            onRemoveAtOffset(offset);
            event.preventDefault();
            return true;
          },
        },
      },
    },
    [content, rangesKey, className, onApplySelection, onRemoveAtOffset],
  );

  return <EditorContent editor={editor} />;
}

export type { HighlightRange };
