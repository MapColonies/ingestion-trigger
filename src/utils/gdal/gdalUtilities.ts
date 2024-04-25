import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { z } from 'zod';
import * as gdal from 'gdal-async';
import { SERVICES } from '../../common/constants';
import { InfoData } from '../../ingestion/schemas/infoDataSchema';
import { GdalInfo, gdalInfoSchema } from '../../ingestion/schemas/gdalDataSchema';
import { ZodValidator } from '../zodValidator';
import { LogContext } from '../logger/logContext';

@injectable()
export class GdalUtilities {
  private readonly logContext: LogContext;

  public constructor(@inject(SERVICES.LOGGER) protected readonly logger: Logger, private readonly zodValidator: ZodValidator) {
    this.logContext = {
      dirName: __dirname,
      fileName: __filename,
      class: GdalUtilities.name,
    };
  }

  public async getInfoData(filePath: string): Promise<InfoData | undefined> {
    const logCtx: LogContext = { ...this.logContext, function: this.getInfoData.name };

    try {
      this.logger.debug({ msg: `get gdal info for path: ${filePath}` });

      const dataset: gdal.Dataset = await this.getDataset(filePath);
      const infoJsonString = await gdal.infoAsync(dataset, ['-json']);
      const info = await this.parseAndValidateGdalInfo(infoJsonString);
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
      let message = 'failed to get gdal info on file';
      if (err instanceof Error) {
        message = err.message;
      }
      this.logger.error({
        msg: `error occurred: ${message}`,
        err,
        logContext: logCtx,
        metadata: { filePath },
      });
      throw new Error(message);
    }
  }

  private async parseAndValidateGdalInfo(jsonString: string): Promise<GdalInfo> {
    const logCtx: LogContext = { ...this.logContext, function: this.parseAndValidateGdalInfo.name };
    this.logger.debug({
      msg: 'parsing and validating gdalInfo string',
      logContext: logCtx,
      metadata: { jsonString },
    });

    const data: unknown = JSON.parse(jsonString);
    const validatedData = await this.zodValidator.validate<z.ZodType<GdalInfo>>(gdalInfoSchema, data);
    return validatedData;
  }

  private async getDataset(filePath: string): Promise<gdal.Dataset> {
    const logCtx: LogContext = { ...this.logContext, function: this.getDataset.name };

    try {
      return await gdal.openAsync(filePath);
    } catch (err) {
      let errMsg = `failed to open dataset for file: ${filePath}`;
      if (err instanceof Error) {
        errMsg = err.message;
      }
      this.logger.error({ msg: errMsg, err, logContext: logCtx, metadata: { filePath } });
      throw new Error(errMsg);
    }
  }
}
