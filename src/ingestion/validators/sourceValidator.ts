import { constants as fsConstants, promises as fsPromises } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@map-colonies/js-logger';
import { withSpanAsyncV4, withSpanV4 } from '@map-colonies/telemetry';
import { trace, Tracer } from '@opentelemetry/api';
import { IConfig } from 'config';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import { LogContext } from '../../utils/logger/logContext';
import { FileNotFoundError } from '../errors/ingestionErrors';
import { GdalInfoManager } from '../models/gdalInfoManager';
import { GpkgManager } from '../models/gpkgManager';

@injectable()
export class SourceValidator {
  private readonly logContext: LogContext;
  private readonly sourceMount: string;
  private readonly extentBufferInMeters: number;
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
    this.extentBufferInMeters = this.config.get<number>('validationValuesByInfo.extentBufferInMeters');
  }

  @withSpanAsyncV4
  public async validateGdalInfo(files: string[]): Promise<void> {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('sourceValidator.validateGdalInfo');
    const gdalInfoData = await this.gdalInfoManager.getInfoData(files);
    await this.gdalInfoManager.validateInfoData(gdalInfoData);
    activeSpan?.addEvent('sourceValidator.validateGdalInfo.passed');
  }

  @withSpanV4
  public validateGpkgFiles(files: string[]): void {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('sourceValidator.validateGpkgFiles');
    this.gpkgManager.validateGpkgFiles(files);
    activeSpan?.addEvent('sourceValidator.validateGpkgFiles.passed');
  }

  @withSpanAsyncV4
  public async validateFilesExist(filesPath: string[]): Promise<void> {
    const logCtx = { ...this.logContext, function: this.validateFilesExist.name };
    this.logger.debug({ msg: 'validating source files exist', logContext: logCtx, metadata: { filesPath } });
    const fullPaths: string[] = [];

    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('sourceValidator.validateFilesExist');

    const filePromises = filesPath.map(async (filePath) => {
      const fullPath = join(this.sourceMount, filePath);
      fullPaths.push(fullPath);
      return fsPromises.access(fullPath, fsConstants.F_OK).catch(() => {
        this.logger.error({ msg: `File '${filePath}' not found at '${fullPath}'`, logContext: logCtx, metadata: { fullPath } });
        const error = new FileNotFoundError(filePath, fullPath);
        throw error;
      });
    });
    await Promise.all(filePromises);
    activeSpan?.addEvent('sourceValidator.validateFilesExist.valid');
    this.logger.debug({ msg: 'source files exist', logContext: logCtx, metadata: { fullFilesPaths: fullPaths } });
  }
}
