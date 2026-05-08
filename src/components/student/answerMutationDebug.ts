import { logInfo } from '../../app/error/errorLogger';

const ANSWER_MUTATION_DEBUG_KEY = 'student.answerMutationDebug';
const ANSWER_MUTATION_DEBUG_TAG = '[DEBUG-a4f2]';

function readStorageFlag(storage: Storage): boolean {
  try {
    const value = storage.getItem(ANSWER_MUTATION_DEBUG_KEY);
    return value === '1' || value === 'true' || value === 'on';
  } catch {
    return false;
  }
}

export function isAnswerMutationDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return readStorageFlag(window.localStorage) || readStorageFlag(window.sessionStorage);
}

export function emitAnswerMutationDebugLog(
  stage: string,
  context: Record<string, unknown>,
): void {
  if (!isAnswerMutationDebugEnabled()) {
    return;
  }

  logInfo(`${ANSWER_MUTATION_DEBUG_TAG} ${stage}`, context);
}
