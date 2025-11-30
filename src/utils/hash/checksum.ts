import { constants, createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { Logger } from '@map-colonies/js-logger';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';
import { trace, type Tracer } from '@opentelemetry/api';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import type { LogContext } from '../../common/interfaces';
import { ChecksumError } from '../../ingestion/errors/ingestionErrors';
import { CHECKSUM_PROCESSOR } from './constants';
import type { ChecksumProcessor, Checksum as IChecksum } from './interfaces';

@injectable()
export class Checksum {
  private readonly logContext: LogContext;

  public constructor(
    @inject(SERVICES.LOGGER) protected readonly logger: Logger,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    @inject(CHECKSUM_PROCESSOR) private readonly checksumProcessorInit: () => Promise<ChecksumProcessor>
  ) {
    this.logContext = {
      fileName: __filename,
      class: Checksum.name,
    };
  }

  @withSpanAsyncV4
  public async calculate(filePath: string): Promise<IChecksum> {
    const logCtx: LogContext = { ...this.logContext, function: this.calculate.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('checksum.calculate');
    this.logger.debug({ msg: 'calculating checksum', filePath, logContext: logCtx });

    try {
      const checksumProcessor = await this.checksumProcessorInit();
      const stream = createReadStream(filePath, { mode: constants.R_OK });

      checksumProcessor.reset?.();

      const { checksum } = await this.fromStream(stream, checksumProcessor);
      this.logger.debug({ msg: 'calculated checksum', filePath, algorithm: 'XXH64', checksum, logContext: logCtx });
      return { algorithm: 'XXH64', checksum, fileName: filePath };
    } catch (err) {
      this.logger.error({ msg: 'error calculating checksum', err, logContext: logCtx });
      throw new ChecksumError(`Failed to calculate checksum for file: ${filePath}`);
    }
  }

  @withSpanAsyncV4
  private async fromStream(stream: Readable, checksumProcessor: ChecksumProcessor): Promise<Pick<IChecksum, 'checksum'>> {
    const logCtx: LogContext = { ...this.logContext, function: this.fromStream.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('checksum.fromStream');

    const checksum = await new Promise<string>((resolve, reject) => {
      stream.on('data', (chunk) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          checksumProcessor.update(chunk);
        } catch (err) {
          this.logger.error({ msg: 'error processing checksum for a chunk', err, logContext: logCtx });
          stream.destroy();
          reject(err);
        }
      });
      stream.on('end', () => {
        try {
          const digest = checksumProcessor.digest();
          // eslint-disable-next-line @typescript-eslint/no-magic-numbers
          const hash = digest.toString(16);
          resolve(hash);
        } catch (err) {
          this.logger.error({ msg: 'error processing checksum result', err, logContext: logCtx });
          stream.destroy();
          reject(err);
        }
      });
      stream.on('error', (err) => {
        stream.destroy();
        reject(err);
      });
    });

    return { checksum };
  }
}
