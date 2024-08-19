import { promises as fsPromises, constants as fsConstants } from 'node:fs';
import { join } from 'node:path';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IConfig } from 'config';
import { SpanKind, Tracer } from '@opentelemetry/api';
import { withSpanAsyncV4, withSpanV4 } from '@map-colonies/telemetry';
import { FileNotFoundError } from '../errors/ingestionErrors';
import { LogContext } from '../../utils/logger/logContext';
import { SERVICES } from '../../common/constants';
import { GpkgManager } from '../models/gpkgManager';
import { GdalInfoManager } from '../models/gdalInfoManager';
import { createSpanMetadata } from '../../common/tracing';

@injectable()
export class SourceValidator {
  private readonly logContext: LogContext;
  private readonly sourceMount: string;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    private readonly gdalInfoManager: GdalInfoManager,
    private readonly gpkgManager: GpkgManager
  ) {
    this.logContext = {
      fileName: __filename,
      class: SourceValidator.name,
    };
    this.sourceMount = this.config.get<string>('storageExplorer.layerSourceDir');
  }

  @withSpanAsyncV4
  public async validateGdalInfo(originDirectory: string, files: string[]): Promise<void> {
    const gdalInfoData = await this.gdalInfoManager.getInfoData(originDirectory, files);
    await this.gdalInfoManager.validateInfoData(gdalInfoData);
  }

  @withSpanV4
  public validateGpkgFiles(originDirectory: string, files: string[]): void {
    this.gpkgManager.validateGpkgFiles(originDirectory, files);
  }

  public async validateFilesExist(srcDir: string, files: string[]): Promise<void> {
    const logCtx = { ...this.logContext, function: this.validateFilesExist.name };
    this.logger.debug({ msg: 'validating source files exist', logContext: logCtx, metadata: { srcDir, files } });
    const fullPaths: string[] = [];

    const { spanOptions } = createSpanMetadata('validateFilesExist', SpanKind.INTERNAL);
    const existsSpan = this.tracer.startSpan('sourceValidator.validate_gpkg_exists process', spanOptions);

    const filePromises = files.map(async (file) => {
      const fullPath = join(this.sourceMount, srcDir, file);
      fullPaths.push(fullPath);
      return fsPromises
        .access(fullPath, fsConstants.F_OK)
        .catch(() => {
          this.logger.error({ msg: `File '${file}' not found at '${fullPath}'`, logContext: logCtx, metadata: { file, fullPath } });
          const error = new FileNotFoundError(file, fullPath);
          existsSpan.recordException(error);
          throw error;
        })
        .finally(() => {
          existsSpan.end();
        });
    });
    await Promise.all(filePromises);

    this.logger.debug({ msg: 'source files exist', logContext: logCtx, metadata: { fullFilesPaths: fullPaths } });
    
  }
}
