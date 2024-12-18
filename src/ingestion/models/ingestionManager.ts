import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { InputFiles, ProductType, NewRasterLayer, UpdateRasterLayer, PolygonPart } from '@map-colonies/mc-model-types';
import { ConflictError, NotFoundError } from '@map-colonies/error-types';
import { ICreateJobResponse, IJobResponse, OperationStatus, IFindJobsByCriteriaBody } from '@map-colonies/mc-priority-queue';
import { SpanStatusCode, trace, Tracer } from '@opentelemetry/api';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';
import { SERVICES } from '../../common/constants';
import { SourceValidator } from '../validators/sourceValidator';
import { FileNotFoundError, GdalInfoError, UnsupportedEntityError } from '../errors/ingestionErrors';
import { SourcesValidationResponse } from '../interfaces';
import { GpkgError } from '../../serviceClients/database/errors';
import { LogContext } from '../../utils/logger/logContext';
import { InfoDataWithFile } from '../schemas/infoDataSchema';
import { PolygonPartValidator } from '../validators/polygonPartValidator';
import { CatalogClient } from '../../serviceClients/catalogClient';
import { IConfig, IFindResponseRecord, ISupportedIngestionSwapTypes, LayerDetails } from '../../common/interfaces';
import { JobManagerWrapper } from '../../serviceClients/jobManagerWrapper';
import { ITaskParameters } from '../interfaces';
import { getMapServingLayerName } from '../../utils/layerNameGenerator';
import { MapProxyClient } from '../../serviceClients/mapProxyClient';
import { GdalInfoManager } from './gdalInfoManager';

