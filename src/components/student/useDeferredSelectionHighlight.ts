import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { createHighlightSelectionSnapshot, type HighlightSelectionSnapshot } from './highlightSelection';

interface UseDeferredSelectionHighlightOptions {
  enabled: boolean;
  containerRef: RefObject<HTMLElement | null>;
  applySelection: () => boolean;
  applySelectionFromSnapshot?: ((snapshot: HighlightSelectionSnapshot) => boolean) | undefined;
}

const TOUCH_AUTO_APPLY_REMOVE_GUARD_MS = 700;

export function useDeferredSelectionHighlight({
  enabled,
  containerRef,
  applySelection,
  applySelectionFromSnapshot,
}: UseDeferredSelectionHighlightOptions) {
  const touchSessionActiveRef = useRef(false);
  const pendingSnapshotRef = useRef<HighlightSelectionSnapshot | null>(null);
  const pendingSignatureRef = useRef<string | null>(null);
  const lastTouchAutoApplyAtRef = useRef<number | null>(null);

  const clearPending = useCallback(() => {
    pendingSnapshotRef.current = null;
    pendingSignatureRef.current = null;
    touchSessionActiveRef.current = false;
  }, []);

  const applyPending = useCallback(() => {
    const pendingSnapshot = pendingSnapshotRef.current;
    clearPending();

    let applied = false;
    if (pendingSnapshot && applySelectionFromSnapshot?.(pendingSnapshot)) {
      applied = true;
    } else {
      applied = applySelection();
    }

    if (applied) {
      lastTouchAutoApplyAtRef.current = Date.now();
    }
  }, [applySelection, applySelectionFromSnapshot, clearPending]);

  const queueSelectionHighlight = useCallback(
    (snapshot: HighlightSelectionSnapshot) => {
      if (pendingSignatureRef.current === snapshot.signature) {
        return;
      }

      pendingSnapshotRef.current = snapshot;
      pendingSignatureRef.current = snapshot.signature;
    },
    [],
  );

  const queueCurrentSelection = useCallback(() => {
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
  }, [containerRef, queueSelectionHighlight]);

  const startTouchSelectionSession = useCallback(() => {
    if (!enabled) {
      return;
    }

    if (pendingSnapshotRef.current) {
      clearPending();
    }

    touchSessionActiveRef.current = true;
    queueCurrentSelection();
  }, [clearPending, enabled, queueCurrentSelection]);

  const scheduleSelectionHighlight = useCallback(() => {
    if (!enabled) {
      return;
    }

    if (!touchSessionActiveRef.current) {
      return;
    }

    queueCurrentSelection();
    applyPending();
  }, [applyPending, enabled, queueCurrentSelection]);

  const isWithinRecentTouchAutoApplyGuard = useCallback(() => {
    const lastTouchAutoApplyAt = lastTouchAutoApplyAtRef.current;
    if (!lastTouchAutoApplyAt) {
      return false;
    }

    return Date.now() - lastTouchAutoApplyAt < TOUCH_AUTO_APPLY_REMOVE_GUARD_MS;
  }, []);

  useEffect(() => {
    return () => {
      clearPending();
    };
  }, [clearPending]);

  useEffect(() => {
    if (!enabled) {
      clearPending();
      return;
    }

    const handleSelectionChange = () => {
      if (!touchSessionActiveRef.current) {
        return;
      }

      queueCurrentSelection();
    };

    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [clearPending, enabled, queueCurrentSelection]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleTouchEnd = () => {
      scheduleSelectionHighlight();
    };

    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [enabled, scheduleSelectionHighlight]);

  return {
    isWithinRecentTouchAutoApplyGuard,
    startTouchSelectionSession,
    scheduleSelectionHighlight,
  };
}
