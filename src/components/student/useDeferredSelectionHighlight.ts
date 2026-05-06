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
const TOUCH_FINALIZE_SETTLE_MS = 180;
const TOUCH_FINALIZE_MAX_WAIT_MS = 900;

export function useDeferredSelectionHighlight({
  enabled,
  containerRef,
  applySelection,
  applySelectionFromSnapshot,
}: UseDeferredSelectionHighlightOptions) {
  const touchSessionActiveRef = useRef(false);
  const touchFinalizePendingRef = useRef(false);
  const settleFinalizeTimerRef = useRef<number | null>(null);
  const maxFinalizeTimerRef = useRef<number | null>(null);
  const pendingSnapshotRef = useRef<HighlightSelectionSnapshot | null>(null);
  const pendingSignatureRef = useRef<string | null>(null);
  const lastTouchAutoApplyAtRef = useRef<number | null>(null);

  const clearFinalizeTimers = useCallback(() => {
    if (settleFinalizeTimerRef.current !== null) {
      window.clearTimeout(settleFinalizeTimerRef.current);
      settleFinalizeTimerRef.current = null;
    }
    if (maxFinalizeTimerRef.current !== null) {
      window.clearTimeout(maxFinalizeTimerRef.current);
      maxFinalizeTimerRef.current = null;
    }
    touchFinalizePendingRef.current = false;
  }, []);

  const clearPending = useCallback(() => {
    clearFinalizeTimers();
    pendingSnapshotRef.current = null;
    pendingSignatureRef.current = null;
    touchSessionActiveRef.current = false;
  }, [clearFinalizeTimers]);

  const applyPending = useCallback(() => {
    const pendingSnapshot = pendingSnapshotRef.current;
    clearPending();

    if (pendingSnapshot) {
      const appliedFromSnapshot = applySelectionFromSnapshot
        ? applySelectionFromSnapshot(pendingSnapshot)
        : false;
      if (appliedFromSnapshot) {
        lastTouchAutoApplyAtRef.current = Date.now();
      }
      return;
    }

    const applied = applySelection();
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

    clearPending();
    touchSessionActiveRef.current = true;
    queueCurrentSelection();
  }, [clearPending, enabled, queueCurrentSelection]);

  const finalizeTouchSelection = useCallback(() => {
    if (!touchSessionActiveRef.current) {
      return;
    }

    queueCurrentSelection();
    applyPending();
  }, [applyPending, queueCurrentSelection]);

  const scheduleSettleFinalize = useCallback(() => {
    if (settleFinalizeTimerRef.current !== null) {
      window.clearTimeout(settleFinalizeTimerRef.current);
    }
    settleFinalizeTimerRef.current = window.setTimeout(() => {
      finalizeTouchSelection();
    }, TOUCH_FINALIZE_SETTLE_MS);
  }, [finalizeTouchSelection]);

  const beginTouchFinalize = useCallback(() => {
    if (!enabled) {
      return;
    }
    if (!touchSessionActiveRef.current) {
      return;
    }

    touchFinalizePendingRef.current = true;
    queueCurrentSelection();
    scheduleSettleFinalize();
    if (maxFinalizeTimerRef.current === null) {
      maxFinalizeTimerRef.current = window.setTimeout(() => {
        finalizeTouchSelection();
      }, TOUCH_FINALIZE_MAX_WAIT_MS);
    }
  }, [enabled, finalizeTouchSelection, queueCurrentSelection, scheduleSettleFinalize]);

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
      if (touchFinalizePendingRef.current) {
        scheduleSettleFinalize();
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [clearPending, enabled, queueCurrentSelection, scheduleSettleFinalize]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleTouchEnd = () => {
      beginTouchFinalize();
    };

    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [beginTouchFinalize, enabled]);

  return {
    isWithinRecentTouchAutoApplyGuard,
    startTouchSelectionSession,
  };
}
