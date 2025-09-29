import { join } from 'node:path';
import { ConflictError, NotFoundError } from '@map-colonies/error-types';
import { Logger } from '@map-colonies/js-logger';
import { ICreateJobResponse, IFindJobsByCriteriaBody, OperationStatus } from '@map-colonies/mc-priority-queue';
import { getMapServingLayerName, type InputFiles, type RasterProductTypes } from '@map-colonies/raster-shared';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';
import { SpanStatusCode, trace, Tracer } from '@opentelemetry/api';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import { IConfig, ISupportedIngestionSwapTypes, LayerDetails } from '../../common/interfaces';
import { CatalogClient } from '../../serviceClients/catalogClient';
import { GpkgError } from '../../serviceClients/database/errors';
import { JobManagerWrapper } from '../../serviceClients/jobManagerWrapper';
import { MapProxyClient } from '../../serviceClients/mapProxyClient';
import { Checksum } from '../../utils/hash/checksum';
import { LogContext } from '../../utils/logger/logContext';
import { FileNotFoundError, GdalInfoError, UnsupportedEntityError } from '../errors/ingestionErrors';
import type { ResponseId, SourcesValidationResponse } from '../interfaces';
import { InfoDataWithFile } from '../schemas/infoDataSchema';
import type { IngestionNewLayer } from '../schemas/ingestionLayerSchema';
import { layerDetailsSchema } from '../schemas/layerDetailsSchema';
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
    private readonly productManager: ProductManager,
    private readonly checksum: Checksum
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
    activeSpan?.updateName('ingestionManager.validateSources');
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
  public async newLayer(newLayer: IngestionNewLayer): Promise<ResponseId> {
    const logCtx: LogContext = { ...this.logContext, function: this.newLayer.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('ingestionManager.newLayer');

    await this.newLayerValidations(newLayer);
    this.logger.info({ msg: `finished validation of new Layer. all checks have passed`, logContext: logCtx });
    activeSpan?.addEvent('ingestionManager.validateNewLayer.success', { validationSuccess: true });

    const { metadataShapefilePath } = newLayer.inputFiles;
    this.logger.info({ msg: `calucalting checksum for metadata shape zip in path: ${metadataShapefilePath}`, logContext: logCtx });
    const checksum = await this.checksum.calculate(metadataShapefilePath);

    const { id: jobId, taskIds } = await this.jobManagerWrapper.createValidationJob(newLayer, checksum);

    activeSpan
      ?.setStatus({ code: SpanStatusCode.OK })
      .addEvent('ingestionManager.newLayer.success', { triggerSuccess: true, jobId, taskId: taskIds[0] });
    this.logger.info({
      msg: `new ingestion job and validation task were created. jobId: ${jobId}, taskId: ${taskIds[0]}`,
      logContext: logCtx,
    });

    return { jobId, taskIds };
  }

  @withSpanAsyncV4
  public async updateLayer(catalogId: string, updateLayer: IngestionUpdateLayer): Promise<ResponseId> {
    const logCtx: LogContext = { ...this.logContext, function: this.updateLayer.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('ingestionManager.updateLayer');

    const layerDetails = await this.getLayerDetails(catalogId);

    await this.updateLayerValidations(catalogId, layerDetails, updateLayer);
    this.logger.info({ msg: `finished validation of update Layer. all checks have passed`, logContext: logCtx });
    activeSpan?.addEvent('ingestionManager.validateUpdateLayer.success', { validationSuccess: true });

    const { id: jobId, taskIds } = await this.createUpdateJob(catalogId, layerDetails, updateLayer);
    this.logger.info({
      msg: `new update job and validation task were created. jobId: ${jobId}, taskId: ${taskIds[0]} `,
      logContext: logCtx,
    });
    activeSpan
      ?.setStatus({ code: SpanStatusCode.OK })
      .addEvent('ingestionManager.updateLayer.success', { triggerSuccess: true, jobId, taskId: taskIds[0] });

    return { jobId, taskIds };
  }

  @withSpanAsyncV4
  private async createUpdateJob(catalogId: string, layerDetails: LayerDetails, updateLayer: IngestionUpdateLayer): Promise<ICreateJobResponse> {
    const logCtx: LogContext = { ...this.logContext, function: this.createUpdateJob.name };

    const isSwapUpdate = this.supportedIngestionSwapTypes.find((supportedSwapObj) => {
      return supportedSwapObj.productType === layerDetails.productType && supportedSwapObj.productSubType === layerDetails.productSubType;
    });

    const updateJobAction = isSwapUpdate ? this.swapUpdateJobType : this.updateJobType;
    const metadataShapefilePath = join(this.sourceMount, updateLayer.inputFiles.metadataShapefilePath);
    this.logger.info({ msg: `calucalting checksum for metadata shape zip in path: ${metadataShapefilePath}`, logContext: logCtx });
    const checksum = await this.checksum.calculate(metadataShapefilePath);

    return this.jobManagerWrapper.createValidationUpdateJob(layerDetails, catalogId, updateLayer, updateJobAction, checksum);
  }

  @withSpanAsyncV4
  private async updateLayerValidations(catalogId: string, layerDetails: LayerDetails, updateLayer: IngestionUpdateLayer): Promise<LayerDetails> {
    const logCtx: LogContext = { ...this.logContext, function: this.updateLayerValidations.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('ingestionManager.updateLayerValidations');

    const { productId, productVersion, productType, productSubType, tileOutputFormat, displayPath, productName, footprint } = layerDetails;
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
    // validate input files (gpkgs, metadata shp, product shp files)
    await this.validateInputFiles(inputFiles);

    // validate against catalog, mapproxy, job-manager
    const layerName = getMapServingLayerName(productId, productType);
    await this.validateLayerExistsInMapProxy(layerName);
    await this.validateNoParallelJobs(productId, productType);
    this.logger.info({ msg: 'validation in catalog ,job manager and mapproxy passed', logContext: logCtx });
    return { productId, productVersion, productType, productSubType, tileOutputFormat, displayPath, productName, footprint };
  }

  @withSpanAsyncV4
  private async newLayerValidations(newLayer: IngestionNewLayer): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.newLayerValidations.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('ingestionManager.newLayerValidations');

    const { metadata, inputFiles } = newLayer;
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
    await this.validateNoParallelJobs(metadata.productId, metadata.productType);
    this.logger.info({ msg: 'validation in catalog, job-manager and mapproxy passed', logContext: logCtx });
  }

  @withSpanAsyncV4
  private async validateNoParallelJobs(productId: string, productType: RasterProductTypes): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateNoParallelJobs.name };

    const findJobParameters: IFindJobsByCriteriaBody = {
      resourceId: productId,
      productType,
      isCleaned: false,
      shouldReturnTasks: false,
      statuses: [OperationStatus.PENDING, OperationStatus.IN_PROGRESS, OperationStatus.FAILED, OperationStatus.SUSPENDED],
      types: this.forbiddenJobTypes,
    };
    const jobs = await this.jobManagerWrapper.findJobs(findJobParameters);
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
      const message = `Failed to create update job for layer: ${layerName}, layer doesn't exist on MapProxy`;
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
  private async validateLayerDoesntExistInCatalog(productId: string, productType: RasterProductTypes): Promise<void> {
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
    const productGeometry = await this.productManager.extractAndRead(productShapefilePath);
    await this.geoValidator.validate(infoData, productGeometry);
    this.logger.debug({ msg: 'validated geometries', logContext: logCtx });
  }

  @withSpanAsyncV4
  private async getLayerDetails(catalogId: string): Promise<LayerDetails> {
    const layersDetails = await this.catalogClient.findById(catalogId);
    const getLayerSpan = trace.getActiveSpan();
    if (layersDetails.length === 0) {
      const message = `there isn't a layer with id of ${catalogId}`;
      const error = new NotFoundError(message);
      getLayerSpan?.setAttribute('exception.type', error.status);
      throw error;
    } else if (layersDetails.length !== 1) {
      const message = `found more than one layer with id of ${catalogId}, please check the catalog layers`;
      const error = new ConflictError(message);
      getLayerSpan?.setAttribute('exception.type', error.status);
      throw error;
    }

    const layerDetails = layerDetailsSchema.parse(layersDetails[0].metadata);
    return layerDetails;
  }
}
