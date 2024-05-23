import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import * as gdal from 'gdal-async';
import { SERVICES } from '../../common/constants';
import { InfoData } from '../../ingestion/schemas/infoDataSchema';
import { GdalInfo } from '../../ingestion/schemas/gdalDataSchema';
import { LogContext } from '../logger/logContext';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../validation/schemasValidator';

@injectable()
export class GdalUtilities {
  private readonly logContext: LogContext;

  public constructor(
    @inject(SERVICES.LOGGER) protected readonly logger: Logger,
    @inject(INGESTION_SCHEMAS_VALIDATOR_SYMBOL) private readonly schemasValidator: SchemasValidator
  ) {
    this.logContext = {
      fileName: __filename,
      class: GdalUtilities.name,
    };
  }

  public async getInfoData(filePath: string): Promise<InfoData> {
    const logCtx: LogContext = { ...this.logContext, function: this.getInfoData.name };

    try {
      this.logger.debug({ msg: `get gdal info for path: ${filePath}`, logCOntext: logCtx, metadata: { filePath } });

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
        msg: message,
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
    const validatedData = await this.schemasValidator.validateGdalInfo(data);
    return validatedData;
  }

  private async getDataset(filePath: string): Promise<gdal.Dataset> {
    const logCtx: LogContext = { ...this.logContext, function: this.getDataset.name };

    try {
      const dataSet = await gdal.openAsync(filePath);
      return dataSet;
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
