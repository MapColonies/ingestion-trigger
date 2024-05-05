import { promises as fsPromises, constants as fsConstants } from 'node:fs';
import { join } from 'node:path';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IConfig } from 'config';
import { FileNotFoundError } from '../errors/ingestionErrors';
import { LogContext } from '../../utils/logger/logContext';
import { SERVICES } from '../../common/constants';
import { GpkgManager } from '../models/gpkgManager';
import { GdalInfoValidator } from './gdalInfoValidator';

@injectable()
export class SourceValidator {
  private readonly logContext: LogContext;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    private readonly gdalInfoValidator: GdalInfoValidator,
    private readonly gpkgManager: GpkgManager
  ) {
    this.logContext = {
      fileName: __filename,
      class: SourceValidator.name,
    };
  }

  public async validateFilesExist(srcDir: string, files: string[]): Promise<void> {
    const logCtx = { ...this.logContext, function: this.validateFilesExist.name };
    this.logger.info({ msg: 'validating source files exist', logContext: logCtx, metadata: { srcDir, files } });
    const sourceMount = this.config.get<string>('storageExplorer.layerSourceDir');

    const filePromises = files.map(async (file) => {
      const fullPath = join(sourceMount, srcDir, file);
      return fsPromises.access(fullPath, fsConstants.F_OK).catch(() => {
        throw new FileNotFoundError(file, fullPath);
      });
    });

    await Promise.all(filePromises);
    this.logger.info({ msg: 'source files exist', logContext: logCtx });
  }

  public async validateGdalInfo(originDirectory: string, files: string[]): Promise<void> {
    await this.gdalInfoValidator.validateInfoData(files, originDirectory);
  }

  public validateGpkgFiles(files: string[], originDirectory: string): void {
    this.gpkgManager.validateGpkgFiles(originDirectory, files);
  }
}
