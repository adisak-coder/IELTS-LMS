import { useMemo, useState } from 'react';
import {
  createHighlightService,
  type HighlightMutationReason,
} from '../highlight-application/highlightService';
import type {
  HighlightBlockKey,
  HighlightColor,
  HighlightSet,
} from '../highlight-domain/highlightTypes';
import {
  createLocalHighlightStore,
  type HighlightStore,
} from '../highlight-infra/localHighlightStore';

type SelectionInput = {
  start: number;
  end: number;
  selectedText: string;
};

type UseReadingHighlightControllerArgs = {
  key: HighlightBlockKey;
  blockTextLength: number;
  color: HighlightColor;
  store?: HighlightStore;
};

export function useReadingHighlightController({
  key,
  blockTextLength,
  color,
  store,
}: UseReadingHighlightControllerArgs) {
  const resolvedStore = useMemo(() => store ?? createLocalHighlightStore(), [store]);
  const service = useMemo(() => createHighlightService(resolvedStore), [resolvedStore]);
  const [ranges, setRanges] = useState<HighlightSet>(() =>
    service.restore({ key, blockTextLength }),
  );
  const [lastReason, setLastReason] = useState<HighlightMutationReason>(null);

  const applySelection = (selection: SelectionInput) => {
    const result = service.applySelection({
      key,
      current: ranges,
      blockTextLength,
      selection,
      color,
    });
    setLastReason(result.reason);
    if (result.changed) {
      setRanges(result.next);
    }
  };

  const removeAtOffset = (offset: number) => {
    const result = service.removeAtOffset({ key, current: ranges, offset });
    setLastReason(result.reason);
    if (result.changed) {
      setRanges(result.next);
    }
  };

  const clear = () => {
    const result = service.clear({ key, current: ranges });
    setLastReason(result.reason);
    if (result.changed) {
      setRanges(result.next);
    }
  };

  const restore = () => {
    const next = service.restore({ key, blockTextLength });
    setRanges(next);
    setLastReason(null);
  };

  return {
    ranges,
    lastReason,
    applySelection,
    removeAtOffset,
    clear,
    restore,
  };
}
