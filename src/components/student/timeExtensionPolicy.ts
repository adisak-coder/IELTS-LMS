import type { ExamConfig } from '../../types';

export function shouldOfferTimeExtension({
  config,
  phase,
  runtimeBacked,
  displayTimeRemaining,
}: {
  config: Pick<ExamConfig, 'delivery'>;
  phase: string;
  runtimeBacked: boolean;
  displayTimeRemaining: number | undefined;
}): boolean {
  return (
    !runtimeBacked &&
    phase === 'exam' &&
    displayTimeRemaining === 300 &&
    Array.isArray(config.delivery.allowedExtensionMinutes) &&
    config.delivery.allowedExtensionMinutes.includes(5)
  );
}

