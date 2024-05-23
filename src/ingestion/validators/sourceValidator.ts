import { promises as fsPromises, constants as fsConstants } from 'node:fs';
import { join } from 'node:path';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IConfig } from 'config';
import { FileNotFoundError } from '../errors/ingestionErrors';
import { LogContext } from '../../utils/logger/logContext';
import { SERVICES } from '../../common/constants';
import { GpkgManager } from '../models/gpkgManager';
import { GdalInfoManager } from '../models/gdalInfoManager';

@injectable()
export class SourceValidator {
  private readonly logContext: LogContext;
  private readonly sourceMount: string;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    private readonly gdalInfoManager: GdalInfoManager,
    private readonly gpkgManager: GpkgManager
  ) {
    this.logContext = {
      fileName: __filename,
      class: SourceValidator.name,
    };
    this.sourceMount = this.config.get<string>('storageExplorer.layerSourceDir');
  }

  public async validateFilesExist(srcDir: string, files: string[]): Promise<void> {
    const logCtx = { ...this.logContext, function: this.validateFilesExist.name };
    this.logger.info({ msg: 'validating source files exist', logContext: logCtx, metadata: { srcDir, files } });
    const fullPaths: string[] = [];

    const filePromises = files.map(async (file) => {
      const fullPath = join(this.sourceMount, srcDir, file);
      fullPaths.push(fullPath);
      return fsPromises.access(fullPath, fsConstants.F_OK).catch(() => {
        this.logger.error({ msg: `File '${file}' not found at '${fullPath}'`, logContext: logCtx, metadata: { file, fullPath } });
        throw new FileNotFoundError(file, fullPath);
      });
    });
    await Promise.all(filePromises);

    this.logger.info({ msg: 'source files exist', logContext: logCtx, metadata: { fullFilesPaths: fullPaths } });
  }

  public async validateGdalInfo(originDirectory: string, files: string[]): Promise<void> {
    const gdalInfoData = await this.gdalInfoManager.getInfoData(originDirectory, files);
    await this.gdalInfoManager.validateInfoData(gdalInfoData);
  }

  public validateGpkgFiles(originDirectory: string, files: string[]): void {
    this.gpkgManager.validateGpkgFiles(originDirectory, files);
  }
}
