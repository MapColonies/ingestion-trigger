import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { z } from 'zod';
import * as gdal from 'gdal-async';
import { BadRequestError } from '@map-colonies/error-types';
import { SERVICES } from '../../common/constants';
import { InfoData } from '../../ingestion/schemas/infoDataSchema';
import { GdalInfo, gdalInfoSchema } from '../../ingestion/schemas/gdalDataSchema';
import { ZodValidator } from '../zodValidator';

@injectable()
export class GdalUtilities {
  private readonly className: string;

  public constructor(@inject(SERVICES.LOGGER) protected readonly logger: Logger, private readonly zodValidator: ZodValidator) {
    this.className = GdalUtilities.name;
  }
  public async getInfoData(filePath: string): Promise<InfoData | undefined> {
    const fnName = this.getInfoData.name;

    try {
      this.logger.debug({
        filePath,
        msg: `get gdal info for path: ${filePath}`,
      });

      const dataset: gdal.Dataset = await this.getDataset(filePath);
      const jsonString = await gdal.infoAsync(dataset, ['-json']);
      const info = await this.parseAndValidateGdalInfo(jsonString);
      const { driverShortName, wgs84Extent, geoTransform, stac } = info;

      const infoData: InfoData = {
        crs: stac['proj:epsg'],
        fileFormat: driverShortName,
        pixelSize: geoTransform[1],
        extentPolygon: wgs84Extent,
      };

      dataset.close();

      return infoData;
    } catch (err) {
      if (err instanceof BadRequestError) {
        throw new BadRequestError(err.message);
      } else {
        const message = err instanceof Error ? err.message : 'failed to get gdal info on file';
        this.logger.error({
          filePath,
          msg: `[${this.className}][${fnName}] error occurred: ${message}`,
          err,
        });
        throw new Error(message);
      }
    }
  }

  private async parseAndValidateGdalInfo(jsonString: string): Promise<GdalInfo> {
    const fnName = this.parseAndValidateGdalInfo.name;
    this.logger.debug({
      msg: `[${this.className}][${fnName}] parsing gdalInfo string`,
      jsonString,
    });

    const data: unknown = JSON.parse(jsonString);
    const validatedData = await this.zodValidator.validate<z.ZodType<GdalInfo>>(gdalInfoSchema, data);
    return validatedData;
  }

  private async getDataset(filePath: string): Promise<gdal.Dataset> {
    try {
      return await gdal.openAsync(filePath);
    } catch (err) {
      const errMessage = `failed to open file: ${filePath}`;
      const fnName = this.getDataset.name;
      this.logger.error({ msg: `[${this.className}][${fnName}] - ${errMessage}`, filePath, err });
      throw new BadRequestError(errMessage);
    }
  }
}
