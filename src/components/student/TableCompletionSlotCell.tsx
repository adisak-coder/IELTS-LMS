import React from 'react';
import { ProtectedInput } from './ProtectedInput';
import { FormattedText } from './FormattedText';
import type { StudentHighlightColor } from './highlightPalette';

export type TableCompletionSlotCellProps = {
  slotId: string;
  isActive: boolean;
  isFlagged: boolean;
  promptText: string;
  answerValue: string;
  ariaLabel: string;
  highlightEnabled: boolean;
  highlightColor?: StudentHighlightColor | undefined;
  security: {
    preventAutofill: boolean;
    preventAutocorrect: boolean;
  };
  sessionId?: string | undefined;
  studentId?: string | undefined;
  onChange: (nextValue: string) => void;
  renderFlagButton: (slotId: string) => React.ReactNode;
};

export function TableCompletionSlotCell({
  slotId,
  isActive,
  isFlagged,
  promptText,
  answerValue,
  ariaLabel,
  highlightEnabled,
  highlightColor,
  security,
  sessionId,
  studentId,
  onChange,
  renderFlagButton,
}: TableCompletionSlotCellProps) {
  return (
    <td
      id={`question-${slotId}`}
      className={`border border-gray-200 px-3 py-2 align-top ${isActive ? 'ring-2 ring-blue-500 ring-inset' : ''} ${isFlagged ? 'bg-amber-50' : ''}`}
    >
      <div className="space-y-2">
        <FormattedText
          as="p"
          className="text-[length:var(--student-control-font-size)] text-gray-800"
          text={promptText}
          highlightEnabled={highlightEnabled}
          highlightColor={highlightColor}
        />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <ProtectedInput
              type="text"
              name={slotId}
              value={answerValue}
              onChange={(event) => onChange(event.target.value)}
              className="w-full min-w-0 rounded-md border border-gray-300 px-3 py-2 text-[length:var(--student-control-font-size)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="Enter answer..."
              security={security}
              sessionId={sessionId}
              studentId={studentId}
              aria-label={ariaLabel}
            />
          </div>
          <div className="mt-1">{renderFlagButton(slotId)}</div>
        </div>
      </div>
    </td>
  );
}
