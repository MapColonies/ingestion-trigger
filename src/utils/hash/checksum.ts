import { constants, createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { Logger } from '@map-colonies/js-logger';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';
import { trace, type Tracer } from '@opentelemetry/api';
import { inject, injectable } from 'tsyringe';
import { CHECKSUM_PROCESSOR, SERVICES } from '../../common/constants';
import type { IConfig } from '../../common/interfaces';
import { ChecksumError } from '../../ingestion/errors/ingestionErrors';
import type { LogContext } from '../logger/logContext';
import type { HashProcessor, Checksum as IChecksum } from './interface';

@injectable()
export class Checksum {
  private readonly logContext: LogContext;

  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.LOGGER) protected readonly logger: Logger,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    @inject(CHECKSUM_PROCESSOR) private readonly checksumProcessor: HashProcessor
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

    const stream = createReadStream(filePath, { mode: constants.R_OK });

    if (this.checksumProcessor.reset) {
      this.checksumProcessor.reset();
    }

    try {
      const { checksum } = await this.fromStream(stream);
      this.logger.info({ msg: 'calculated checksum', filePath, algorithm: this.checksumProcessor.algorithm, checksum, logContext: logCtx });
      return { algorithm: this.checksumProcessor.algorithm, checksum, fileName: filePath };
    } catch (err) {
      this.logger.error({ msg: 'error calculating checksum', err, logContext: logCtx });
      throw new ChecksumError(`Failed to calculate checksum for file: ${filePath}`);
    }
  }

  @withSpanAsyncV4
  private async fromStream(stream: Readable): Promise<Pick<IChecksum, 'checksum'>> {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('checksum.fromStream');

    const checksum = await new Promise<string>((resolve, reject) => {
      stream.on('data', (chunk) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        this.checksumProcessor.update(chunk);
      });
      stream.on('end', () => {
        const digest = this.checksumProcessor.digest();
        // eslint-disable-next-line @typescript-eslint/no-magic-numbers
        const hash = digest.toString(16);
        resolve(hash);
      });
      stream.on('error', (err) => {
        reject(err);
      });
    });

    return { checksum };
  }
}
