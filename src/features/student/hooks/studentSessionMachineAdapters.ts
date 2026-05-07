import {
  emitStudentObservabilityMetric,
  type StudentObservabilityField,
  withStudentObservabilityDimensions,
} from '../../../utils/studentObservability';
import type { StudentSessionMetricCommand } from './studentSessionStateMachine';

export function runStudentSessionMachineCommands(commands: StudentSessionMetricCommand[]): void {
  for (const command of commands) {
    if (command.type !== 'emit_metric') {
      continue;
    }
    emitStudentObservabilityMetric(
      command.name,
      withStudentObservabilityDimensions(command.dimensions as Record<string, StudentObservabilityField>),
    );
  }
}
