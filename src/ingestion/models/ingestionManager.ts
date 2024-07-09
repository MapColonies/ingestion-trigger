import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { InputFiles, ProductType, NewRasterLayer, UpdateRasterLayer, PolygonPart } from '@map-colonies/mc-model-types';
import { ConflictError, BadRequestError } from '@map-colonies/error-types';
import { ICreateJobResponse, IFindJobsRequest, IJobResponse, OperationStatus } from '@map-colonies/mc-priority-queue';
import { SERVICES } from '../../common/constants';
import { SourceValidator } from '../validators/sourceValidator';
import { FileNotFoundError, GdalInfoError, UnsupportedEntityError } from '../errors/ingestionErrors';
import { SourcesValidationResponse } from '../interfaces';
import { GpkgError } from '../../serviceClients/database/errors';
import { LogContext } from '../../utils/logger/logContext';
import { InfoDataWithFile } from '../schemas/infoDataSchema';
import { PolygonPartValidator } from '../validators/polygonPartValidator';
import { CatalogClient } from '../../serviceClients/catalogClient';
import { FindRecordResponse, IConfig, ISupportedIngestionSwapTypes, LayerDetails } from '../../common/interfaces';
import { JobManagerWrapper } from '../../serviceClients/jobManagerWrapper';
import { ITaskParameters } from '../interfaces';
import { getMapServingLayerName } from '../../utils/layerNameGenerator';
import { MapProxyClient } from '../../serviceClients/mapProxyClient';
import { UpdateJobAction } from '../../common/enums';
import { GdalInfoManager } from './gdalInfoManager';

