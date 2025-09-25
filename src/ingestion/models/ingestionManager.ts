import { constants, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { ConflictError, NotFoundError } from '@map-colonies/error-types';
import { Logger } from '@map-colonies/js-logger';
import { ProductType } from '@map-colonies/mc-model-types';
import { ICreateJobResponse, IFindJobsByCriteriaBody, IJobResponse, OperationStatus } from '@map-colonies/mc-priority-queue';
import { InputFiles } from '@map-colonies/raster-shared';
import { withSpanAsyncV4, withSpanV4 } from '@map-colonies/telemetry';
import { Xxh64 } from '@node-rs/xxhash';
import { SpanStatusCode, trace, Tracer } from '@opentelemetry/api';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import { IConfig, IFindResponseRecord, ISupportedIngestionSwapTypes, LayerDetails } from '../../common/interfaces';
import { CatalogClient } from '../../serviceClients/catalogClient';
import { GpkgError } from '../../serviceClients/database/errors';
import { JobManagerWrapper } from '../../serviceClients/jobManagerWrapper';
import { MapProxyClient } from '../../serviceClients/mapProxyClient';
import { getMapServingLayerName } from '../../utils/layerNameGenerator';
import { LogContext } from '../../utils/logger/logContext';
import { FileNotFoundError, GdalInfoError, UnsupportedEntityError } from '../errors/ingestionErrors';
import type { ITaskParameters, ResponseId, SourcesValidationResponse } from '../interfaces';
import { InfoDataWithFile } from '../schemas/infoDataSchema';
import type { IngestionNewLayer } from '../schemas/ingestionLayerSchema';
import type { IngestionUpdateLayer } from '../schemas/updateLayerSchema';
import { GeoValidator } from '../validators/geoValidator';
import { SourceValidator } from '../validators/sourceValidator';
import { GdalInfoManager } from './gdalInfoManager';
import { ProductManager } from './productManager';

@injectable()
export class IngestionManager {
  private readonly logContext: LogContext;
  private readonly forbiddenJobTypes: string[];
  private readonly supportedIngestionSwapTypes: ISupportedIngestionSwapTypes[];
  private readonly updateJobType: string;
  private readonly swapUpdateJobType: string;
  private readonly sourceMount: string;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    private readonly sourceValidator: SourceValidator,
    private readonly gdalInfoManager: GdalInfoManager,
    private readonly geoValidator: GeoValidator,
    private readonly catalogClient: CatalogClient,
    private readonly jobManagerWrapper: JobManagerWrapper,
    private readonly mapProxyClient: MapProxyClient,
    private readonly productManager: ProductManager
  ) {
    this.logContext = {
      fileName: __filename,
      class: IngestionManager.name,
    };
    this.forbiddenJobTypes = this.config.get<string[]>('jobManager.forbiddenJobTypesForParallelIngestion');
    this.supportedIngestionSwapTypes = this.config.get<ISupportedIngestionSwapTypes[]>('jobManager.supportedIngestionSwapTypes');
    this.updateJobType = config.get<string>('jobManager.ingestionUpdateJobType');
    this.swapUpdateJobType = config.get<string>('jobManager.ingestionSwapUpdateJobType');
    this.sourceMount = this.config.get<string>('storageExplorer.layerSourceDir');
  }

  @withSpanAsyncV4
  public async getInfoData(inputFiles: InputFiles): Promise<InfoDataWithFile[]> {
    const logCtx: LogContext = { ...this.logContext, function: this.getInfoData.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('ingestionManager.getInfoData');
    const { gpkgFilesPath } = inputFiles;
    this.logger.info({ msg: 'getting gdal info for files', logContext: logCtx, metadata: { gpkgFilesPath } });

    await this.sourceValidator.validateFilesExist(gpkgFilesPath);
    this.logger.debug({ msg: 'Files exist validation passed', logContext: logCtx, metadata: { gpkgFilesPath } });

    const filesGdalInfoData = await this.gdalInfoManager.getInfoData(gpkgFilesPath);
    activeSpan?.setStatus({ code: SpanStatusCode.OK }).addEvent('getInfoData.get.ok');
    return filesGdalInfoData;
  }

  @withSpanAsyncV4
  public async validateSources(inputFiles: InputFiles): Promise<SourcesValidationResponse> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateSources.name };
    const { gpkgFilesPath, metadataShapefilePath, productShapefilePath } = inputFiles;
    const inputFilesPaths: string[] = [...gpkgFilesPath, metadataShapefilePath, productShapefilePath];
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('IngestionManager.validateSources');
    try {
      this.logger.info({ msg: 'Starting source validation process', logContext: logCtx, metadata: { gpkgFilesPath } });

      await this.sourceValidator.validateFilesExist(inputFilesPaths);
      this.logger.debug({ msg: 'Files exist validation passed', logContext: logCtx, metadata: { gpkgFilesPath } });

      await this.sourceValidator.validateGdalInfo(gpkgFilesPath);
      this.logger.debug({ msg: 'GDAL info validation passed', logContext: logCtx, metadata: { gpkgFilesPath } });

      this.sourceValidator.validateGpkgFiles(gpkgFilesPath);
      this.logger.debug({ msg: 'GPKG files validation passed', logContext: logCtx, metadata: { gpkgFilesPath } });

      const validationResult: SourcesValidationResponse = { isValid: true, message: 'Sources are valid' };

      this.logger.debug({
        msg: validationResult.message,
        logContext: logCtx,
        metadata: { gpkgFilesPath, isValid: validationResult.isValid },
      });
      activeSpan?.setStatus({ code: SpanStatusCode.OK }).addEvent('ingestionManager.validateSources.valid', { isValid: true });
      return validationResult;
    } catch (err) {
      if (err instanceof FileNotFoundError || err instanceof GdalInfoError || err instanceof GpkgError) {
        this.logger.info({ msg: `Sources are not valid:${err.message}`, logContext: logCtx, err: err, metadata: { gpkgFilesPath } });
        activeSpan?.addEvent('ingestionManager.validateSources.invalid', { isValid: false, validationError: err.message });
        return { isValid: false, message: err.message };
      }

      this.logger.error({
        msg: `An unexpected error occurred during source validation`,
        logContext: logCtx,
        err,
        metadata: { gpkgFilesPath },
      });
      throw err;
    }
  }

  @withSpanAsyncV4
  public async ingestNewLayer(newLayer: IngestionNewLayer): Promise<ResponseId> {
    const logCtx: LogContext = { ...this.logContext, function: this.ingestNewLayer.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('IngestionManager.ingestNewLayer');

    await this.ingestionNewValidations(newLayer);
    this.logger.info({ msg: `finished validation of new Layer. all checks have passed`, logContext: logCtx });
    activeSpan?.addEvent('ingestionManager.validateNewLayer.success', { validationSuccess: true });

    const response: ICreateJobResponse = await this.jobManagerWrapper.createInitJob(newLayer);

    activeSpan
      ?.setStatus({ code: SpanStatusCode.OK })
      .addEvent('ingestionManager.ingestLayer.success', { triggerSuccess: true, jobId: response.id, taskId: response.taskIds[0] });
    this.logger.info({ msg: `new job and init task were created. jobId: ${response.id}, taskId: ${response.taskIds[0]} `, logContext: logCtx });

    return { jobId: response.id };
  }

  @withSpanAsyncV4
  public async updateLayer(catalogId: string, updateLayer: IngestionUpdateLayer): Promise<ResponseId> {
    const logCtx: LogContext = { ...this.logContext, function: this.updateLayer.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('IngestionManager.updateLayer');

    const layerDetails: LayerDetails = await this.validateAndGetUpdatedLayerParams(catalogId, updateLayer);
    this.logger.info({ msg: `finished validation of update Layer. all checks have passed`, logContext: logCtx });
    activeSpan?.addEvent('ingestionManager.validateUpdateLayer.success', { validationSuccess: true });

    const response = await this.setAndCreateUpdateJob(catalogId, layerDetails, updateLayer);
    this.logger.info({
      msg: `new update job and init task were created. jobId: ${response.id}, taskId: ${response.taskIds[0]} `,
      logContext: logCtx,
    });
    activeSpan
      ?.setStatus({ code: SpanStatusCode.OK })
      .addEvent('ingestionManager.updateLayer.success', { triggerSuccess: true, jobId: response.id, taskId: response.taskIds[0] });

    return { jobId: response.id };
  }

  @withSpanAsyncV4
  private async setAndCreateUpdateJob(catalogId: string, layerDetails: LayerDetails, updateLayer: IngestionUpdateLayer): Promise<ICreateJobResponse> {
    const isSwapUpdate = this.supportedIngestionSwapTypes.find((supportedSwapObj) => {
      return supportedSwapObj.productType === layerDetails.productType && supportedSwapObj.productSubType === layerDetails.productSubType;
    });

    const updateJobAction = isSwapUpdate ? this.swapUpdateJobType : this.updateJobType;
    // TODO: call function that appends hash to updateLayer
    const checksum = await this.calculateChecksum(updateLayer.inputFiles.metadataShapefilePath);
    return this.jobManagerWrapper.createInitUpdateJob(layerDetails, catalogId, updateLayer, updateJobAction);
  }

  @withSpanAsyncV4
  private async validateAndGetUpdatedLayerParams(catalogId: string, updateLayer: IngestionUpdateLayer): Promise<LayerDetails> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateAndGetUpdatedLayerParams.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('ingestionManager.validateAndGetUpdatedLayerParams');
    const { metadata, inputFiles } = updateLayer;
    this.logger.debug({
      msg: 'started update layer validation',
      catalogId: catalogId,
      requestBody: { metadata, inputFiles },
      logCtx: logCtx,
    });
    this.logger.info({
      catalogId: catalogId,
      msg: 'started validation on update layer request',
      logCtx: logCtx,
    });
    await this.validateInputFiles(inputFiles);
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
  private async ingestionNewValidations(rasterIngestionLayer: IngestionNewLayer): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.ingestionNewValidations.name };
    const { metadata, inputFiles } = rasterIngestionLayer;
    this.logger.debug({ msg: 'started new layer validation', requestBody: { metadata, inputFiles }, logCtx: logCtx });
    this.logger.info({
      productId: metadata.productId,
      productType: metadata.productType,
      productName: metadata.productName,
      msg: 'started validation on new layer request',
      logCtx: logCtx,
    });
    // validate input files (gpkgs, metadata shp, product shp files)
    await this.validateInputFiles(inputFiles);

    // validate against catalog, mapproxy, job-manager
    const layerName = getMapServingLayerName(metadata.productId, metadata.productType);
    await this.validateLayerDoesntExistInMapProxy(layerName);
    await this.validateLayerDoesntExistInCatalog(metadata.productId, metadata.productType);
    await this.validateNoConflictingJobs(metadata.productId, metadata.productType);
    this.logger.info({ msg: 'validation in catalog ,job manager and mapproxy passed', logContext: logCtx });
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
      statuses: [OperationStatus.PENDING, OperationStatus.IN_PROGRESS, OperationStatus.FAILED, OperationStatus.SUSPENDED],
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
  private async validateLayerDoesntExistInCatalog(productId: string, productType: ProductType): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateLayerDoesntExistInCatalog.name };
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
  private async validateInputFiles(inputFiles: InputFiles): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateInputFiles.name };
    const { productShapefilePath } = inputFiles;

    // validate files exist, gdal info and GPKG data
    const isValidSources: SourcesValidationResponse = await this.validateSources(inputFiles);
    if (!isValidSources.isValid) {
      const errorMessage = isValidSources.message;
      this.logger.error({ msg: errorMessage, logContext: logCtx, inputFiles: { inputFiles } });
      const error = new UnsupportedEntityError(isValidSources.message);
      throw error;
    }
    this.logger.debug({ msg: 'validated sources', logContext: logCtx });

    // validate new ingestion product.shp against gpkg data extent
    const infoData: InfoDataWithFile[] = await this.getInfoData(inputFiles);
    const productFeature = await this.productManager.extractAndRead(productShapefilePath);
    await this.geoValidator.validate(infoData, productFeature);
    this.logger.debug({ msg: 'validated geometries', logContext: logCtx });
  }

  @withSpanV4
  private async calculateChecksum(filePath: string): Promise<string> {
    const logCtx: LogContext = { ...this.logContext, function: this.calculateChecksum.name };

    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    const hasher = new Xxh64();
    const fullPath = join(this.sourceMount, filePath);
    const stream = createReadStream(fullPath, { mode: constants.R_OK });

    const checksum = await new Promise<string>((resolve, reject) => {
      stream.on('data', (chunk) => {
        hasher.update(chunk);
      });
      stream.on('end', () => {
        // eslint-disable-next-line @typescript-eslint/no-magic-numbers
        const checksum = hasher.digest().toString(16);
        this.logger.info({ msg: 'calculated checksum', checksum, logContext: logCtx });
        resolve(checksum);
      });
      stream.on('error', (error) => {
        this.logger.error({ msg: 'error calculating checksum', error, logContext: logCtx });
        reject(error);
      });
    });
    return checksum;
  }
}
