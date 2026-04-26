import React, { useMemo, useRef } from 'react';
import { sanitizeHtml } from '../../utils/sanitizeHtml';
import {
  applyHighlightFromSnapshot,
  applySelectionHighlight,
  escapeHtml,
  removeHighlightAtIndex,
  type HighlightSelectionSnapshot,
} from './highlightSelection';
import { getStudentHighlightClassName, type StudentHighlightColor } from './highlightPalette';
import { usePersistedStudentHighlightHtml } from './highlightPersistence';

interface RichTextHighlighterProps {
  content: string;
  contentType?: 'html' | 'text';
  enabled: boolean;
  as?: 'div' | 'p' | 'span';
  className?: string | undefined;
  highlightColor?: StudentHighlightColor | undefined;
  highlightClassName?: string | undefined;
  highlightPersistenceKey?: string | undefined;
}

export function RichTextHighlighter({
  content,
  contentType = 'text',
  enabled,
  as = 'div',
  className,
  highlightColor,
  highlightClassName,
  highlightPersistenceKey,
}: RichTextHighlighterProps) {
  const Tag = as as any;
  const containerRef = useRef<HTMLElement | null>(null);
  const lastMouseSelectionIntentAtRef = useRef<number | null>(null);
  const initialHtml = useMemo(
    () => (contentType === 'html' ? sanitizeHtml(content) : escapeHtml(content)),
    [content, contentType],
  );
  const { html, setHtml } = usePersistedStudentHighlightHtml(
    initialHtml,
    highlightPersistenceKey,
  );

  const handleSelection = () => {
    if (!enabled) {
      return false;
    }

    const container = containerRef.current;
    const selection = window.getSelection();
    if (!container || !selection) {
      return false;
    }
    const hasSelectionIntent =
      selection.rangeCount > 0 &&
      !selection.isCollapsed &&
      selection.toString().trim().length > 0;
    if (hasSelectionIntent) {
      lastMouseSelectionIntentAtRef.current = Date.now();
    }

    const nextHtml = applySelectionHighlight(
      container,
      selection,
      highlightClassName ??
        (highlightColor ? getStudentHighlightClassName(highlightColor) : 'rounded-sm bg-yellow-200/80 text-gray-900'),
    );

    if (nextHtml) {
      setHtml(nextHtml);
      return true;
    }

    return false;
  }, [enabled, highlightClassName, highlightColor, setHtml]);
  const applySelectionFromSnapshot = useCallback(
    (snapshot: HighlightSelectionSnapshot) => {
      if (!enabled) {
        return false;
      }

      const container = containerRef.current;
      if (!container) {
        return false;
      }

      const nextHtml = applyHighlightFromSnapshot(
        container,
        snapshot,
        highlightClassName ??
          (highlightColor ? getStudentHighlightClassName(highlightColor) : 'rounded-sm bg-yellow-200/80 text-gray-900'),
      );

      if (!nextHtml) {
        return false;
      }

      setHtml(nextHtml);
      window.getSelection()?.removeAllRanges();
      return true;
    },
    [enabled, highlightClassName, highlightColor, setHtml],
  );
  const { isWithinRecentTouchAutoApplyGuard, startTouchSelectionSession } =
    useDeferredSelectionHighlight({
    enabled,
    containerRef,
    applySelection: handleSelection,
    applySelectionFromSnapshot,
    });

  const removeTappedHighlight = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!enabled) {
        return;
      }
      if (isWithinRecentTouchAutoApplyGuard()) {
        return;
      }
      const lastMouseSelectionIntentAt = lastMouseSelectionIntentAtRef.current;
      if (
        lastMouseSelectionIntentAt &&
        Date.now() - lastMouseSelectionIntentAt < MOUSE_SELECTION_REMOVE_GUARD_MS
      ) {
        return;
      }
      const activeSelection = window.getSelection();
      if (
        activeSelection &&
        activeSelection.rangeCount > 0 &&
        !activeSelection.isCollapsed &&
        activeSelection.toString().trim().length > 0
      ) {
        return;
      }

      const container = containerRef.current;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const highlightedNode = target?.closest('mark[data-highlighted="true"]');
      if (!container || !highlightedNode || !container.contains(highlightedNode)) {
        return;
      }

      const highlightIndex = Array.from(container.querySelectorAll('mark[data-highlighted="true"]')).indexOf(highlightedNode);
      const nextHtml = removeHighlightAtIndex(container, highlightIndex);
      if (nextHtml) {
        event.preventDefault();
        event.stopPropagation();
        setHtml(nextHtml);
      }
    },
    [enabled, isWithinRecentTouchAutoApplyGuard, setHtml],
  );

  return (
    <Tag
      ref={containerRef as any}
      className={className}
      onMouseUp={enabled ? handleSelection : undefined}
      onKeyUp={enabled ? handleSelection : undefined}
      onTouchEnd={enabled ? handleSelection : undefined}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
