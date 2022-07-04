import { IngestionParams, ProductType } from '@map-colonies/mc-model-types';
import { inject, injectable } from 'tsyringe';
import { GeoJSON } from 'geojson';
import { Logger } from '@map-colonies/js-logger';
import { SERVICES } from '../../common/constants';
import { OperationStatus } from '../../common/enums';
import { ConflictError, BadRequestError } from '@map-colonies/error-types';
import { IConfig } from '../../common/interfaces';
import { CatalogClient } from '../../serviceClients/catalogClient';
import { MapPublisherClient } from '../../serviceClients/mapPublisherClient';
import { JobManagerClient } from '../../serviceClients/jobManagerClient';
import { getMapServingLayerName } from '../../utils/layerNameGenerator';
import { createBBoxString } from '../../utils/bbox';
import { FileValidator } from './fileValidator';
import { Classifier } from './classifier';
import { Polygon } from '@turf/turf';
import { layerMetadataToPolygonParts } from '../../common/utills/polygonPartsBuilder';

@injectable()
export class LayersManager {
  private readonly tasksBatchSize: number;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) config: IConfig,
    private readonly db: JobManagerClient,
    private readonly catalog: CatalogClient,
    private readonly mapPublisher: MapPublisherClient,
    private readonly fileValidator: FileValidator,
    private readonly classifier: Classifier
  ) {
    this.tasksBatchSize = config.get<number>('tasksBatchSize');
  }

  public async createLayer(data: IngestionParams): Promise<void> {
    const convertedData: Record<string, unknown> = data.metadata as unknown as Record<string, unknown>;

    if (convertedData.id !== undefined) {
      throw new BadRequestError(`received invalid field id`);
    }

    this.setDefaultValues(data);

    await this.validateRunConditions(data);
    data.metadata.srsId = data.metadata.srsId === undefined ? '4326' : data.metadata.srsId;
    data.metadata.srsName = data.metadata.srsName === undefined ? 'WGS84GEO' : data.metadata.srsName;
    data.metadata.productBoundingBox = createBBoxString(data.metadata.footprint as GeoJSON);
    data.metadata.classification = await this.calculateClassification(data);
    this.logger.info(`creating job and task for layer ${data.metadata.productId as string}`);
    const layerRelativePath = `${data.metadata.productId as string}/${data.metadata.productType as string}`;
    await this.createTask(data, layerRelativePath);
  }

  private async createTask(data: IngestionParams, layerRelativePath: string): Promise<void> {
    let jobId: string | undefined = undefined;
    if (jobId === undefined) {
      jobId = await this.db.createLayerJob(data, layerRelativePath);
    } else {
      // eslint-disable-next-line no-useless-catch
      try {
        await this.db.createTask(jobId, data);
      } catch (err) {
        //TODO: properly handle errors
        await this.db.updateJobStatus(jobId, OperationStatus.FAILED);
        throw err;
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

  private setDefaultValues(data: IngestionParams): void {
    data.metadata.srsId = data.metadata.srsId === undefined ? '4326' : data.metadata.srsId;
    data.metadata.srsName = data.metadata.srsName === undefined ? 'WGS84GEO' : data.metadata.srsName;
    data.metadata.productBoundingBox = createBBoxString(data.metadata.footprint as GeoJSON);
    if (!data.metadata.layerPolygonParts) {
      data.metadata.layerPolygonParts = layerMetadataToPolygonParts(data.metadata);
    }
  }

  private async calculateClassification(data: IngestionParams): Promise<string> {
    const resolutionMeter = data.metadata.maxResolutionMeter as number;
    const coordinates = (data.metadata.footprint as Polygon).coordinates;
    const manualClassification = data.metadata.classification as string;
    const autoCalculateClassification = await this.classifier.getClassification(resolutionMeter, coordinates);

    if (parseFloat(manualClassification) && parseFloat(manualClassification) <= autoCalculateClassification) {
      return manualClassification;
    } else {
      return autoCalculateClassification.toString();
    }
  }
}
