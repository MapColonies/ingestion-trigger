import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { Logger } from '@map-colonies/js-logger';
import { BadRequestError, NotFoundError } from '@map-colonies/error-types';
import { Span } from '@opentelemetry/api';

export class UnsupportedEntityError extends Error {
  public constructor(message: string) {
    super(message);
  }
}
export class FileNotFoundError extends NotFoundError {
  public constructor(fileName: string);
  public constructor(fileName: string[]);
  public constructor(fileName: string, path: string);
  public constructor(fileName: string | string[], path?: string) {
    const names = Array.isArray(fileName) ? fileName.join(', ') : fileName;
    const message = Array.isArray(fileName)
      ? path !== undefined
        ? `Files '${names}' do not exist in path ${path}`
        : `Files ${names} do not exist`
      : path !== undefined
      ? `File '${names}' does not exist in path ${path}`
      : `File ${names} does not exist`;
    super(message);
  }
}

export class GdalInfoError extends UnsupportedEntityError {
  public constructor(message: string) {
    super(message);
  }
}

export class ChecksumError extends UnsupportedEntityError {
  public constructor(message: string) {
    super(message);
  }
}

export class ValidationError extends Error {
  public constructor(message: string) {
    super(message);
  }
}

export function throwInvalidJobStatusError(
  operation: string,
  jobId: string,
  currentStatus: OperationStatus,
  logger: Logger,
  span?: Span
): never {
  const message = `Cannot ${operation} job with id: ${jobId} because its status is: ${currentStatus}`;

  logger.error({ msg: message, jobId, currentStatus });

  const error = new BadRequestError(message);
  span?.setAttribute('exception.type', error.status);
  throw error;
}
