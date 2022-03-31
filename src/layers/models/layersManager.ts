import { IngestionParams, ProductType } from '@map-colonies/mc-model-types';
import { inject, injectable } from 'tsyringe';
import { GeoJSON } from 'geojson';
import { Logger } from '@map-colonies/js-logger';
import { SERVICES } from '../../common/constants';
import { OperationStatus } from '../../common/enums';
import { BadRequestError } from '../../common/exceptions/http/badRequestError';
import { ConflictError } from '../../common/exceptions/http/conflictError';
import { IConfig } from '../../common/interfaces';
import { CatalogClient } from '../../serviceClients/catalogClient';
import { MapPublisherClient } from '../../serviceClients/mapPublisherClient';
import { JobManagerClient } from '../../serviceClients/jobManagerClient';
import { ZoomLevelCalculator } from '../../utils/zoomToResolution';
import { getMapServingLayerName } from '../../utils/layerNameGenerator';
import { createBBoxString } from '../../utils/bbox';
import { ITaskZoomRange } from '../../tasks/interfaces';
import { ITaskParameters } from '../interfaces';
import { FileValidator } from './fileValidator';
import { Tasker } from './tasker';

@injectable()
export class LayersManager {
  private readonly tasksBatchSize: number;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) config: IConfig,
    private readonly zoomLevelCalculator: ZoomLevelCalculator,
    private readonly db: JobManagerClient,
    private readonly catalog: CatalogClient,
    private readonly mapPublisher: MapPublisherClient,
    private readonly fileValidator: FileValidator,
    private readonly tasker: Tasker
  ) {
    this.tasksBatchSize = config.get<number>('tasksBatchSize');
  }

  public async createLayer(data: IngestionParams): Promise<void> {
    const convertedData: Record<string, unknown> = data.metadata as unknown as Record<string, unknown>;
    console.log("DATA: ", data)
    if (convertedData.id !== undefined) {
      throw new BadRequestError(`received invalid field id`);
    }

    await this.validateRunConditions(data);
    data.metadata.srsId = data.metadata.srsId === undefined ? '4326' : data.metadata.srsId;
    data.metadata.srsName = data.metadata.srsName === undefined ? 'WGS84GEO' : data.metadata.srsName;
    data.metadata.productBoundingBox = createBBoxString(data.metadata.footprint as GeoJSON);
    this.logger.info(`creating job and tasks for layer ${data.metadata.productId as string}`);
    const layerRelativePath = `${data.metadata.productId as string}/${data.metadata.productType as string}`;
    const layerZoomRanges = this.zoomLevelCalculator.createLayerZoomRanges(data.metadata.maxResolutionDeg as number);
    await this.createTasks(data, layerRelativePath, layerZoomRanges);
  }

  private async createTasks(data: IngestionParams, layerRelativePath: string, layerZoomRanges: ITaskZoomRange[]): Promise<void> {
    const taskParams = this.tasker.generateTasksParameters(data, layerRelativePath, layerZoomRanges);
    let taskBatch: ITaskParameters[] = [];
    let jobId: string | undefined = undefined;
    for (const task of taskParams) {
      taskBatch.push(task);
      if (taskBatch.length === this.tasksBatchSize) {
        if (jobId === undefined) {
          jobId = await this.db.createLayerJob(data, layerRelativePath, taskBatch);
        } else {
          // eslint-disable-next-line no-useless-catch
          try {
            await this.db.createTasks(jobId, taskBatch);
          } catch (err) {
            //TODO: properly handle errors
            await this.db.updateJobStatus(jobId, OperationStatus.FAILED);
            throw err;
          }
        }
        taskBatch = [];
      }
    }
    if (taskBatch.length !== 0) {
      if (jobId === undefined) {
        jobId = await this.db.createLayerJob(data, layerRelativePath, taskBatch);
      } else {
        // eslint-disable-next-line no-useless-catch
        try {
          await this.db.createTasks(jobId, taskBatch);
        } catch (err) {
          //TODO: properly handle errors
          await this.db.updateJobStatus(jobId, OperationStatus.FAILED);
          throw err;
        }
      }
    }
  }

  private async validateRunConditions(data: IngestionParams): Promise<void> {
    const resourceId = data.metadata.productId as string;
    const version = data.metadata.productVersion as string;
    const productType = data.metadata.productType as ProductType;

    await this.validateNotRunning(resourceId, version, productType);
    await this.validateNotExistsInCatalog(resourceId, version, productType);
    await this.validateNotExistsInMapServer(resourceId, productType);
    await this.validateFiles(data);
  }

  private async validateFiles(data: IngestionParams): Promise<void> {
    const filesExists = await this.fileValidator.validateExists(data.originDirectory, data.fileNames);
    if (!filesExists) {
      throw new BadRequestError('invalid files list, some files are missing');
    }
  }

  private async validateNotExistsInMapServer(productId: string, productType: ProductType): Promise<void> {
    const layerName = getMapServingLayerName(productId, productType);
    const existsInMapServer = await this.mapPublisher.exists(layerName);
    if (existsInMapServer) {
      throw new ConflictError(`layer ${layerName}, already exists on mapProxy`);
    }
  }

  private async validateNotRunning(resourceId: string, version: string, productType: ProductType): Promise<void> {
    const jobs = await this.db.findJobs(resourceId, version, productType);
    jobs.forEach((job) => {
      if (job.status == OperationStatus.IN_PROGRESS || job.status == OperationStatus.PENDING) {
        throw new ConflictError(`layer id: ${resourceId} version: ${version} product type: ${productType}, generation is already running`);
      }
    });
  }

  private async validateNotExistsInCatalog(resourceId: string, version?: string, productType?: string): Promise<void> {
    const existsInCatalog = await this.catalog.exists(resourceId, version, productType);
    if (existsInCatalog) {
      throw new ConflictError(`layer id: ${resourceId} version: ${version as string}, already exists in catalog`);
    }
  }
}
