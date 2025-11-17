import { join } from 'node:path';
import { BadRequestError, ConflictError, NotFoundError } from '@map-colonies/error-types';
import { Logger } from '@map-colonies/js-logger';
import { IFindJobsByCriteriaBody, IUpdateTaskBody, OperationStatus, type ICreateJobBody, type ITaskResponse } from '@map-colonies/mc-priority-queue';
import {
  getMapServingLayerName,
  type IngestionNewJobParams,
  type IngestionSwapUpdateJobParams,
  type IngestionUpdateJobParams,
  type InputFiles,
  type RasterProductTypes,
  type ingestionBaseJobParamsSchema,
} from '@map-colonies/raster-shared';
import { withSpanAsyncV4, withSpanV4 } from '@map-colonies/telemetry';
import { SpanStatusCode, trace, Tracer } from '@opentelemetry/api';
import { container, inject, injectable } from 'tsyringe';
import z from 'zod';
import { SERVICES } from '../../common/constants';
import { IConfig, ISupportedIngestionSwapTypes, LogContext } from '../../common/interfaces';
import { InfoManager } from '../../info/models/infoManager';
import { CatalogClient } from '../../serviceClients/catalogClient';
import { JobManagerWrapper } from '../../serviceClients/jobManagerWrapper';
import { MapProxyClient } from '../../serviceClients/mapProxyClient';
import { Checksum } from '../../utils/hash/checksum';
import { Checksum as IChecksum } from '../../utils/hash/interfaces';
import { getAbsolutePathInputFiles } from '../../utils/paths';
import { getShapefileFiles } from '../../utils/shapefile';
import { ValidateManager } from '../../validate/models/validateManager';
import { ChecksumError } from '../errors/ingestionErrors';
import type { ResponseId, ValidationTaskParameters } from '../interfaces';
import type { RasterLayerMetadata } from '../schemas/layerCatalogSchema';
import type { IngestionNewLayer } from '../schemas/newLayerSchema';
import type { IngestionUpdateLayer } from '../schemas/updateLayerSchema';
import { GeoValidator } from '../validators/geoValidator';
import { SourceValidator } from '../validators/sourceValidator';
import { ProductManager } from './productManager';

