import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseBoldMarkdown } from '../../utils/boldMarkdown';
import {
  applyHighlightFromSnapshotWithPolicy,
  applySelectionHighlightWithPolicy,
  escapeHtml,
  removeHighlightAtIndex,
  type HighlightPolicyReason,
  type HighlightSelectionSnapshot,
} from './highlightSelection';
import { getStudentHighlightClassName, type StudentHighlightColor } from './highlightPalette';
import { usePersistedStudentHighlightHtml } from './highlightPersistence';
import { useDeferredSelectionHighlight } from './useDeferredSelectionHighlight';

type FormattedTextProps = {
  text: string;
  className?: string | undefined;
  as?: 'span' | 'div' | 'p';
  highlightEnabled?: boolean | undefined;
  highlightColor?: StudentHighlightColor | undefined;
  highlightClassName?: string | undefined;
  highlightPersistenceKey?: string | undefined;
};
const MOUSE_SELECTION_REMOVE_GUARD_MS = 450;
const HIGHLIGHT_POLICY_HINT_MS = 1800;
const HIGHLIGHT_POLICY_HINT_THROTTLE_MS = 1200;

export function FormattedText({
  text,
  className,
  as = 'span',
  highlightEnabled = false,
  highlightColor,
  highlightClassName,
  highlightPersistenceKey,
}: FormattedTextProps) {
  const Tag = as as any;
  const segments = useMemo(() => parseBoldMarkdown(text), [text]);
  const classes = ['whitespace-pre-wrap', 'break-words', className].filter(Boolean).join(' ');
  const containerRef = useRef<HTMLElement | null>(null);
  const lastMouseSelectionIntentAtRef = useRef<number | null>(null);
  const initialHtml = useMemo(
    () =>
      segments
        .map((segment) => (segment.bold ? `<strong>${escapeHtml(segment.text)}</strong>` : escapeHtml(segment.text)))
        .join(''),
    [segments],
  );
  const { html, setHtml, hasPersistedHtml } = usePersistedStudentHighlightHtml(
    initialHtml,
    highlightPersistenceKey,
  );
  const [highlightPolicyHint, setHighlightPolicyHint] = useState<string | null>(null);
  const hintTimerRef = useRef<number | null>(null);
  const lastHintAtRef = useRef<number>(0);

  const clearHintTimer = useCallback(() => {
    if (hintTimerRef.current !== null) {
      window.clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
  }, []);

  const maybeShowPolicyHint = useCallback((reason: HighlightPolicyReason | null) => {
    if (reason !== 'cross_block_selection') {
      return;
    }
    const now = Date.now();
    if (now - lastHintAtRef.current < HIGHLIGHT_POLICY_HINT_THROTTLE_MS) {
      return;
    }
    lastHintAtRef.current = now;
    setHighlightPolicyHint('Highlight works within one paragraph at a time.');
    clearHintTimer();
    hintTimerRef.current = window.setTimeout(() => {
      setHighlightPolicyHint(null);
      hintTimerRef.current = null;
    }, HIGHLIGHT_POLICY_HINT_MS);
  }, [clearHintTimer]);

  const handleSelection = useCallback(() => {
    if (!highlightEnabled) {
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
  }, [highlightClassName, highlightColor, highlightEnabled, maybeShowPolicyHint, setHtml]);
  const handleMouseUp = useCallback(() => {
    const applied = handleSelection();
    if (applied) {
      lastMouseSelectionIntentAtRef.current = Date.now();
    }
  }, [handleSelection]);
  const applySelectionFromSnapshot = useCallback(
    (snapshot: HighlightSelectionSnapshot) => {
      if (!highlightEnabled) {
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
    [highlightClassName, highlightColor, highlightEnabled, maybeShowPolicyHint, setHtml],
  );
  const { isWithinRecentTouchAutoApplyGuard, startTouchSelectionSession, scheduleSelectionHighlight } =
    useDeferredSelectionHighlight({
    enabled: highlightEnabled,
    containerRef,
    applySelection: handleSelection,
    applySelectionFromSnapshot,
    });

  const removeTappedHighlight = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!highlightEnabled) {
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
    [highlightEnabled, isWithinRecentTouchAutoApplyGuard, setHtml],
  );

  useEffect(() => {
    return () => {
      clearHintTimer();
    };
  }, [clearHintTimer]);

  if (highlightEnabled || hasPersistedHtml) {
    return (
      <>
        <Tag
          ref={containerRef as any}
          className={classes}
          data-student-highlightable="true"
          style={{ WebkitUserSelect: 'text', userSelect: 'text', touchAction: 'auto' }}
          onClick={removeTappedHighlight}
          onMouseUp={highlightEnabled ? handleMouseUp : undefined}
          onTouchStart={highlightEnabled ? startTouchSelectionSession : undefined}
          onTouchEnd={highlightEnabled ? scheduleSelectionHighlight : undefined}
          onKeyUp={highlightEnabled ? handleSelection : undefined}
          dangerouslySetInnerHTML={{ __html: html }}
        />
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

  return (
    <Tag className={classes}>
      {segments.map((segment, index) =>
        segment.bold ? (
          <strong key={index} className="font-bold">
            {segment.text}
          </strong>
        ) : (
          <React.Fragment key={index}>{segment.text}</React.Fragment>
        ),
      )}
    </Tag>
  );
}
