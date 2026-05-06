const PLACEHOLDER_PATTERN = /_{2,}/;
const PLACEHOLDER_SPLIT_PATTERN = /(_{2,})/g;
const SUSPICIOUS_COMPLETION_MIN_LENGTH = 260;
const SUSPICIOUS_COMPLETION_NEWLINE_THRESHOLD = 3;
const SUSPICIOUS_COMPLETION_SENTENCE_THRESHOLD = 3;
const SUSPICIOUS_COMPLETION_WORD_THRESHOLD = 45;
const COPIED_READING_PASSAGE_MARKER_PATTERN =
  /(?:^|\n)\s*(?:READING\s+PASSAGE\s+\d+|You\s+should\s+spend\s+about\s+\d+\s+minutes\s+on\s+Questions\s+\d+\s*[-–]\s*\d+|Questions\s+\d+\s*[-–]\s*\d+[^.\n]*Reading\s+Passage\s+\d+)/gi;

function getCopiedReadingPassageMarkerIndexAfterPlaceholder(value: string): number {
  const firstPlaceholder = value.search(PLACEHOLDER_PATTERN);
  if (firstPlaceholder < 0) {
    return -1;
  }

  COPIED_READING_PASSAGE_MARKER_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = COPIED_READING_PASSAGE_MARKER_PATTERN.exec(value)) !== null) {
    if (match.index > firstPlaceholder) {
      return match.index;
    }
  }

  return -1;
}

function stripCopiedReadingPassageAfterPrompt(value: string): string {
  const markerIndex = getCopiedReadingPassageMarkerIndexAfterPlaceholder(value);
  if (markerIndex < 0) {
    return value;
  }

  return value.slice(0, markerIndex).trimEnd();
}

export function isSuspiciousCompletionPromptText(value: string): boolean {
  const text = (value ?? '').trim();
  if (!text) return false;

  COPIED_READING_PASSAGE_MARKER_PATTERN.lastIndex = 0;
  if (COPIED_READING_PASSAGE_MARKER_PATTERN.test(text)) {
    return true;
  }

  if (text.length < SUSPICIOUS_COMPLETION_MIN_LENGTH) return false;

  const newlineCount = text.match(/\n/g)?.length ?? 0;
  const sentencePunctuationCount = text.match(/[.!?]/g)?.length ?? 0;
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return (
    newlineCount >= SUSPICIOUS_COMPLETION_NEWLINE_THRESHOLD
    || sentencePunctuationCount >= SUSPICIOUS_COMPLETION_SENTENCE_THRESHOLD
    || wordCount >= SUSPICIOUS_COMPLETION_WORD_THRESHOLD
  );
}

export function trimSuspiciousCompletionPromptText(value: string, segmentLength = 140): string {
  if (!isSuspiciousCompletionPromptText(value)) {
    return value;
  }

  const markerStripped = stripCopiedReadingPassageAfterPrompt(value);
  if (markerStripped !== value) {
    return markerStripped;
  }

  const tokens = value.split(PLACEHOLDER_SPLIT_PATTERN);
  if (tokens.length === 1) {
    return `${value.slice(0, Math.max(segmentLength, 120)).trimEnd()}…`;
  }

  return tokens
    .map((token, index) => {
      if (PLACEHOLDER_PATTERN.test(token)) {
        return token;
      }

      const normalized = token.replace(/\s+/g, ' ').trim();
      if (normalized.length <= segmentLength) {
        return token;
      }

      const previous = tokens[index - 1] ?? '';
      const next = tokens[index + 1] ?? '';
      const followsPlaceholder = PLACEHOLDER_PATTERN.test(previous);
      const precedesPlaceholder = PLACEHOLDER_PATTERN.test(next);

      if (!followsPlaceholder && precedesPlaceholder) {
        return `…${normalized.slice(-segmentLength)}`;
      }

      if (followsPlaceholder && !precedesPlaceholder) {
        return `${normalized.slice(0, segmentLength)}…`;
      }

      const half = Math.floor(segmentLength / 2);
      return `${normalized.slice(0, half)}…${normalized.slice(-half)}`;
    })
    .join('');
}
