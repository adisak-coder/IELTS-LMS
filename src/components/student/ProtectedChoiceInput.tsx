import React, { useEffect, useRef } from 'react';
import { useOptionalStudentAttempt } from './providers/StudentAttemptProvider';

type ChoiceType = 'radio' | 'checkbox';

interface ProtectedChoiceInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  type: ChoiceType;
}

export function ProtectedChoiceInput({ type, ...inputProps }: ProtectedChoiceInputProps) {
  const attemptContext = useOptionalStudentAttempt();
  const { onChange: userOnChange, onBlur: userOnBlur, ...restInputProps } = inputProps;
  const inputRef = useRef<HTMLInputElement>(null);
  const lastRescuedDomCheckedRef = useRef<boolean | null>(null);
  const latestDomCheckedRef = useRef<boolean>(false);
  const deferredRescueTimerRef = useRef<number | null>(null);
  const onChangeRef = useRef<typeof userOnChange>(userOnChange);
  const controlledCheckedRef = useRef(inputProps.checked);
  const flushAnswerDurabilityNowRef = useRef(attemptContext?.actions.flushAnswerDurabilityNow);

  useEffect(() => {
    onChangeRef.current = userOnChange;
    controlledCheckedRef.current = inputProps.checked;
    flushAnswerDurabilityNowRef.current = attemptContext?.actions.flushAnswerDurabilityNow;
  }, [attemptContext, inputProps.checked, userOnChange]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    latestDomCheckedRef.current = input.checked;

    const maybeCommitDomValue = () => {
      if (typeof onChangeRef.current !== 'function') return;
      if (typeof controlledCheckedRef.current !== 'boolean') return;

      const domChecked = latestDomCheckedRef.current;
      const controlledChecked = controlledCheckedRef.current;
      const changed =
        type === 'radio'
          ? controlledChecked === false && domChecked === true
          : domChecked !== controlledChecked;
      if (!changed) return;
      if (lastRescuedDomCheckedRef.current === domChecked) return;

      (onChangeRef.current as unknown as (event: unknown) => void)({
        target: input,
        currentTarget: input,
        type: 'change',
      });
      lastRescuedDomCheckedRef.current = domChecked;
      flushAnswerDurabilityNowRef.current?.();
    };

    const scheduleDeferredDomCommit = () => {
      if (deferredRescueTimerRef.current !== null) {
        window.clearTimeout(deferredRescueTimerRef.current);
      }
      deferredRescueTimerRef.current = window.setTimeout(() => {
        deferredRescueTimerRef.current = null;
        latestDomCheckedRef.current = input.checked;
        maybeCommitDomValue();
      }, 0);
    };

    const handleNativeInput = () => {
      latestDomCheckedRef.current = input.checked;
    };

    const handleNativeChange = () => {
      latestDomCheckedRef.current = input.checked;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      latestDomCheckedRef.current = input.checked;
      maybeCommitDomValue();
    };

    const handlePageHide = () => {
      latestDomCheckedRef.current = input.checked;
      maybeCommitDomValue();
    };

    const handleFreeze = () => {
      latestDomCheckedRef.current = input.checked;
      maybeCommitDomValue();
    };

    const handleFocusOut = () => {
      latestDomCheckedRef.current = input.checked;
      maybeCommitDomValue();
      scheduleDeferredDomCommit();
    };

    const handleBlur = () => {
      latestDomCheckedRef.current = input.checked;
      maybeCommitDomValue();
      scheduleDeferredDomCommit();
    };

    const handleBeforeUnload = () => {
      latestDomCheckedRef.current = input.checked;
      maybeCommitDomValue();
    };

    input.addEventListener('input', handleNativeInput);
    input.addEventListener('change', handleNativeChange);
    document.addEventListener('focusout', handleFocusOut, true);
    input.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('freeze', handleFreeze as EventListener);

    return () => {
      if (deferredRescueTimerRef.current !== null) {
        window.clearTimeout(deferredRescueTimerRef.current);
        deferredRescueTimerRef.current = null;
      }
      input.removeEventListener('input', handleNativeInput);
      input.removeEventListener('change', handleNativeChange);
      document.removeEventListener('focusout', handleFocusOut, true);
      input.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('freeze', handleFreeze as EventListener);
    };
  }, [type]);

  return (
    <input
      ref={inputRef}
      type={type}
      {...restInputProps}
      onChange={(event) => {
        latestDomCheckedRef.current = event.currentTarget.checked;
        userOnChange?.(event);
      }}
      onBlur={(event) => {
        latestDomCheckedRef.current = event.currentTarget.checked;
        userOnBlur?.(event);
      }}
    />
  );
}
