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
import type { HashProcessor, Checksum as IChecksum } from './interfaces';

@injectable()
export class Checksum {
  private readonly logContext: LogContext;
  private checksum: HashProcessor | undefined;

  public constructor(
    @inject(SERVICES.LOGGER) protected readonly logger: Logger,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    @inject(CHECKSUM_PROCESSOR) private readonly checksumProcessor: () => Promise<HashProcessor>
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
      this.checksum = await this.checksumProcessor();
      const stream = createReadStream(filePath, { mode: constants.R_OK });

      if (this.checksum.reset) {
        this.checksum.reset();
      }

      const { checksum } = await this.fromStream(stream);
      this.logger.info({ msg: 'calculated checksum', filePath, algorithm: 'XXH64', checksum, logContext: logCtx });
      return { algorithm: 'XXH64', checksum, fileName: filePath };
    } catch (err) {
      this.logger.error({ msg: 'error calculating checksum', err, logContext: logCtx });
      throw new ChecksumError(`Failed to calculate checksum for file: ${filePath}`);
    }
  }

  @withSpanAsyncV4
  private async fromStream(stream: Readable): Promise<Pick<IChecksum, 'checksum'>> {
    const logCtx: LogContext = { ...this.logContext, function: this.fromStream.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('checksum.fromStream');

    const checksum = await new Promise<string>((resolve, reject) => {
      stream.on('data', (chunk) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          this.checksum?.update(chunk);
        } catch (err) {
          this.logger.error({ msg: 'error processing checksum for a chunk', err, logContext: logCtx });
          stream.destroy();
          reject(err);
        }
      });
      stream.on('end', () => {
        try {
          if (!this.checksum) {
            return reject();
          }

          const digest = this.checksum.digest();
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
