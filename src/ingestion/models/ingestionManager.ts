import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { InputFiles, ProductType, NewRasterLayer } from '@map-colonies/mc-model-types';
import { ConflictError } from '@map-colonies/error-types';
import { ICreateJobResponse, IFindJobsRequest, OperationStatus } from '@map-colonies/mc-priority-queue';
import { SERVICES } from '../../common/constants';
import { SourceValidator } from '../validators/sourceValidator';
import { FileNotFoundError, GdalInfoError, UnsupportedEntityError } from '../errors/ingestionErrors';
import { SourcesValidationResponse } from '../interfaces';
import { GpkgError } from '../../serviceClients/database/errors';
import { LogContext } from '../../utils/logger/logContext';
import { InfoDataWithFile } from '../schemas/infoDataSchema';
import { PolygonPartValidator } from '../validators/polygonPartValidator';
import { CatalogClient } from '../../serviceClients/catalogClient';
import { IConfig } from '../../common/interfaces';
import { JobManagerWrapper } from '../../serviceClients/jobManagerWrapper';
import { ITaskParameters } from '../interfaces';
import { getMapServingLayerName } from '../../utils/layerNameGenerator';
import { MapProxyClient } from '../../serviceClients/mapProxyClient';
import { GdalInfoManager } from './gdalInfoManager';
import { Tracer } from '@opentelemetry/api';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';

