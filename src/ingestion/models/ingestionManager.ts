import { relative } from 'node:path';
import { ConflictError, NotFoundError } from '@map-colonies/error-types';
import { Logger } from '@map-colonies/js-logger';
import {
  IFindJobsByCriteriaBody,
  IJobResponse,
  IUpdateTaskBody,
  OperationStatus,
  type ICreateJobBody,
  type ITaskResponse,
} from '@map-colonies/mc-priority-queue';
import {
  getMapServingLayerName,
  inputFilesSchema,
  rasterProductTypeSchema,
  resourceIdSchema,
  ingestionValidationTaskParamsSchema,
  type Checksum as IChecksum,
  type FileMetadata,
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
import { IConfig, ISupportedIngestionSwapTypes, LogContext } from '../../common/interfaces';
import { InfoManager } from '../../info/models/infoManager';
import { CatalogClient } from '../../serviceClients/catalogClient';
import { JobManagerWrapper } from '../../serviceClients/jobManagerWrapper';
import { MapProxyClient } from '../../serviceClients/mapProxyClient';
import { Checksum } from '../../utils/hash/checksum';
import { getAbsolutePathInputFiles } from '../../utils/paths';
import { getShapefileFiles } from '../../utils/shapefile';
import { ZodValidator } from '../../utils/validation/zodValidator';
import { ValidateManager } from '../../validate/models/validateManager';
import { ChecksumError, throwInvalidJobStatusError } from '../errors/ingestionErrors';
import type { BaseValidationTaskParams, ChecksumValidationParameters, IngestionBaseJobParams, ResponseId } from '../interfaces';
import type { RasterLayerMetadata } from '../schemas/layerCatalogSchema';
import type { IngestionNewLayer } from '../schemas/newLayerSchema';
import type { IngestionUpdateLayer } from '../schemas/updateLayerSchema';
import { GeoValidator } from '../validators/geoValidator';
import { SourceValidator } from '../validators/sourceValidator';
import { PolygonPartsManagerClient } from '../../serviceClients/polygonPartsManagerClient';
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
    private readonly polygonPartsManagerClient: PolygonPartsManagerClient,
    private readonly infoManager: InfoManager,
    private readonly geoValidator: GeoValidator,
    private readonly catalogClient: CatalogClient,
    private readonly jobManagerWrapper: JobManagerWrapper,
    private readonly mapProxyClient: MapProxyClient,
    private readonly productManager: ProductManager,
    private readonly zodValidator: ZodValidator
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
    this.logger.info({ msg: `finished validation of new layer, all checks passed`, logContext: logCtx });
    activeSpan?.addEvent('ingestionManager.validateNewLayer.success', { validationSuccess: true });

    const createJobRequest = await this.newLayerJobPayload(newLayerLocal);
    const { id: jobId, taskIds } = await this.jobManagerWrapper.createIngestionJob(createJobRequest);
    const taskId = taskIds[0];

    this.logger.info({
      msg: `new ingestion job and validation task created successfully`,
      logContext: logCtx,
      jobId,
      taskId,
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
    this.logger.info({ msg: `finished validation of update layer, all checks passed`, logContext: logCtx });
    activeSpan?.addEvent('ingestionManager.updateLayerValidations.success', { validationSuccess: true });

    const createJobRequest = await this.updateLayerJobPayload(rasterLayerMetadata, updateLayerLocal);
    const { id: jobId, taskIds } = await this.jobManagerWrapper.createIngestionJob(createJobRequest);
    const taskId = taskIds[0];

    this.logger.info({
      msg: `update job and validation task created successfully`,
      logContext: logCtx,
      jobId,
      taskId,
    });
    activeSpan?.setStatus({ code: SpanStatusCode.OK }).addEvent('ingestionManager.updateLayer.success', { triggerSuccess: true, jobId, taskId });

    return { jobId, taskId };
  }

  @withSpanAsyncV4
  public async retryIngestion(jobId: string): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.retryIngestion.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('ingestionManager.retryIngestion');

    this.logger.info({ msg: 'starting retry ingestion process', logContext: logCtx, jobId });

    const retryJob: IJobResponse<IngestionBaseJobParams, unknown> = await this.jobManagerWrapper.getJob<IngestionBaseJobParams, unknown>(jobId);

    if (!this.isJobRetryable(retryJob.status)) {
      throwInvalidJobStatusError(jobId, retryJob.status, this.logger, activeSpan);
    }

    const validationTask: ITaskResponse<BaseValidationTaskParams> = await this.getValidationTask(jobId, logCtx);
    const { resourceId, productType } = this.parseAndValidateJobIdentifiers(retryJob.resourceId, retryJob.productType);
    await this.zodValidator.validate(ingestionValidationTaskParamsSchema, validationTask.parameters);
    await this.polygonPartsManagerClient.deleteValidationEntity(resourceId, productType);

    if (validationTask.parameters.isValid === true) {
      await this.softReset(jobId, logCtx);
    } else {
      const shouldConsiderChecksumChanges = validationTask.status === OperationStatus.COMPLETED;
      await this.hardReset(retryJob, validationTask, shouldConsiderChecksumChanges, logCtx);
    }
  }

  @withSpanV4
  private parseAndValidateJobIdentifiers(
    resourceId: string | undefined,
    productType: string | undefined
  ): { resourceId: string; productType: RasterProductTypes } {
    const parsedResourceId = resourceIdSchema.parse(resourceId);
    const parsedProductType = rasterProductTypeSchema.parse(productType);
    return { resourceId: parsedResourceId, productType: parsedProductType };
  }

  @withSpanAsyncV4
  private async getValidationTask(jobId: string, logCtx: LogContext): Promise<ITaskResponse<BaseValidationTaskParams>> {
    const tasks = await this.jobManagerWrapper.getTasksForJob<BaseValidationTaskParams>(jobId);

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
  private async softReset(jobId: string, logCtx: LogContext): Promise<void> {
    this.logger.info({ msg: 'performing soft reset: validation passed, resetting job via jobManager API', logContext: logCtx, jobId });
    await this.jobManagerWrapper.resetJob(jobId);
    trace.getActiveSpan()?.setStatus({ code: SpanStatusCode.OK }).addEvent('ingestionManager.softReset.success', { retryType: 'softReset', jobId });
    this.logger.info({ msg: 'soft reset completed successfully', logContext: logCtx, jobId });
  }

  @withSpanAsyncV4
  private async hardReset(
    retryJob: IJobResponse<IngestionBaseJobParams, unknown>,
    validationTask: ITaskResponse<BaseValidationTaskParams>,
    shouldConsiderChecksumChanges: boolean,
    logCtx: LogContext
  ): Promise<void> {
    this.logger.info({
      msg: 'performing hard reset: validation has errors, checking for shapefile changes',
      logContext: logCtx,
      jobId: retryJob.id,
      taskId: validationTask.id,
      shouldConsiderChecksumChanges,
    });

    const absoluteInputFilesPaths = await this.validateAndGetAbsoluteInputFiles(retryJob.parameters.inputFiles);
    const { metadataShapefilePath } = absoluteInputFilesPaths;

    const newChecksums = await this.getFilesChecksum(metadataShapefilePath);

    let updatedChecksums = validationTask.parameters.checksums;

    if (shouldConsiderChecksumChanges) {
      if (!this.isChecksumChanged(validationTask.parameters.checksums, newChecksums)) {
        const message = `job id: ${retryJob.id} could not be retried, due to the detection that not a single metadata shapefile has been changed.`;
        this.logger.error({ msg: message, logContext: logCtx, jobId: retryJob.id, taskId: validationTask.id });
        const error = new ConflictError(message);
        trace.getActiveSpan()?.setAttribute('exception.type', error.status);
        throw error;
      }
      updatedChecksums = this.buildUpdatedChecksums(validationTask.parameters.checksums, this.convertChecksumsToRelativePaths(newChecksums), logCtx);
    }

    const reportToSet: FileMetadata | undefined = validationTask.parameters.report ?? undefined;

    const updatedParameters: BaseValidationTaskParams = {
      isValid: validationTask.parameters.isValid,
      report: reportToSet,
      checksums: updatedChecksums,
    };

    this.logger.info({
      msg: 'resetting validation task and job to PENDING status with updated parameters',
      logContext: logCtx,
      jobId: retryJob.id,
      taskId: validationTask.id,
      updatedChecksumItems: updatedChecksums.length,
      shouldConsiderChecksumChanges,
    });

    await this.manualResetJobAndTask(validationTask.jobId, validationTask.id, updatedParameters, logCtx);

    trace
      .getActiveSpan()
      ?.setStatus({ code: SpanStatusCode.OK })
      .addEvent('ingestionManager.hardReset.success', { retryType: 'hardReset', jobId: retryJob.id });
    this.logger.info({ msg: 'hard reset completed successfully', logContext: logCtx, jobId: retryJob.id, taskId: validationTask.id });
  }

  @withSpanAsyncV4
  private async validateAndGetAbsoluteInputFiles(inputFiles: InputFiles): Promise<InputFiles> {
    await this.zodValidator.validate(inputFilesSchema, inputFiles);

    const absoluteInputFilesPaths = getAbsolutePathInputFiles({
      inputFiles,
      sourceMount: this.sourceMount,
    });
    const { gpkgFilesPath, metadataShapefilePath, productShapefilePath } = absoluteInputFilesPaths.inputFiles;

    // Validate that all input files exist
    const combinedInputFiles = [...gpkgFilesPath, ...getShapefileFiles(metadataShapefilePath), ...getShapefileFiles(productShapefilePath)];
    await this.sourceValidator.validateFilesExist(combinedInputFiles);

    return absoluteInputFilesPaths.inputFiles;
  }

  @withSpanV4
  private isChecksumChanged(existingChecksums: IChecksum[], newChecksums: IChecksum[]): boolean {
    return newChecksums.some((newChecksum) => !this.checksumExists(existingChecksums, newChecksum.checksum));
  }

  @withSpanV4
  private buildUpdatedChecksums(existingChecksums: IChecksum[], newChecksums: IChecksum[], logCtx: LogContext): IChecksum[] {
    const uniqueNewChecksums = newChecksums.filter((newChecksum) => !this.checksumExists(existingChecksums, newChecksum.checksum));

    const updatedChecksums = [...existingChecksums, ...uniqueNewChecksums];

    this.logger.debug({
      msg: 'built updated checksums array',
      logContext: logCtx,
      totalExistingFiles: existingChecksums.length,
      totalNewFiles: newChecksums.length,
      uniqueNewFiles: uniqueNewChecksums.length,
      totalUpdatedFiles: updatedChecksums.length,
      uniqueNewFileNames: uniqueNewChecksums.map((c) => c.fileName),
    });

    return updatedChecksums;
  }

  @withSpanV4
  private checksumExists(checksums: IChecksum[], checksumValue: string): boolean {
    return checksums.some((checksum) => checksum.checksum === checksumValue);
  }

  @withSpanAsyncV4
  private async manualResetJobAndTask(jobId: string, taskId: string, parameters: BaseValidationTaskParams, logCtx: LogContext): Promise<void> {
    this.logger.debug({ msg: 'manually updating validation task and job status to PENDING', logContext: logCtx, jobId, taskId });

    const taskParameters: IUpdateTaskBody<BaseValidationTaskParams> = {
      parameters,
      status: OperationStatus.PENDING,
      attempts: 0,
      percentage: 0,
      reason: '',
    };

    await this.jobManagerWrapper.updateTask<BaseValidationTaskParams>(jobId, taskId, taskParameters);
    await this.jobManagerWrapper.updateJob(jobId, { status: OperationStatus.PENDING, reason: '' });
    this.logger.debug({ msg: 'validation task and job status updated to PENDING successfully', logContext: logCtx, jobId, taskId });
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
    this.logger.info({ msg: 'validation against catalog, job-manager, and mapproxy passed', logContext: logCtx });
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
    this.logger.info({ msg: 'validation against catalog, job-manager, and mapproxy passed', logContext: logCtx });
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
  private async newLayerJobPayload(
    newLayer: EnhancedIngestionNewLayer
  ): Promise<ICreateJobBody<IngestionNewJobParams, ChecksumValidationParameters>> {
    const checksums = await this.getFilesChecksum(newLayer.inputFiles.metadataShapefilePath.absolute);
    const relativeChecksums = this.convertChecksumsToRelativePaths(checksums);
    const taskParameters: ChecksumValidationParameters = { checksums: relativeChecksums };

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
  ): Promise<ICreateJobBody<IngestionUpdateJobParams | IngestionSwapUpdateJobParams, ChecksumValidationParameters>> {
    const { displayPath, id, productId, productType, productVersion, tileOutputFormat, productName, productSubType } = rasterLayerMetadata;
    const isSwapUpdate = this.supportedIngestionSwapTypes.find((supportedSwapObj) => {
      return supportedSwapObj.productType === productType && supportedSwapObj.productSubType === productSubType;
    });
    const updateJobAction = isSwapUpdate ? this.swapUpdateJobType : this.updateJobType;

    const checksums = await this.getFilesChecksum(updateLayer.inputFiles.metadataShapefilePath.absolute);
    const relativeChecksums = this.convertChecksumsToRelativePaths(checksums);
    const taskParameters: ChecksumValidationParameters = { checksums: relativeChecksums };

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

    this.logger.debug({ msg: `calculating checksum for: ${filePath}`, logContext: logCtx });

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

  @withSpanV4
  private isJobRetryable(status: OperationStatus): boolean {
    const validStatuses = [OperationStatus.FAILED, OperationStatus.SUSPENDED];
    return validStatuses.includes(status);
  }

  private convertChecksumsToRelativePaths(checksums: IChecksum[]): IChecksum[] {
    return checksums.map((checksum) => ({
      ...checksum,
      fileName: relative(this.sourceMount, checksum.fileName),
    }));
  }
}
