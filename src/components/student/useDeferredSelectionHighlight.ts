import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { createHighlightSelectionSnapshot, type HighlightSelectionSnapshot } from './highlightSelection';

interface UseDeferredSelectionHighlightOptions {
  enabled: boolean;
  containerRef: RefObject<HTMLElement | null>;
  applySelection: () => void;
  applySelectionFromSnapshot?: ((snapshot: HighlightSelectionSnapshot) => boolean) | undefined;
}

const TOUCH_SELECTION_SETTLE_MS = 2000;

export function useDeferredSelectionHighlight({
  enabled,
  containerRef,
  applySelection,
  applySelectionFromSnapshot,
}: UseDeferredSelectionHighlightOptions) {
  const selectionTimerRef = useRef<number | null>(null);
  const pendingSnapshotRef = useRef<HighlightSelectionSnapshot | null>(null);
  const pendingSignatureRef = useRef<string | null>(null);

  const queueSelectionHighlight = useCallback(
    (snapshot: HighlightSelectionSnapshot) => {
      const hasPendingTimer = selectionTimerRef.current !== null;
      if (hasPendingTimer && pendingSignatureRef.current === snapshot.signature) {
        return;
      }

      pendingSnapshotRef.current = snapshot;
      pendingSignatureRef.current = snapshot.signature;

      if (selectionTimerRef.current) {
        window.clearTimeout(selectionTimerRef.current);
      }

      selectionTimerRef.current = window.setTimeout(() => {
        const pendingSnapshot = pendingSnapshotRef.current;
        selectionTimerRef.current = null;
        pendingSnapshotRef.current = null;
        pendingSignatureRef.current = null;

        if (pendingSnapshot && applySelectionFromSnapshot?.(pendingSnapshot)) {
          return;
        }

        applySelection();
      }, TOUCH_SELECTION_SETTLE_MS);
    },
    [applySelection, applySelectionFromSnapshot],
  );

  const scheduleSelectionHighlight = useCallback(() => {
    if (!enabled) {
      return;
    }

    const container = containerRef.current;
    const selection = window.getSelection();
    if (!container || !selection) {
      return;
    }

    const snapshot = createHighlightSelectionSnapshot(container, selection);
    if (!snapshot) {
      return;
    }

    queueSelectionHighlight(snapshot);
  }, [containerRef, enabled, queueSelectionHighlight]);

  useEffect(() => {
    return () => {
      if (selectionTimerRef.current) {
        window.clearTimeout(selectionTimerRef.current);
      }
      pendingSnapshotRef.current = null;
      pendingSignatureRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleSelectionChange = () => {
      const container = containerRef.current;
      const selection = window.getSelection();
      if (!container || !selection) {
        return;
      }

      const snapshot = createHighlightSelectionSnapshot(container, selection);
      if (!snapshot) {
        return;
      }

      queueSelectionHighlight(snapshot);
    };

    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [containerRef, enabled, queueSelectionHighlight]);

  return scheduleSelectionHighlight;
}
