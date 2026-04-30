import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

interface UseDeferredSelectionHighlightOptions {
  enabled: boolean;
  containerRef: RefObject<HTMLElement | null>;
  applySelection: () => void;
}

const TOUCH_SELECTION_SETTLE_MS = 450;

export function useDeferredSelectionHighlight({
  enabled,
  containerRef,
  applySelection,
}: UseDeferredSelectionHighlightOptions) {
  const selectionTimerRef = useRef<number | null>(null);
  const [hasPendingSelection, setHasPendingSelection] = useState(false);

  const selectionBelongsToContainer = useCallback(() => {
    const container = containerRef.current;
    const selection = window.getSelection();
    if (!container || !selection || selection.rangeCount === 0 || !selection.toString().trim()) {
      return false;
    }

    const range = selection.getRangeAt(0);
    return container.contains(range.commonAncestorContainer);
  }, [containerRef]);

  const scheduleSelectionCheck = useCallback(() => {
    if (!enabled) {
      return;
    }

    if (selectionTimerRef.current) {
      window.clearTimeout(selectionTimerRef.current);
    }

    selectionTimerRef.current = window.setTimeout(() => {
      setHasPendingSelection(selectionBelongsToContainer());
      selectionTimerRef.current = null;
    }, TOUCH_SELECTION_SETTLE_MS);
  }, [enabled, selectionBelongsToContainer]);

  const applyPendingSelection = useCallback(() => {
    if (!enabled) {
      setHasPendingSelection(false);
      return;
    }

    applySelection();
    setHasPendingSelection(false);
  }, [applySelection, enabled]);

  useEffect(() => {
    return () => {
      if (selectionTimerRef.current) {
        window.clearTimeout(selectionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setHasPendingSelection(false);
      return;
    }

    const handleSelectionChange = () => {
      if (selectionBelongsToContainer()) {
        scheduleSelectionCheck();
      } else {
        setHasPendingSelection(false);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [enabled, scheduleSelectionCheck, selectionBelongsToContainer]);

  return {
    applyPendingSelection,
    hasPendingSelection,
    scheduleSelectionCheck,
  };
}
