import { join, relative } from 'node:path';
import { ConflictError, NotFoundError } from '@map-colonies/error-types';
import { Logger } from '@map-colonies/js-logger';
import { IFindJobsByCriteriaBody, OperationStatus, type ICreateJobBody } from '@map-colonies/mc-priority-queue';
import {
  getMapServingLayerName,
  type IngestionNewJobParams,
  type IngestionSwapUpdateJobParams,
  type IngestionUpdateJobParams,
  type InputFiles,
  type RasterProductTypes,
} from '@map-colonies/raster-shared';
import { withSpanAsyncV4, withSpanV4 } from '@map-colonies/telemetry';
import { SpanStatusCode, trace, Tracer } from '@opentelemetry/api';
import { container, inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import { IConfig, ISupportedIngestionSwapTypes } from '../../common/interfaces';
import { GdalInfoManager } from '../../info/models/gdalInfoManager';
import { CatalogClient } from '../../serviceClients/catalogClient';
import { GpkgError } from '../../serviceClients/database/errors';
import { JobManagerWrapper } from '../../serviceClients/jobManagerWrapper';
import { MapProxyClient } from '../../serviceClients/mapProxyClient';
import { Checksum } from '../../utils/hash/checksum';
import { Checksum as IChecksum } from '../../utils/hash/interface';
import { LogContext } from '../../utils/logger/logContext';
import { getShapefileFiles } from '../../utils/shapefile';
import { ChecksumError, FileNotFoundError, GdalInfoError, UnsupportedEntityError } from '../errors/ingestionErrors';
import { type GpkgInputFiles, type ResponseId, type SourcesValidationResponse, type ValidationTaskParameters } from '../interfaces';
import { InfoDataWithFile } from '../schemas/infoDataSchema';
import type { IngestionNewLayer } from '../schemas/ingestionLayerSchema';
import type { RasterLayerMetadata } from '../schemas/layerCatalogSchema';
import type { IngestionUpdateLayer } from '../schemas/updateLayerSchema';
import { GeoValidator } from '../validators/geoValidator';
import { SourceValidator } from '../validators/sourceValidator';
import { ProductManager } from './productManager';

@injectable()
export class IngestionManager {
  private readonly logContext: LogContext;
  private readonly jobDomain: string;
  private readonly ingestionNewJobType: string;
  private readonly forbiddenJobTypes: string[];
  private readonly supportedIngestionSwapTypes: ISupportedIngestionSwapTypes[];
  private readonly updateJobType: string;
  private readonly swapUpdateJobType: string;
  private readonly validationTaskType: string;
  private readonly sourceMount: string;
  private readonly jobTrackerServiceUrl: string;

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
    this.jobDomain = config.get<string>('jobManager.jobDomain');
    this.ingestionNewJobType = config.get<string>('jobManager.ingestionNewJobType');
    this.forbiddenJobTypes = config.get<string[]>('jobManager.forbiddenJobTypesForParallelIngestion');
    this.supportedIngestionSwapTypes = config.get<ISupportedIngestionSwapTypes[]>('jobManager.supportedIngestionSwapTypes');
    this.updateJobType = config.get<string>('jobManager.ingestionUpdateJobType');
    this.swapUpdateJobType = config.get<string>('jobManager.ingestionSwapUpdateJobType');
    this.validationTaskType = config.get<string>('jobManager.validationTaskType');
    this.sourceMount = config.get<string>('storageExplorer.layerSourceDir');
    this.jobTrackerServiceUrl = config.get<string>('services.jobTrackerServiceURL');
  }

  @withSpanAsyncV4
  public async getGpkgsInfo(gpkgInputFiles: GpkgInputFiles): Promise<InfoDataWithFile[]> {
    const logCtx: LogContext = { ...this.logContext, function: this.getGpkgsInfo.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('ingestionManager.getGpkgsInfo');
    const { gpkgFilesPath } = gpkgInputFiles;
    this.logger.info({ msg: 'getting gdal info for files', logContext: logCtx, metadata: { gpkgFilesPath } });

    await this.sourceValidator.validateFilesExist(gpkgFilesPath);
    this.logger.debug({ msg: 'Files exist validation passed', logContext: logCtx, metadata: { gpkgFilesPath } });

    const filesGdalInfoData = await this.gdalInfoManager.getInfoData(gpkgFilesPath);
    activeSpan?.setStatus({ code: SpanStatusCode.OK }).addEvent('getGpkgsInfo.get.ok');
    return filesGdalInfoData;
  }

  @withSpanAsyncV4
  public async validateGpkgs(gpkgInputFiles: GpkgInputFiles): Promise<SourcesValidationResponse> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateGpkgs.name };
    const { gpkgFilesPath } = gpkgInputFiles;
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('ingestionManager.validateGpkgs');
    try {
      this.logger.info({ msg: 'Starting gpkgs validation process', logContext: logCtx, metadata: { gpkgFilesPath } });
      await this.sourceValidator.validateFilesExist(gpkgFilesPath);

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

    const newLayerLocal = {
      ...newLayer,
      ...this.getAbsolutePathInputFiles(newLayer),
    };

    await this.newLayerValidations(newLayerLocal);
    this.logger.info({ msg: `finished validation of new Layer. all checks have passed`, logContext: logCtx });
    activeSpan?.addEvent('ingestionManager.validateNewLayer.success', { validationSuccess: true });

    const createJobRequest = await this.newLayerJobPayload(newLayerLocal);
    const { id: jobId, taskIds } = await this.jobManagerWrapper.createIngestionJob(createJobRequest);
    const taskId = taskIds[0];

    this.logger.info({
      msg: `new ingestion job and validation task were created. jobId: ${jobId}, taskId: ${taskId}`,
      logContext: logCtx,
    });
    activeSpan?.setStatus({ code: SpanStatusCode.OK }).addEvent('ingestionManager.newLayer.success', { triggerSuccess: true, jobId, taskId });

    return { jobId, taskId };
  }

  @withSpanAsyncV4
  public async updateLayer(catalogId: string, updateLayer: IngestionUpdateLayer): Promise<ResponseId> {
    const logCtx: LogContext = { ...this.logContext, function: this.updateLayer.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('ingestionManager.updateLayer');

    const rasterLayerMetadata = await this.getLayerMetadata(catalogId);

    const updateLayerLocal = {
      ...updateLayer,
      ...this.getAbsolutePathInputFiles(updateLayer),
    };

    await this.updateLayerValidations(rasterLayerMetadata, updateLayerLocal);
    this.logger.info({ msg: `finished validation of update Layer. all checks have passed`, logContext: logCtx });
    activeSpan?.addEvent('ingestionManager.validateUpdateLayer.success', { validationSuccess: true });

    const createJobRequest = await this.updateLayerJobPayload(rasterLayerMetadata, updateLayerLocal);
    const { id: jobId, taskIds } = await this.jobManagerWrapper.createIngestionJob(createJobRequest);
    const taskId = taskIds[0];

    this.logger.info({
      msg: `new update job and validation task were created. jobId: ${jobId}, taskId: ${taskId} `,
      logContext: logCtx,
    });
    activeSpan?.setStatus({ code: SpanStatusCode.OK }).addEvent('ingestionManager.updateLayer.success', { triggerSuccess: true, jobId, taskId });

    return { jobId, taskId };
  }

  @withSpanAsyncV4
  private async updateLayerValidations(rasterLayerMetadata: RasterLayerMetadata, updateLayer: IngestionUpdateLayer): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.updateLayerValidations.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('ingestionManager.updateLayerValidations');

    const { id, productId, productType } = rasterLayerMetadata;
    const { metadata, inputFiles } = updateLayer;
    this.logger.debug({
      msg: 'started update layer validation',
      catalogId: id,
      requestBody: { metadata, inputFiles },
      logCtx: logCtx,
    });
    this.logger.info({
      catalogId: id,
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
    const isValidSources: SourcesValidationResponse = await this.validateGpkgs(inputFiles);
    if (!isValidSources.isValid) {
      const errorMessage = isValidSources.message;
      this.logger.error({ msg: errorMessage, logContext: logCtx, inputFiles });
      const error = new UnsupportedEntityError(isValidSources.message);
      throw error;
    }
    this.logger.debug({ msg: 'validated sources', logContext: logCtx });

    // validate new ingestion product.shp against gpkg data extent
    const infoData = await this.getGpkgsInfo(inputFiles);
    const productGeometry = await this.productManager.read(productShapefilePath);
    this.geoValidator.validate(infoData, productGeometry);
    this.logger.debug({ msg: 'validated geometries', logContext: logCtx });
  }

  @withSpanAsyncV4
  private async getLayerMetadata(catalogId: string): Promise<RasterLayerMetadata> {
    const rasterLayersCatalog = await this.catalogClient.findById(catalogId);

    const getLayerSpan = trace.getActiveSpan();
    if (rasterLayersCatalog.length === 0) {
      const message = `there isn't a layer with id of ${catalogId}`;
      const error = new NotFoundError(message);
      getLayerSpan?.setAttribute('exception.type', error.status);
      throw error;
    } else if (rasterLayersCatalog.length !== 1) {
      const message = `found more than one layer with id of ${catalogId}, please check the catalog layers`;
      const error = new ConflictError(message);
      getLayerSpan?.setAttribute('exception.type', error.status);
      throw error;
    }

    return rasterLayersCatalog[0].metadata;
  }

  @withSpanAsyncV4
  private async newLayerJobPayload(newLayer: IngestionNewLayer): Promise<ICreateJobBody<IngestionNewJobParams, ValidationTaskParameters>> {
    const checksums = await this.getFilesChecksum(newLayer.inputFiles.metadataShapefilePath);
    const taskParameters = { checksums };

    const newLayerRelative = {
      ...newLayer,
      ...this.getRelativePathInputFiles(newLayer),
    };

    const ingestionNewJobParams = {
      ...newLayerRelative,
      additionalParams: { jobTrackerServiceURL: this.jobTrackerServiceUrl },
    };
    const initialProductVersion = '1.0';
    const createJobRequest = {
      resourceId: newLayerRelative.metadata.productId,
      version: initialProductVersion,
      type: this.ingestionNewJobType,
      status: OperationStatus.PENDING,
      parameters: ingestionNewJobParams,
      productName: newLayerRelative.metadata.productName,
      productType: newLayerRelative.metadata.productType,
      domain: this.jobDomain,
      tasks: [{ type: this.validationTaskType, parameters: taskParameters }],
    };
    return createJobRequest;
  }

  @withSpanAsyncV4
  private async updateLayerJobPayload(
    rasterLayerMetadata: RasterLayerMetadata,
    updateLayer: IngestionUpdateLayer
  ): Promise<ICreateJobBody<IngestionUpdateJobParams | IngestionSwapUpdateJobParams, ValidationTaskParameters>> {
    const { displayPath, id, productId, productType, productVersion, tileOutputFormat, productName, productSubType } = rasterLayerMetadata;
    const isSwapUpdate = this.supportedIngestionSwapTypes.find((supportedSwapObj) => {
      return supportedSwapObj.productType === productType && supportedSwapObj.productSubType === productSubType;
    });
    const updateJobAction = isSwapUpdate ? this.swapUpdateJobType : this.updateJobType;

    const checksums = await this.getFilesChecksum(updateLayer.inputFiles.metadataShapefilePath);
    const taskParameters = { checksums };

    const updateLayerRelative = {
      ...updateLayer,
      ...this.getRelativePathInputFiles(updateLayer),
    };

    const ingestionUpdateJobParams = {
      ...updateLayerRelative,
      additionalParams: {
        tileOutputFormat,
        jobTrackerServiceURL: this.jobTrackerServiceUrl,
        ...(updateJobAction === this.updateJobType && { displayPath }),
      },
    };
    const createJobRequest = {
      resourceId: productId,
      version: (parseFloat(productVersion) + 1).toFixed(1),
      internalId: id,
      type: updateJobAction,
      productName,
      productType,
      status: OperationStatus.PENDING,
      parameters: ingestionUpdateJobParams,
      domain: this.jobDomain,
      tasks: [{ type: this.validationTaskType, parameters: taskParameters }],
    };
    return createJobRequest;
  }

  @withSpanAsyncV4
  private async getFilesChecksum(shapefilePath: string): Promise<IChecksum[]> {
    const checksums = await Promise.all(getShapefileFiles(shapefilePath).map(async (fileName) => this.getFileChecksum(fileName)));
    return checksums;
  }

  @withSpanAsyncV4
  private async getFileChecksum(filePath: string): Promise<IChecksum> {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('ingestionManager.getFileChecksum');
    const logCtx: LogContext = { ...this.logContext, function: this.getFileChecksum.name };

    this.logger.info({ msg: `calucalting checksum for: ${filePath}`, logContext: logCtx });

    try {
      const checksum = container.resolve<Checksum>(Checksum);
      return await checksum.calculate(filePath);
    } catch (err) {
      const processingError = err instanceof ChecksumError ? err.message : 'Unknown error';
      activeSpan?.addEvent('ingestionManager.getFileChecksum.invalid', { processingError });
      throw err;
    }
  }

  @withSpanV4
  private getAbsolutePathInputFiles({ inputFiles }: Pick<IngestionNewLayer, 'inputFiles'>): Pick<IngestionNewLayer, 'inputFiles'> {
    return {
      inputFiles: {
        gpkgFilesPath: inputFiles.gpkgFilesPath.map((gpkgFilePath) => join(this.sourceMount, gpkgFilePath)),
        metadataShapefilePath: join(this.sourceMount, inputFiles.metadataShapefilePath),
        productShapefilePath: join(this.sourceMount, inputFiles.productShapefilePath),
      },
    };
  }

  @withSpanV4
  private getRelativePathInputFiles({ inputFiles }: Pick<IngestionNewLayer, 'inputFiles'>): Pick<IngestionNewLayer, 'inputFiles'> {
    return {
      inputFiles: {
        gpkgFilesPath: inputFiles.gpkgFilesPath.map((gpkgFilePath) => relative(this.sourceMount, gpkgFilePath)),
        metadataShapefilePath: relative(this.sourceMount, inputFiles.metadataShapefilePath),
        productShapefilePath: relative(this.sourceMount, inputFiles.productShapefilePath),
      },
    };
  }
}