type ReplaceValuesOfKey<T extends Record<PropertyKey, unknown>, Key extends keyof T, Value> = {
  [K in keyof T]: K extends Key ? Value : T[K];
};
type MapToRelativeAndAbsolute<T extends Record<PropertyKey, unknown>> = {
  [K in keyof T]: T[K] extends unknown[] ? { relative: T[K][number]; absolute: T[K][number] }[] : { relative: T[K]; absolute: T[K] };
};
type InputFilesPaths = MapToRelativeAndAbsolute<InputFiles>;
type EnhancedIngestionNewLayer = ReplaceValuesOfKey<IngestionNewLayer, 'inputFiles', InputFilesPaths>;
type EnhancedIngestionUpdateLayer = ReplaceValuesOfKey<IngestionUpdateLayer, 'inputFiles', InputFilesPaths>;

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
    private readonly validateManager: ValidateManager,
    private readonly sourceValidator: SourceValidator,
    private readonly infoManager: InfoManager,
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
  public async newLayer(newLayer: IngestionNewLayer): Promise<ResponseId> {
    const logCtx: LogContext = { ...this.logContext, function: this.newLayer.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('ingestionManager.newLayer');

    const absoluteInputFilesPath = getAbsolutePathInputFiles({ inputFiles: newLayer.inputFiles, sourceMount: this.sourceMount });
    const newLayerLocal: EnhancedIngestionNewLayer = {
      ...newLayer,
      inputFiles: {
        gpkgFilesPath: newLayer.inputFiles.gpkgFilesPath.map((gpkgFilePath, index) => {
          return {
            absolute: absoluteInputFilesPath.inputFiles.gpkgFilesPath[index],
            relative: gpkgFilePath,
          };
        }),
        metadataShapefilePath: {
          absolute: absoluteInputFilesPath.inputFiles.metadataShapefilePath,
          relative: newLayer.inputFiles.metadataShapefilePath,
        },
        productShapefilePath: {
          absolute: absoluteInputFilesPath.inputFiles.productShapefilePath,
          relative: newLayer.inputFiles.productShapefilePath,
        },
      },
    };

    await this.newLayerValidations(newLayerLocal);
    this.logger.info({ msg: `finished validation of new layer. all checks have passed`, logContext: logCtx });
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

    const absoluteInputFilesPath = getAbsolutePathInputFiles({ inputFiles: updateLayer.inputFiles, sourceMount: this.sourceMount });
    const updateLayerLocal = {
      ...updateLayer,
      inputFiles: {
        gpkgFilesPath: updateLayer.inputFiles.gpkgFilesPath.map((gpkgFilePath, index) => {
          return {
            absolute: absoluteInputFilesPath.inputFiles.gpkgFilesPath[index],
            relative: gpkgFilePath,
          };
        }),
        metadataShapefilePath: {
          absolute: absoluteInputFilesPath.inputFiles.metadataShapefilePath,
          relative: updateLayer.inputFiles.metadataShapefilePath,
        },
        productShapefilePath: {
          absolute: absoluteInputFilesPath.inputFiles.productShapefilePath,
          relative: updateLayer.inputFiles.productShapefilePath,
        },
      },
    };

    await this.updateLayerValidations(rasterLayerMetadata, updateLayerLocal);
    this.logger.info({ msg: `finished validation of update layer. all checks have passed`, logContext: logCtx });
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
  public async retryLayer(jobId: string): Promise<ResponseId> {
    const logCtx: LogContext = { ...this.logContext, function: this.retryLayer.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('ingestionManager.retryLayer');

    this.logger.info({ msg: 'starting retry layer process', logContext: logCtx, jobId });

    const retryJob = await this.jobManagerWrapper.getJob<z.infer<typeof ingestionBaseJobParamsSchema>, unknown>(jobId);
    this.validateRetryJobStatus(jobId, retryJob.status, logCtx);

    const validationTask = await this.getValidationTask(jobId, logCtx);

    switch (validationTask.parameters.isValid) {
      case false:
        return this.handleRetryWithErrors(jobId, retryJob, validationTask, logCtx);
      case true:
        return this.handleRetryWithoutErrors(jobId, validationTask.id, logCtx);
      default: {
        const msg = 'Cannot retry job because validation task status is unclear';
        this.logger.error({ msg, logContext: logCtx, jobId, taskId: validationTask.id });
        const error = new BadRequestError(msg);
        trace.getActiveSpan()?.setAttribute('exception.type', error.status);
        throw error;
      }
    }
  }

  @withSpanV4
  private validateRetryJobStatus(jobId: string, status: OperationStatus, logCtx: LogContext): void {
    const validStatuses = [OperationStatus.FAILED, OperationStatus.COMPLETED];
    if (!validStatuses.includes(status)) {
      const message = `Cannot retry job with id: ${jobId} because its status is: ${status}. Expected status: ${validStatuses.join(' or ')}`;
      this.logger.error({ msg: message, logContext: logCtx, jobId, currentStatus: status, validStatuses });
      const error = new BadRequestError(message);
      trace.getActiveSpan()?.setAttribute('exception.type', error.status);
      throw error;
    }
  }

  @withSpanAsyncV4
  private async getValidationTask(jobId: string, logCtx: LogContext): Promise<ITaskResponse<ValidationTaskParameters>> {
    const tasks = await this.jobManagerWrapper.getTasksForJob<ValidationTaskParameters>(jobId);

    const validationTask = tasks.find((task) => task.type === this.validationTaskType);

    if (!validationTask) {
      const message = `Cannot retry job with id: ${jobId} because no validation task was found`;
      this.logger.error({ msg: message, logContext: logCtx, jobId, taskTypes: tasks.map((t) => t.type) });
      const error = new NotFoundError(message);
      trace.getActiveSpan()?.setAttribute('exception.type', error.status);
      throw error;
    }

    return validationTask;
  }

  @withSpanAsyncV4
  private async handleRetryWithoutErrors(jobId: string, taskId: string, logCtx: LogContext): Promise<ResponseId> {
    this.logger.info({ msg: 'validation completed without errors, resetting job', logContext: logCtx, jobId, taskId });
    await this.jobManagerWrapper.resetJob(jobId);
    trace.getActiveSpan()?.setStatus({ code: SpanStatusCode.OK }).addEvent('ingestionManager.retryLayer.success', { retryType: 'reset', jobId });
    this.logger.info({ msg: 'job reset successfully', logContext: logCtx, jobId, taskId });
    return { jobId, taskId };
  }

  @withSpanAsyncV4
  private async handleRetryWithErrors(
    jobId: string,
    retryJob: { parameters: z.infer<typeof ingestionBaseJobParamsSchema> },
    validationTask: ITaskResponse<ValidationTaskParameters>,
    logCtx: LogContext
  ): Promise<ResponseId> {
    this.logger.info({ msg: 'validation has errors, checking for shapefile changes', logContext: logCtx, jobId, taskId: validationTask.id });

    const metadataShapefilePath = retryJob.parameters.inputFiles.metadataShapefilePath;
    if (!metadataShapefilePath) {
      const message = `Cannot retry job with id: ${jobId} because metadata shapefile path is missing from job parameters`;
      this.logger.error({ msg: message, logContext: logCtx, jobId });
      const error = new BadRequestError(message);
      trace.getActiveSpan()?.setAttribute('exception.type', error.status);
      throw error;
    }

    const absoluteMetadataPath = join(this.sourceMount, metadataShapefilePath);
    const newChecksums = await this.getFilesChecksum(absoluteMetadataPath);

    this.validateShapefileChanges(jobId, validationTask, newChecksums, logCtx);

    const newTaskParameters: IUpdateTaskBody<ValidationTaskParameters> = {
      parameters: { ...validationTask.parameters, checksums: [...validationTask.parameters.checksums, ...newChecksums] },
    };

    await this.jobManagerWrapper.updateTask<ValidationTaskParameters>(validationTask.jobId, validationTask.id, newTaskParameters);
    trace
      .getActiveSpan()
      ?.setStatus({ code: SpanStatusCode.OK })
      .addEvent('ingestionManager.retryLayer.success', { retryType: 'withChanges', jobId });
    this.logger.info({ msg: 'retry layer completed successfully', logContext: logCtx, jobId, taskId: validationTask.id });
    return { jobId, taskId: validationTask.id };
  }

  @withSpanV4
  private validateShapefileChanges(
    jobId: string,
    validationTask: ITaskResponse<ValidationTaskParameters>,
    newChecksums: IChecksum[],
    logCtx: LogContext
  ): void {
    const existingChecksums = validationTask.parameters.checksums;
    const allChecksumsExist = newChecksums.every((newChecksum) =>
      existingChecksums.some(
        (existingChecksum: IChecksum) => existingChecksum.checksum === newChecksum.checksum && existingChecksum.fileName === newChecksum.fileName
      )
    );

    if (allChecksumsExist) {
      const message = `Cannot retry job with id: ${jobId} because the shapefile has not changed`;
      this.logger.error({ msg: message, logContext: logCtx, jobId, taskId: validationTask.id });
      const error = new ConflictError(message);
      trace.getActiveSpan()?.setAttribute('exception.type', error.status);
      throw error;
    }

    this.logger.info({ msg: 'shapefile has changed, updating validation task parameters', logContext: logCtx, jobId, taskId: validationTask.id });
  }

  @withSpanAsyncV4
  private async updateLayerValidations(rasterLayerMetadata: RasterLayerMetadata, updateLayer: EnhancedIngestionUpdateLayer): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.updateLayerValidations.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('ingestionManager.updateLayerValidations');

    const { id, productId, productType } = rasterLayerMetadata;
    const { metadata, inputFiles } = updateLayer;
    const absoluteInputFilesPaths = this.getAbsoluteInputFilesPaths(inputFiles);

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
    await this.validateInputFiles(absoluteInputFilesPaths);

    // validate against catalog, mapproxy, job-manager
    const layerName = getMapServingLayerName(productId, productType);
    await this.validateLayerExistsInMapProxy(layerName);
    await this.validateNoParallelJobs(productId, productType);
    this.logger.info({ msg: 'validation in catalog ,job manager and mapproxy passed', logContext: logCtx });
  }

  @withSpanAsyncV4
  private async newLayerValidations(newLayer: EnhancedIngestionNewLayer): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.newLayerValidations.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('ingestionManager.newLayerValidations');
    const { metadata, inputFiles } = newLayer;
    const absoluteInputFilesPaths = this.getAbsoluteInputFilesPaths(inputFiles);

    this.logger.debug({ msg: 'started new layer validation', requestBody: { metadata, inputFiles }, logCtx: logCtx });
    this.logger.info({
      productId: metadata.productId,
      productType: metadata.productType,
      productName: metadata.productName,
      msg: 'started validation on new layer request',
      logCtx: logCtx,
    });
    // validate input files (gpkgs, metadata shp, product shp files)
    await this.validateInputFiles(absoluteInputFilesPaths);

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

    const shapefiles = [...getShapefileFiles(inputFiles.metadataShapefilePath), ...getShapefileFiles(inputFiles.productShapefilePath)];
    // validate shapefiles exist
    await this.validateManager.validateShapefiles(shapefiles);
    this.logger.debug({ msg: 'validated shapefiles', logContext: logCtx });

    // validate files exist, gdal info and GPKG data
    await this.validateManager.validateGpkgsSources({ gpkgFilesPath: inputFiles.gpkgFilesPath });
    this.logger.debug({ msg: 'validated gpkgs', logContext: logCtx });

    // validate new ingestion product.shp against gpkg data extent
    const infoData = await this.infoManager.getGpkgsInformation(inputFiles);
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
  private async newLayerJobPayload(newLayer: EnhancedIngestionNewLayer): Promise<ICreateJobBody<IngestionNewJobParams, ValidationTaskParameters>> {
    const checksums = await this.getFilesChecksum(newLayer.inputFiles.metadataShapefilePath.absolute);
    const taskParameters: ValidationTaskParameters = { checksums };

    const newLayerRelative = {
      ...newLayer,
      ...{
        inputFiles: {
          metadataShapefilePath: newLayer.inputFiles.metadataShapefilePath.relative,
          productShapefilePath: newLayer.inputFiles.productShapefilePath.relative,
          gpkgFilesPath: newLayer.inputFiles.gpkgFilesPath.map((gpkgFilePath) => gpkgFilePath.relative),
        },
      },
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
    updateLayer: EnhancedIngestionUpdateLayer
  ): Promise<ICreateJobBody<IngestionUpdateJobParams | IngestionSwapUpdateJobParams, ValidationTaskParameters>> {
    const { displayPath, id, productId, productType, productVersion, tileOutputFormat, productName, productSubType } = rasterLayerMetadata;
    const isSwapUpdate = this.supportedIngestionSwapTypes.find((supportedSwapObj) => {
      return supportedSwapObj.productType === productType && supportedSwapObj.productSubType === productSubType;
    });
    const updateJobAction = isSwapUpdate ? this.swapUpdateJobType : this.updateJobType;

    const checksums = await this.getFilesChecksum(updateLayer.inputFiles.metadataShapefilePath.absolute);
    const taskParameters: ValidationTaskParameters = { checksums };

    const updateLayerRelative = {
      ...updateLayer,
      ...{
        inputFiles: {
          metadataShapefilePath: updateLayer.inputFiles.metadataShapefilePath.relative,
          productShapefilePath: updateLayer.inputFiles.productShapefilePath.relative,
          gpkgFilesPath: updateLayer.inputFiles.gpkgFilesPath.map((gpkgFilePath) => gpkgFilePath.relative),
        },
      },
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
      // eslint-disable-next-line @typescript-eslint/await-thenable
      const checksum = container.resolve(Checksum);
      return await checksum.calculate(filePath);
    } catch (err) {
      const processingError = err instanceof ChecksumError ? err.message : 'Unknown error';
      activeSpan?.addEvent('ingestionManager.getFileChecksum.invalid', { processingError });
      throw err;
    }
  }

  @withSpanV4
  private getAbsoluteInputFilesPaths(inputFiles: InputFilesPaths): InputFiles {
    return {
      gpkgFilesPath: inputFiles.gpkgFilesPath.map((gpkgFilePath) => gpkgFilePath.absolute),
      metadataShapefilePath: inputFiles.metadataShapefilePath.absolute,
      productShapefilePath: inputFiles.productShapefilePath.absolute,
    };
  }
}
