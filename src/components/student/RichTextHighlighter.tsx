import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sanitizeHtml } from '../../utils/sanitizeHtml';
import {
  applyHighlightFromSnapshotWithPolicy,
  applySelectionHighlightWithPolicy,
  escapeHtml,
  removeHighlightAtIndex,
  createHighlightSelectionSnapshot,
  type HighlightPolicyReason,
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
const HIGHLIGHT_POLICY_HINT_MS = 1800;
const HIGHLIGHT_POLICY_HINT_THROTTLE_MS = 1200;

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
  const highlightPolicyHintTimerRef = useRef<number | null>(null);
  const lastPolicyHintAtRef = useRef<number>(0);
  const [highlightPolicyHint, setHighlightPolicyHint] = useState<string | null>(null);
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

    const result = applySelectionHighlightWithPolicy(
      container,
      selection,
      highlightClassName ??
        (highlightColor ? getStudentHighlightClassName(highlightColor) : 'rounded-sm bg-yellow-200/80 text-gray-900'),
    );

    if (result.html) {
      setHtml(result.html);
      return true;
    }

    maybeShowPolicyHint(result.reason);
    return false;
  }, [enabled, highlightClassName, highlightColor, setHtml]);

  const clearDesktopRetryTimer = useCallback(() => {
    if (desktopRetryTimerRef.current !== null) {
      window.clearTimeout(desktopRetryTimerRef.current);
      desktopRetryTimerRef.current = null;
    }
  }, []);

  const clearHighlightPolicyHintTimer = useCallback(() => {
    if (highlightPolicyHintTimerRef.current !== null) {
      window.clearTimeout(highlightPolicyHintTimerRef.current);
      highlightPolicyHintTimerRef.current = null;
    }
  }, []);

  const maybeShowPolicyHint = useCallback((reason: HighlightPolicyReason | null) => {
    if (reason !== 'cross_block_selection') {
      return;
    }
    const now = Date.now();
    if (now - lastPolicyHintAtRef.current < HIGHLIGHT_POLICY_HINT_THROTTLE_MS) {
      return;
    }
    lastPolicyHintAtRef.current = now;
    setHighlightPolicyHint('Highlight works within one paragraph at a time.');
    clearHighlightPolicyHintTimer();
    highlightPolicyHintTimerRef.current = window.setTimeout(() => {
      setHighlightPolicyHint(null);
      highlightPolicyHintTimerRef.current = null;
    }, HIGHLIGHT_POLICY_HINT_MS);
  }, [clearHighlightPolicyHintTimer]);

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

      const result = applyHighlightFromSnapshotWithPolicy(
        container,
        snapshot,
        highlightClassName ??
          (highlightColor ? getStudentHighlightClassName(highlightColor) : 'rounded-sm bg-yellow-200/80 text-gray-900'),
      );

      if (!result.html) {
        maybeShowPolicyHint(result.reason);
        return false;
      }

      setHtml(result.html);
      window.getSelection()?.removeAllRanges();
      return true;
    },
    [enabled, highlightClassName, highlightColor, maybeShowPolicyHint, setHtml],
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
      clearHighlightPolicyHintTimer();
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
      clearHighlightPolicyHintTimer();
    };
  }, [captureSelectionSnapshot, clearDesktopRetryTimer, clearHighlightPolicyHintTimer, enabled]);

  useEffect(() => {
    return () => {
      clearHighlightPolicyHintTimer();
    };
  }, [clearHighlightPolicyHintTimer]);

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
      {highlightPolicyHint ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-4 z-[85] flex justify-center px-4"
        >
          <div className="rounded-sm border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800 shadow-md">
            {highlightPolicyHint}
          </div>
        </div>
      ) : null}
    </>
  );
}
