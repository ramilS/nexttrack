import axios from 'axios';
import { classifyMigrationError } from '../utils/error-classification';
import { formatHttpError } from '../utils/http-error';

export type MigrationRunTerminalResult =
  | {
      status: 'BLOCKED';
      blocker: 'AUTHENTICATION';
      terminalMessage: string;
      originalError: unknown;
    }
  | {
      status: 'INTERRUPTED';
      blocker: null;
      terminalMessage: string;
      originalError: unknown;
    };

export function migrationRunTerminalResult(error: unknown): MigrationRunTerminalResult {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (classifyMigrationError(error) === 'FATAL' && (status === 401 || status === 403)) {
      return {
        status: 'BLOCKED',
        blocker: 'AUTHENTICATION',
        terminalMessage:
          `Migration blocked by authentication (HTTP ${status}). ` +
          'Refresh credentials and resume.',
        originalError: error,
      };
    }
  }

  return {
    status: 'INTERRUPTED',
    blocker: null,
    terminalMessage: `Migration interrupted: ${formatHttpError(error)}`,
    originalError: error,
  };
}
