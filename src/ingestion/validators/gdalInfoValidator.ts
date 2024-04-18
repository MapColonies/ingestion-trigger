import { join } from 'node:path';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IConfig } from 'config';
import { BadRequestError } from '@map-colonies/error-types';
import { GdalUtilities } from '../../utils/gdal/gdalUtilities';
import { SERVICES } from '../../common/constants';
import { ZodValidator } from '../../utils/zodValidator';
import { infoDataSchema } from '../schemas/infoDataSchema';

@injectable()
export class GdalInfoValidator {
  private readonly sourceMount: string;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    private readonly zodValidator: ZodValidator,
    private readonly gdalUtilities: GdalUtilities
  ) {
    this.sourceMount = this.config.get<string>('storageExplorer.layerSourceDir');
  }

  public async validateInfoData(files: string[], originDirectory: string): Promise<void> {
    let filePath = '';
    try {
      await Promise.all(
        files.map(async (file) => {
          filePath = join(this.sourceMount, originDirectory, file);
          const infoData = await this.gdalUtilities.getInfoData(filePath);
          await this.zodValidator.validate(infoDataSchema, infoData);
        })
      );
    } catch (err) {
      const msg = `failed to validate info data for file: ${filePath}`;

      if (err instanceof BadRequestError) {
        const badRequestMsg = `${msg}: ${err.message}`;
        throw new BadRequestError(badRequestMsg);
      } else {
        const errorMsg = err instanceof Error ? `${msg}: ${err.message}` : msg;
        this.logger.error({ msg: errorMsg, err });
        throw new Error(errorMsg);
      }
    }
  }
}