@injectable()
export class IngestionManager {
  private readonly logContext: LogContext;
  private readonly forbiddenJobTypes: string[];
  private readonly supportedIngestionSwapTypes: ISupportedIngestionSwapTypes[];
  private readonly updateJobType: string;
  private readonly swapUpdateJobType: string;

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
    this.forbiddenJobTypes = this.config.get<string[]>('jobManager.forbiddenJobTypesForParallelIngestion');
    this.supportedIngestionSwapTypes = this.config.get<ISupportedIngestionSwapTypes[]>('jobManager.supportedIngestionSwapTypes');
    this.updateJobType = config.get<string>('jobManager.ingestionUpdateJobType');
    this.swapUpdateJobType = config.get<string>('jobManager.ingestionSwapUpdateJobType');
  }

  @withSpanAsyncV4
  public async getInfoData(inputFiles: InputFiles): Promise<InfoDataWithFile[]> {
    const logCtx: LogContext = { ...this.logContext, function: this.getInfoData.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('ingestionManager.getInfoData');
    const { originDirectory, fileNames } = inputFiles;
    this.logger.info({ msg: 'getting gdal info for files', logContext: logCtx, metadata: { originDirectory, fileNames } });

    await this.sourceValidator.validateFilesExist(originDirectory, fileNames);
    this.logger.debug({ msg: 'Files exist validation passed', logContext: logCtx, metadata: { originDirectory, fileNames } });

    const filesGdalInfoData = await this.gdalInfoManager.getInfoData(originDirectory, fileNames);
    activeSpan?.setStatus({ code: SpanStatusCode.OK }).addEvent('getInfoData.get.ok');
    return filesGdalInfoData;
  }

  @withSpanAsyncV4
  public async validateSources(inputFiles: InputFiles): Promise<SourcesValidationResponse> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateSources.name };
    const { originDirectory, fileNames } = inputFiles;
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('IngestionManager.validateSources');
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
      activeSpan?.setStatus({ code: SpanStatusCode.OK }).addEvent('ingestionManager.validateSources.valid', { isValid: true });
      return validationResult;
    } catch (err) {
      if (err instanceof FileNotFoundError || err instanceof GdalInfoError || err instanceof GpkgError) {
        this.logger.info({ msg: `Sources are not valid:${err.message}`, logContext: logCtx, err: err, metadata: { originDirectory, fileNames } });
        activeSpan?.addEvent('ingestionManager.validateSources.invalid', { isValid: false, validationError: err.message });
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
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('IngestionManager.ingestNewLayer');

    await this.validateNewLayer(rasterIngestionLayer);
    this.logger.info({ msg: `finished validation of new Layer. all checks have passed`, logContext: logCtx });
    activeSpan?.addEvent('ingestionManager.validateNewLayer.success', { validationSuccess: true });

    const response: ICreateJobResponse = await this.jobManagerWrapper.createInitJob(rasterIngestionLayer);

    activeSpan
      ?.setStatus({ code: SpanStatusCode.OK })
      .addEvent('ingestionManager.ingestLayer.success', { triggerSuccess: true, jobId: response.id, taskId: response.taskIds[0] });
    this.logger.info({ msg: `new job and init task were created. jobId: ${response.id}, taskId: ${response.taskIds[0]} `, logContext: logCtx });
  }

  @withSpanAsyncV4
  public async updateLayer(catalogId: string, rasterUpdateLayer: UpdateRasterLayer): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.updateLayer.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('IngestionManager.updateLayer');

    const layerDetails: LayerDetails = await this.validateAndGetUpdatedLayerParams(catalogId, rasterUpdateLayer);
    this.logger.info({ msg: `finished validation of update Layer. all checks have passed`, logContext: logCtx });
    activeSpan?.addEvent('ingestionManager.validateUpdateLayer.success', { validationSuccess: true });

    const response = await this.setAndCreateUpdateJob(catalogId, layerDetails, rasterUpdateLayer);
    this.logger.info({
      msg: `new update job and init task were created. jobId: ${response.id}, taskId: ${response.taskIds[0]} `,
      logContext: logCtx,
    });
    activeSpan
      ?.setStatus({ code: SpanStatusCode.OK })
      .addEvent('ingestionManager.updateLayer.success', { triggerSuccess: true, jobId: response.id, taskId: response.taskIds[0] });
  }

  @withSpanAsyncV4
  private async setAndCreateUpdateJob(
    catalogId: string,
    layerDetails: LayerDetails,
    rasterUpdateLayer: UpdateRasterLayer
  ): Promise<ICreateJobResponse> {
    const isSwapUpdate = this.supportedIngestionSwapTypes.find((supportedSwapObj) => {
      return supportedSwapObj.productType === layerDetails.productType && supportedSwapObj.productSubType === layerDetails.productSubType;
    });

    const updateJobAction = isSwapUpdate ? this.swapUpdateJobType : this.updateJobType;
    return this.jobManagerWrapper.createInitUpdateJob(layerDetails, catalogId, rasterUpdateLayer, updateJobAction);
  }

  @withSpanAsyncV4
  private async validateAndGetUpdatedLayerParams(catalogId: string, rasterUpdateLayer: UpdateRasterLayer): Promise<LayerDetails> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateAndGetUpdatedLayerParams.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('ingestionManager.validateAndGetUpdatedLayerParams');
    const { metadata, partsData, inputFiles } = rasterUpdateLayer;
    this.logger.debug({
      msg: 'started update layer validation',
      catalogId: catalogId,
      requestBody: { metadata, partsData, inputFiles },
      logCtx: logCtx,
    });
    this.logger.info({
      catalogId: catalogId,
      msg: 'started validation on update layer request',
      logCtx: logCtx,
    });
    await this.validateRequestInputs(partsData, inputFiles);
    //catalog call must be before map proxy to get productId and Type
    const layerDetails = await this.getLayer(catalogId);
    const {
      productId,
      productVersion,
      productType,
      productSubType = '',
      tileOutputFormat,
      displayPath,
      productName,
      footprint,
    } = layerDetails.metadata as LayerDetails;
    activeSpan?.addEvent('updateLayer.getLayer', {
      productId,
      productVersion,
      productType,
      productSubType,
      tileOutputFormat,
      displayPath,
      productName,
    });

    const layerName = getMapServingLayerName(productId, productType);
    await this.validateLayerExistsInMapProxy(layerName);
    await this.validateNoParallelJobs(productId, productType);
    this.logger.info({ msg: 'validation in catalog ,job manager and mapproxy passed', logContext: logCtx });
    return { productId, productVersion, productType, productSubType, tileOutputFormat, displayPath, productName, footprint };
  }

  @withSpanAsyncV4
  private async validateNewLayer(rasterIngestionLayer: NewRasterLayer): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateNewLayer.name };
    const { metadata, partsData, inputFiles } = rasterIngestionLayer;
    this.logger.debug({ msg: 'started new layer validation', requestBody: { metadata, partsData, inputFiles }, logCtx: logCtx });
    this.logger.info({
      productId: metadata.productId,
      productType: metadata.productType,
      productName: metadata.productName,
      msg: 'started validation on new layer request',
      logCtx: logCtx,
    });

    await this.validateRequestInputs(partsData, inputFiles);
    //catalog ,mapproxy, jobmanager validation
    const layerName = getMapServingLayerName(metadata.productId, metadata.productType);
    await this.validateLayerDoesntExistInMapProxy(layerName);
    await this.isInCatalog(metadata.productId, metadata.productType);
    await this.validateNoConflictingJobs(metadata.productId, metadata.productType);
    this.logger.info({ msg: 'validation in catalog ,job manager and mapProxy passed', logContext: logCtx });
  }

  @withSpanAsyncV4
  private async validateNoConflictingJobs(productId: string, productType: ProductType): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateNoConflictingJobs.name };
    const jobs = await this.getJobs(productId, productType);
    if (jobs.length !== 0) {
      const message = `ProductId: ${productId} ProductType: ${productType}, there is at least one conflicting job already running for that layer`;
      this.logger.error({
        productId: productId,
        productType: productType,
        msg: message,
        logCtx: logCtx,
      });
      const error = new ConflictError(message);
      trace.getActiveSpan()?.setAttribute('exception.type', error.status);
      throw error;
    }
  }

  @withSpanAsyncV4
  private async validateNoParallelJobs(productId: string, productType: ProductType): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateNoParallelJobs.name };
    const jobs = await this.getJobs(productId, productType, this.forbiddenJobTypes);
    if (jobs.length !== 0) {
      const message = `ProductId: ${productId} productType: ${productType}, there is at least one conflicting job already running for that layer`;
      this.logger.error({
        productId: productId,
        productType: productType,
        msg: message,
        logCtx: logCtx,
      });
      const error = new ConflictError(message);
      trace.getActiveSpan()?.setAttribute('exception.type', error.status);
      throw error;
    }
  }

  @withSpanAsyncV4
  private async getJobs(
    productId: string,
    productType: ProductType,
    forbiddenParallel?: string[]
  ): Promise<IJobResponse<Record<string, unknown>, ITaskParameters>[]> {
    const findJobParameters: IFindJobsByCriteriaBody = {
      resourceId: productId,
      productType,
      isCleaned: false,
      shouldReturnTasks: false,
      statuses: [OperationStatus.PENDING, OperationStatus.IN_PROGRESS],
      types: forbiddenParallel,
    };
    const jobs = await this.jobManagerWrapper.findJobs<Record<string, unknown>, ITaskParameters>(findJobParameters);
    return jobs;
  }

  @withSpanAsyncV4
  private async validateLayerDoesntExistInMapProxy(layerName: string): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateLayerDoesntExistInMapProxy.name };
    const exists = await this.mapProxyClient.exists(layerName);
    if (exists) {
      const message = `Failed to create new ingestion job for layer: ${layerName}, already exists on MapProxy`;
      this.logger.error({
        layerName: layerName,
        msg: message,
        logCtx: logCtx,
      });
      const error = new ConflictError(message);
      trace.getActiveSpan()?.setAttribute('exception.type', error.status);
      throw error;
    }
  }

  @withSpanAsyncV4
  private async validateLayerExistsInMapProxy(layerName: string): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateLayerExistsInMapProxy.name };
    const exists = await this.mapProxyClient.exists(layerName);
    if (!exists) {
      const message = `Failed to create update job for layer: ${layerName}, layer doesnt exist on MapProxy`;
      this.logger.error({
        layerName: layerName,
        msg: message,
        logCtx: logCtx,
      });
      const error = new NotFoundError(message);
      trace.getActiveSpan()?.setAttribute('exception.type', error.status);
      throw error;
    }
  }

  @withSpanAsyncV4
  private async isInCatalog(productId: string, productType: ProductType): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.isInCatalog.name };
    const existsInCatalog = await this.catalogClient.exists(productId, productType);
    if (existsInCatalog) {
      const message = `ProductId: ${productId} ProductType: ${productType}, already exists in catalog`;
      this.logger.error({
        productId: productId,
        productType: productType,
        msg: message,
        logCtx: logCtx,
      });
      const error = new ConflictError(message);
      trace.getActiveSpan()?.setAttribute('exception.type', error.status);
      throw error;
    }
  }

  @withSpanAsyncV4
  private async getLayer(catalogId: string): Promise<IFindResponseRecord> {
    const layerDetails = await this.catalogClient.findById(catalogId);
    const getLayerSpan = trace.getActiveSpan();
    if (layerDetails.length === 0) {
      const message = `there isnt a layer with id of ${catalogId}`;
      const error = new NotFoundError(message);
      getLayerSpan?.setAttribute('exception.type', error.status);
      throw error;
    } else if (layerDetails.length !== 1) {
      const message = `found more than one layer with id of ${catalogId}, Please check the catalog layers`;
      const error = new ConflictError(message);
      getLayerSpan?.setAttribute('exception.type', error.status);
      throw error;
    }
    return layerDetails[0];
  }

  @withSpanAsyncV4
  private async validateRequestInputs(partsData: PolygonPart[], inputFiles: InputFiles): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateRequestInputs.name };

    //validate files exist, gdal info and GPKG data
    const isValidSources: SourcesValidationResponse = await this.validateSources(inputFiles);
    if (!isValidSources.isValid) {
      const errorMessage = isValidSources.message;
      this.logger.error({ msg: errorMessage, logContext: logCtx, inputFiles: { inputFiles } });
      const error = new UnsupportedEntityError(isValidSources.message);
      throw error;
    }
    this.logger.debug({ msg: 'validated sources', logContext: logCtx });

    //validate new ingestion payload against gpkg data for each part
    const infoData: InfoDataWithFile[] = await this.getInfoData(inputFiles);
    this.polygonPartValidator.validate(partsData, infoData);
    this.logger.debug({ msg: 'validated geometries', logContext: logCtx });
  }
}
