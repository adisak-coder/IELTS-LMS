import React, { useEffect, useRef } from 'react';
import { useOptionalStudentAttempt } from './providers/StudentAttemptProvider';

type ProtectedSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function ProtectedSelect({ ...selectProps }: ProtectedSelectProps) {
  const attemptContext = useOptionalStudentAttempt();
  const { onChange: userOnChange, onBlur: userOnBlur, ...restSelectProps } = selectProps;
  const selectRef = useRef<HTMLSelectElement>(null);
  const lastRescuedDomValueRef = useRef<string | null>(null);
  const latestDomValueRef = useRef<string>('');
  const deferredRescueTimerRef = useRef<number | null>(null);
  const onChangeRef = useRef<typeof userOnChange>(userOnChange);
  const controlledValueRef = useRef(selectProps.value);
  const flushAnswerDurabilityNowRef = useRef(attemptContext?.actions.flushAnswerDurabilityNow);

  useEffect(() => {
    onChangeRef.current = userOnChange;
    controlledValueRef.current = selectProps.value;
    flushAnswerDurabilityNowRef.current = attemptContext?.actions.flushAnswerDurabilityNow;
  }, [attemptContext, selectProps.value, userOnChange]);

  useEffect(() => {
    const select = selectRef.current;
    if (!select) return;
    latestDomValueRef.current = select.value;

    const maybeCommitDomValue = () => {
      if (typeof onChangeRef.current !== 'function') return;
      if (controlledValueRef.current === undefined || controlledValueRef.current === null) return;
      if (Array.isArray(controlledValueRef.current)) return;

      const domValue = latestDomValueRef.current || select.value;
      const controlledValue = String(controlledValueRef.current);
      if (domValue === controlledValue) {
        lastRescuedDomValueRef.current = null;
        return;
      }
      if (lastRescuedDomValueRef.current === domValue) {
        return;
      }

      (onChangeRef.current as unknown as (event: unknown) => void)({
        target: select,
        currentTarget: select,
        type: 'change',
      });
      lastRescuedDomValueRef.current = domValue;
      flushAnswerDurabilityNowRef.current?.();
    };

    const scheduleDeferredDomCommit = () => {
      if (deferredRescueTimerRef.current !== null) {
        window.clearTimeout(deferredRescueTimerRef.current);
      }
      deferredRescueTimerRef.current = window.setTimeout(() => {
        deferredRescueTimerRef.current = null;
        latestDomValueRef.current = select.value;
        maybeCommitDomValue();
      }, 0);
    };

    const handleNativeChange = () => {
      latestDomValueRef.current = select.value;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      latestDomValueRef.current = select.value;
      maybeCommitDomValue();
    };

    const handlePageHide = () => {
      latestDomValueRef.current = select.value;
      maybeCommitDomValue();
    };

    const handleFreeze = () => {
      latestDomValueRef.current = select.value;
      maybeCommitDomValue();
    };

    const handleFocusOut = () => {
      latestDomValueRef.current = select.value;
      maybeCommitDomValue();
      scheduleDeferredDomCommit();
    };

    const handleBlur = () => {
      latestDomValueRef.current = select.value;
      maybeCommitDomValue();
      scheduleDeferredDomCommit();
    };

    const handleBeforeUnload = () => {
      latestDomValueRef.current = select.value;
      maybeCommitDomValue();
    };

    select.addEventListener('change', handleNativeChange);
    document.addEventListener('focusout', handleFocusOut, true);
    select.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('freeze', handleFreeze as EventListener);

    return () => {
      if (deferredRescueTimerRef.current !== null) {
        window.clearTimeout(deferredRescueTimerRef.current);
        deferredRescueTimerRef.current = null;
      }
      select.removeEventListener('change', handleNativeChange);
      document.removeEventListener('focusout', handleFocusOut, true);
      select.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('freeze', handleFreeze as EventListener);
    };
  }, []);

  return (
    <select
      ref={selectRef}
      {...restSelectProps}
      onChange={(event) => {
        latestDomValueRef.current = event.currentTarget.value;
        userOnChange?.(event);
      }}
      onBlur={(event) => {
        latestDomValueRef.current = event.currentTarget.value;
        userOnBlur?.(event);
      }}
    />
  );
}