@injectable()
export class IngestionManager {
  private readonly logContext: LogContext;
  private readonly ingestionJobTypes: string[];

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
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
    this.ingestionJobTypes = this.config.get<string[]>('forbiddenTypesForParallelIngestion');
  }

  public async getInfoData(inputFiles: InputFiles): Promise<InfoDataWithFile[]> {
    const logCtx: LogContext = { ...this.logContext, function: this.getInfoData.name };

    const { originDirectory, fileNames } = inputFiles;
    this.logger.info({ msg: 'getting gdal info for files', logContext: logCtx, metadata: { originDirectory, fileNames } });

    await this.sourceValidator.validateFilesExist(originDirectory, fileNames);
    this.logger.debug({ msg: 'Files exist validation passed', logContext: logCtx, metadata: { originDirectory, fileNames } });

    const filesGdalInfoData = await this.gdalInfoManager.getInfoData(originDirectory, fileNames);

    return filesGdalInfoData;
  }

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

  public async ingestNewLayer(rasterIngestionLayer: NewRasterLayer): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.ingestNewLayer.name };
    await this.validateNewLayer(rasterIngestionLayer);
    this.logger.info({ msg: `finished validation of new Layer. all checks have passed`, logContext: logCtx });

    const response: ICreateJobResponse = await this.jobManagerWrapper.createInitJob(rasterIngestionLayer);
    this.logger.info({ msg: `new job and init task were created. jobId: ${response.id}, taskId: ${response.taskIds[0]} `, logContext: logCtx });
  }

  public async updateLayer(internalId: string, rasterUpdateLayer: UpdateRasterLayer): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.updateLayer.name };
    const layerDetails: LayerDetails = await this.validateUpdateLayer(internalId, rasterUpdateLayer);
    this.logger.info({ msg: `finished validation of update Layer. all checks have passed`, logContext: logCtx });

    const response = await this.setAndCreateUpdateJob(internalId, layerDetails, rasterUpdateLayer);
    this.logger.info({
      msg: `new update job and init task were created. jobId: ${response.id}, taskId: ${response.taskIds[0]} `,
      logContext: logCtx,
    });
  }

  private async setAndCreateUpdateJob(
    internalId: string,
    layerDetails: LayerDetails,
    rasterUpdateLayer: UpdateRasterLayer
  ): Promise<ICreateJobResponse> {
    const supportedIngestionSwapTypes = this.config.get<ISupportedIngestionSwapTypes[]>('supportedIngestionSwapTypes');
    const isSwapUpdate = supportedIngestionSwapTypes.find((supportedSwapObj) => {
      return supportedSwapObj.productType === layerDetails.productType && supportedSwapObj.productSubType === layerDetails.productSubType;
    });
    const updateJobAction = isSwapUpdate ? UpdateJobAction.UPDATE_SWAP : UpdateJobAction.UPDATE;
    return this.jobManagerWrapper.createInitUpdateJob(
      layerDetails.productId,
      layerDetails.productVersion,
      internalId,
      rasterUpdateLayer,
      updateJobAction
    );
  }

  private async validateUpdateLayer(resourceId: string, rasterUpdateLayer: UpdateRasterLayer): Promise<LayerDetails> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateUpdateLayer.name };
    const { metadata, partData, inputFiles } = rasterUpdateLayer;
    this.logger.debug({ msg: 'started update layer validation', requestBody: { metadata, partData, inputFiles }, logCtx: logCtx });
    this.logger.info({
      resourceId: resourceId,
      msg: 'started validation on update layer request',
      logCtx: logCtx,
    });
    await this.isValidRequestInputs(partData, inputFiles);
    //catalog call must be before map proxy to get productId and Type
    const layerDetails = await this.getLayer(resourceId);
    const { productId, productVersion, productType, productSubType = '' } = layerDetails[0].metadata as LayerDetails;

    await this.validateLayerExistsInMapProxy(productId, productType);
    await this.validateNoRunningParallelJobs(productId, productType);
    this.logger.info({ msg: 'validation in catalog ,job manager and mapproxy passed', logContext: logCtx });

    return { productId, productVersion, productType, productSubType };
  }

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

    await this.isValidRequestInputs(partData, inputFiles);

    //catalog ,mapproxy, jobmanager validation
    await this.validateLayerDoesntExistInMapProxy(metadata.productId, metadata.productType);
    await this.isInCatalog(metadata.productId, metadata.productType);
    await this.validateNoRunningJobs(metadata.productId, metadata.productType);
    this.logger.info({ msg: 'validation in catalog ,job manager and mapproxy passed', logContext: logCtx });
  }

  private async validateNoRunningJobs(productId: string, productType: ProductType): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateNoRunningJobs.name };
    const jobs = await this.getRunningJobs(productId, productType);
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

  private async validateNoRunningParallelJobs(productId: string, productType: ProductType): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateNoRunningParallelJobs.name };
    const jobs = await this.getRunningJobs(productId, productType);
    jobs.forEach((job) => {
      if ((job.status == OperationStatus.IN_PROGRESS || job.status == OperationStatus.PENDING) && this.ingestionJobTypes.includes(job.type)) {
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

  private async getRunningJobs(productId: string, productType: ProductType): Promise<IJobResponse<Record<string, unknown>, ITaskParameters>[]> {
    const findJobParameters: IFindJobsRequest = {
      resourceId: productId,
      productType,
      isCleaned: false,
      shouldReturnTasks: false,
    };
    const jobs = await this.jobManagerWrapper.getJobs<Record<string, unknown>, ITaskParameters>(findJobParameters);
    return jobs;
  }

  private async validateLayerDoesntExistInMapProxy(productId: string, productType: ProductType): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateLayerDoesntExistInMapProxy.name };
    const exists = await this.getlLayerExistanceInMapProxy(productId, productType);
    if (exists) {
      const message = `Failed to create new ingestion job for layer: ${productId}-${productType}, already exists on MapProxy`;
      this.logger.error({
        productId: productId,
        productType: productType,
        msg: message,
        logCtx: logCtx,
      });
      throw new ConflictError(message);
    }
  }

  private async validateLayerExistsInMapProxy(productId: string, productType: ProductType): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateLayerExistsInMapProxy.name };
    const exists = await this.getlLayerExistanceInMapProxy(productId, productType);
    if (!exists) {
      const message = `Failed to create update job for layer: ${productId}-${productType}, layer doesnt exist on MapProxy`;
      this.logger.error({
        productId: productId,
        productType: productType,
        msg: message,
        logCtx: logCtx,
      });
      throw new BadRequestError(message);
    }
  }

  private async getlLayerExistanceInMapProxy(productId: string, productType: ProductType): Promise<boolean> {
    const layerName = getMapServingLayerName(productId, productType);
    const existanceInMapServer = await this.mapProxyClient.exists(layerName);
    return existanceInMapServer;
  }

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

  private async getLayer(resourceId: string): Promise<FindRecordResponse> {
    const layerDetails = await this.catalogClient.findByInternalId(resourceId);
    if (layerDetails.length === 0) {
      const message = `there isnt a layer with id of ${resourceId}`;
      throw new BadRequestError(message);
    } else if (layerDetails.length !== 1) {
      const message = `found more than one Layer with id of ${resourceId} . Please check the catalog Layers`;
      throw new ConflictError(message);
    }
    return layerDetails;
  }

  private async isValidRequestInputs(partData: PolygonPart[], inputFiles: InputFiles): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.isValidRequestInputs.name };

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
  }
}