@injectable()
export class IngestionManager {
  private readonly logContext: LogContext;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    private readonly sourceValidator: SourceValidator,
    private readonly gdalInfoManager: GdalInfoManager,
    private readonly polygonPartValidator: PolygonPartValidator,
    private readonly catalogClient: CatalogClient,
    private readonly jobManagerWrapper: JobManagerWrapper,
    private readonly mapProxyClient: MapProxyClient
  ) {
    this.logContext = {
      fileName: __filename,
      class: IngestionManager.name,
    };
  }

  @withSpanAsyncV4
  public async getInfoData(inputFiles: InputFiles): Promise<InfoDataWithFile[]> {
    const logCtx: LogContext = { ...this.logContext, function: this.getInfoData.name };

    const { originDirectory, fileNames } = inputFiles;
    this.logger.info({ msg: 'getting gdal info for files', logContext: logCtx, metadata: { originDirectory, fileNames } });

    await this.sourceValidator.validateFilesExist(originDirectory, fileNames);
    this.logger.debug({ msg: 'Files exist validation passed', logContext: logCtx, metadata: { originDirectory, fileNames } });

    const filesGdalInfoData = await this.gdalInfoManager.getInfoData(originDirectory, fileNames);

    return filesGdalInfoData;
  }

  @withSpanAsyncV4
  public async validateSources(inputFiles: InputFiles): Promise<SourcesValidationResponse> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateSources.name };
    const { originDirectory, fileNames } = inputFiles;
    try {
      this.logger.info({ msg: 'Starting source validation process', logContext: logCtx, metadata: { originDirectory, fileNames } });

      await this.sourceValidator.validateFilesExist(originDirectory, fileNames);
      this.logger.debug({ msg: 'Files exist validation passed', logContext: logCtx, metadata: { originDirectory, fileNames } });

      await this.sourceValidator.validateGdalInfo(originDirectory, fileNames);
      this.logger.debug({ msg: 'GDAL info validation passed', logContext: logCtx, metadata: { originDirectory, fileNames } });

      this.sourceValidator.validateGpkgFiles(originDirectory, fileNames);
      this.logger.debug({ msg: 'GPKG files validation passed', logContext: logCtx, metadata: { originDirectory, fileNames } });

      const validationResult: SourcesValidationResponse = { isValid: true, message: 'Sources are valid' };

      this.logger.debug({
        msg: validationResult.message,
        logContext: logCtx,
        metadata: { originDirectory, fileNames, isValid: validationResult.isValid },
      });
      return validationResult;
    } catch (err) {
      if (err instanceof FileNotFoundError || err instanceof GdalInfoError || err instanceof GpkgError) {
        this.logger.info({ msg: `Sources are not valid:${err.message}`, logContext: logCtx, err: err, metadata: { originDirectory, fileNames } });
        return { isValid: false, message: err.message };
      }

      this.logger.error({
        msg: `An unexpected error occurred during source validation`,
        logContext: logCtx,
        err,
        metadata: { originDirectory, fileNames },
      });

      throw err;
    }
  }

  @withSpanAsyncV4
  public async ingestNewLayer(rasterIngestionLayer: NewRasterLayer): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.ingestNewLayer.name };
    await this.validateNewLayer(rasterIngestionLayer);
    this.logger.info({ msg: `finished validation of new Layer. all checks have passed`, logContext: logCtx });

    //create one job with one task
    const response: ICreateJobResponse = await this.jobManagerWrapper.createInitJob(rasterIngestionLayer);
    this.logger.info({ msg: `new job and init task were created. jobId: ${response.id}, taskId: ${response.taskIds[0]} `, logContext: logCtx });
  }

  @withSpanAsyncV4
  private async validateNewLayer(rasterIngestionLayer: NewRasterLayer): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateNewLayer.name };
    const { metadata, partData, inputFiles } = rasterIngestionLayer;
    this.logger.debug({ msg: 'started new layer validation', requestBody: { metadata, partData, inputFiles }, logCtx: logCtx });
    this.logger.info({
      productId: metadata.productId,
      productType: metadata.productType,
      productName: metadata.productName,
      msg: 'started validation on new layer request',
      logCtx: logCtx,
    });

    //validate files exist, gdal info and GPKG data
    const isValidSources: SourcesValidationResponse = await this.validateSources(inputFiles);
    if (!isValidSources.isValid) {
      const errorMessage = isValidSources.message;
      this.logger.error({ msg: errorMessage, logContext: logCtx, inputFiles: { inputFiles } });
      throw new UnsupportedEntityError(isValidSources.message);
    }
    this.logger.debug({ msg: 'validated sources', logContext: logCtx });

    //validate new ingestion payload against gpkg data for each part
    const infoData: InfoDataWithFile[] = await this.getInfoData(inputFiles);
    this.polygonPartValidator.validate(partData, infoData);
    this.logger.debug({ msg: 'validated geometries', logContext: logCtx });

    //catalog ,mapproxy, jobmanager validation
    await this.isInMapProxy(metadata.productId, metadata.productType);
    await this.isInCatalog(metadata.productId, metadata.productType);
    await this.validateJobNotRunning(metadata.productId, metadata.productType);
    this.logger.info({ msg: 'validation in catalog ,job manager and mapproxy passed', logContext: logCtx });
  }

  @withSpanAsyncV4
  private async validateJobNotRunning(productId: string, productType: ProductType): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateJobNotRunning.name };
    const findJobParameters: IFindJobsRequest = {
      resourceId: productId,
      productType,
      isCleaned: false,
      shouldReturnTasks: false,
    };
    const jobs = await this.jobManagerWrapper.getJobs<Record<string, unknown>, ITaskParameters>(findJobParameters);
    jobs.forEach((job) => {
      if (job.status == OperationStatus.IN_PROGRESS || job.status == OperationStatus.PENDING) {
        const message = `Layer id: ${productId} product type: ${productType}, conflicting job ${job.type} is already running for that layer`;
        this.logger.error({
          productId: productId,
          productType: productType,
          msg: message,
          logCtx: logCtx,
        });
        throw new ConflictError(message);
      }
    });
  }

  @withSpanAsyncV4
  private async isInMapProxy(productId: string, productType: ProductType): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.isInMapProxy.name };
    const layerName = getMapServingLayerName(productId, productType);
    const existsInMapServer = await this.mapProxyClient.exists(layerName);
    if (existsInMapServer) {
      const message = `Failed to create new ingestion job for layer: '${layerName} ', already exists on MapProxy`;
      this.logger.error({
        productId: productId,
        productType: productType,
        mapProxyLayerName: layerName,
        msg: message,
        logCtx: logCtx,
      });
      throw new ConflictError(message);
    }
  }

  @withSpanAsyncV4
  private async isInCatalog(productId: string, productType: ProductType): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.isInCatalog.name };
    const existsInCatalog = await this.catalogClient.exists(productId, productType);
    if (existsInCatalog) {
      const message = `Layer id: ${productId} ProductType: ${productType}, already exists in catalog`;
      this.logger.error({
        productId: productId,
        productType: productType,
        msg: message,
        logCtx: logCtx,
      });
      throw new ConflictError(message);
    }
  }
}
