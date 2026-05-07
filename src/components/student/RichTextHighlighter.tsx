import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { sanitizeHtml } from '../../utils/sanitizeHtml';
import {
  applyHighlightFromSnapshot,
  applySelectionHighlight,
  escapeHtml,
  removeHighlightAtIndex,
  createHighlightSelectionSnapshot,
  type HighlightSelectionSnapshot,
} from './highlightSelection';
import { getStudentHighlightClassName, type StudentHighlightColor } from './highlightPalette';
import { usePersistedStudentHighlightHtml } from './highlightPersistence';
import { useDeferredSelectionHighlight } from './useDeferredSelectionHighlight';

interface RichTextHighlighterProps {
  content: string;
  contentType?: 'html' | 'text';
  enabled: boolean;
  as?: 'div' | 'p' | 'span';
  className?: string | undefined;
  highlightColor?: StudentHighlightColor | undefined;
  highlightClassName?: string | undefined;
  highlightPersistenceKey?: string | undefined;
  showHighlightButton?: boolean | undefined;
  highlightButtonLabel?: string | undefined;
}
const MOUSE_SELECTION_REMOVE_GUARD_MS = 450;
const DESKTOP_RETRY_DELAY_MS = 45;
const DESKTOP_RETRY_MAX_ATTEMPTS = 3;

export function RichTextHighlighter({
  content,
  contentType = 'text',
  enabled,
  as = 'div',
  className,
  highlightColor,
  highlightClassName,
  highlightPersistenceKey,
  showHighlightButton = false,
  highlightButtonLabel = 'Highlight selected text',
}: RichTextHighlighterProps) {
  const Tag = as as any;
  const containerRef = useRef<HTMLElement | null>(null);
  const lastMouseSelectionIntentAtRef = useRef<number | null>(null);
  const pendingSelectionSnapshotRef = useRef<HighlightSelectionSnapshot | null>(null);
  const mouseSelectionActiveRef = useRef(false);
  const desktopRetryTimerRef = useRef<number | null>(null);
  const initialHtml = useMemo(
    () => (contentType === 'html' ? sanitizeHtml(content) : escapeHtml(content)),
    [content, contentType],
  );
  const { html, setHtml } = usePersistedStudentHighlightHtml(
    initialHtml,
    highlightPersistenceKey,
  );

  const handleSelection = useCallback(() => {
    if (!enabled) {
      return false;
    }

    const container = containerRef.current;
    const selection = window.getSelection();
    if (!container || !selection) {
      return false;
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

  const clearDesktopRetryTimer = useCallback(() => {
    if (desktopRetryTimerRef.current !== null) {
      window.clearTimeout(desktopRetryTimerRef.current);
      desktopRetryTimerRef.current = null;
    }
  }, []);

  const captureSelectionSnapshot = useCallback(() => {
    if (!enabled) {
      return;
    }
    const container = containerRef.current;
    const selection = window.getSelection();
    if (!container || !selection) {
      return;
    }
    const snapshot = createHighlightSelectionSnapshot(container, selection);
    if (snapshot) {
      pendingSelectionSnapshotRef.current = snapshot;
    }
  }, [enabled]);

  const handleMouseDown = useCallback(() => {
    if (!enabled) {
      return;
    }
    mouseSelectionActiveRef.current = true;
    pendingSelectionSnapshotRef.current = null;
    clearDesktopRetryTimer();
    captureSelectionSnapshot();
  }, [captureSelectionSnapshot, clearDesktopRetryTimer, enabled]);

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
  const applyPendingSelectionSnapshot = useCallback(() => {
    const snapshot = pendingSelectionSnapshotRef.current;
    if (!snapshot) {
      return false;
    }
    const applied = applySelectionFromSnapshot(snapshot);
    if (applied) {
      pendingSelectionSnapshotRef.current = null;
    }
    return applied;
  }, [applySelectionFromSnapshot]);
  const scheduleDesktopRetry = useCallback(
    (attempt = 1) => {
      clearDesktopRetryTimer();
      if (attempt > DESKTOP_RETRY_MAX_ATTEMPTS) {
        return;
      }
      desktopRetryTimerRef.current = window.setTimeout(() => {
        const applied = applyPendingSelectionSnapshot() || handleSelection();
        if (!applied) {
          scheduleDesktopRetry(attempt + 1);
          return;
        }
        lastMouseSelectionIntentAtRef.current = Date.now();
      }, DESKTOP_RETRY_DELAY_MS);
    },
    [applyPendingSelectionSnapshot, clearDesktopRetryTimer, handleSelection],
  );
  const handleMouseUp = useCallback(() => {
    if (!enabled) {
      return;
    }
    mouseSelectionActiveRef.current = false;
    captureSelectionSnapshot();
    const applied = applyPendingSelectionSnapshot() || handleSelection();
    if (applied) {
      lastMouseSelectionIntentAtRef.current = Date.now();
      return;
    }
    scheduleDesktopRetry(1);
  }, [applyPendingSelectionSnapshot, captureSelectionSnapshot, enabled, handleSelection, scheduleDesktopRetry]);
  const { isWithinRecentTouchAutoApplyGuard, startTouchSelectionSession, scheduleSelectionHighlight } =
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
      if (lastMouseSelectionIntentAt && Date.now() - lastMouseSelectionIntentAt < MOUSE_SELECTION_REMOVE_GUARD_MS) {
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

  useEffect(() => {
    if (!enabled) {
      pendingSelectionSnapshotRef.current = null;
      mouseSelectionActiveRef.current = false;
      clearDesktopRetryTimer();
      return;
    }

    const handleSelectionChange = () => {
      const container = containerRef.current;
      const selection = window.getSelection();
      const anchorNode = selection?.anchorNode ?? null;
      if (!container || !selection || !anchorNode) {
        return;
      }
      if (!container.contains(anchorNode)) {
        return;
      }
      captureSelectionSnapshot();
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      clearDesktopRetryTimer();
    };
  }, [captureSelectionSnapshot, clearDesktopRetryTimer, enabled]);

  return (
    <>
      <Tag
        ref={containerRef as any}
        className={className}
        data-student-highlightable="true"
        style={enabled ? { WebkitUserSelect: 'text', userSelect: 'text', touchAction: 'auto' } : undefined}
        onClick={removeTappedHighlight}
        onMouseDown={enabled && !showHighlightButton ? handleMouseDown : undefined}
        onMouseUp={enabled && !showHighlightButton ? handleMouseUp : undefined}
        onTouchStart={enabled && !showHighlightButton ? startTouchSelectionSession : undefined}
        onTouchEnd={enabled && !showHighlightButton ? scheduleSelectionHighlight : undefined}
        onKeyUp={enabled ? handleSelection : undefined}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {enabled && showHighlightButton ? (
        <button
          type="button"
          onClick={handleSelection}
          className="mt-2 inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 shadow-sm"
        >
          {highlightButtonLabel}
        </button>
      ) : null}
    </>
  );
}
