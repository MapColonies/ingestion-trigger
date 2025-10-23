/* eslint-disable @typescript-eslint/no-magic-numbers */
import { join } from 'node:path';
import { faker, fakerHE } from '@faker-js/faker';
import { RecordType, TileOutputFormat } from '@map-colonies/mc-model-types';
import { OperationStatus, type ICreateJobBody, type IFindJobsByCriteriaBody } from '@map-colonies/mc-priority-queue';
import {
  CORE_VALIDATIONS,
  INGESTION_VALIDATIONS,
  IngestionNewJobParams,
  RasterProductTypes,
  Transparency,
  type CallbackUrlsTargetArray,
  type IngestionSwapUpdateJobParams,
  type IngestionUpdateJobParams,
} from '@map-colonies/raster-shared';
import { Domain, RecordStatus, TilesMimeFormat } from '@map-colonies/types';
import { randomPolygon } from '@turf/turf';
import type { BBox, Polygon } from 'geojson';
import merge from 'lodash.merge';
import { randexp } from 'randexp';
import type { ValidationTaskParameters } from '../../src/ingestion/interfaces';
import type { IngestionNewLayer } from '../../src/ingestion/schemas/ingestionLayerSchema';
import type { InputFiles } from '../../src/ingestion/schemas/inputFilesSchema';
import type { RasterLayersCatalog } from '../../src/ingestion/schemas/layerCatalogSchema';
import type { IngestionNewMetadata } from '../../src/ingestion/schemas/newMetadataSchema';
import type { IngestionUpdateLayer } from '../../src/ingestion/schemas/updateLayerSchema';
import type { IngestionUpdateMetadata } from '../../src/ingestion/schemas/updateMetadataSchema';
import type { DeepPartial, FlatRecordValues, ReplaceValueWithFunctionResponse as ReplaceValueWithGenerator } from '../utils/types';
import { configMock } from './configMock';
import { mockInputFiles } from './sourcesRequestBody';

// adjust path to test files location relative to source mount
const TEST_FILES_RELATIVE_PATH = '/testFiles';

type UnAggregateKeys<T extends object> = {
  [K in keyof T as K extends `max${infer Q}` | `min${infer Q}` ? Uncapitalize<Q> : K]: T[K];
};

type RasterLayerCatalog = RasterLayersCatalog[number];
type Link = NonNullable<RasterLayerCatalog['links']>[number];
type RasterLayerMetadata = RasterLayerCatalog['metadata'];
type RequiredRasterLayerMetadata = Required<RasterLayerMetadata>;
type SimpleRasterLayerMetadata = Omit<
  RequiredRasterLayerMetadata,
  'imagingTimeBeginUTC' | 'imagingTimeEndUTC' | 'productBoundingBox' | 'creationDateUTC' | 'ingestionDate' | 'updateDateUTC'
>;
type SingleRasterLayerMetadata = FlatRecordValues<UnAggregateKeys<SimpleRasterLayerMetadata>>;
type RasterLayerMetadataPropertiesGenerators = ReplaceValueWithGenerator<SingleRasterLayerMetadata>;

type IngestionLayerInputFilesPropertiesGenerators = ReplaceValueWithGenerator<IngestionUpdateLayer['inputFiles']>;

const generateCatalogLayerLinks = ({ productId, productType }: { productId: string; productType: RasterProductTypes }): Link[] => {
  const templateLinks = [
    {
      name: `${productId}-${productType}`,
      protocol: 'WMS',
      url: 'https://tiles-dev/api/raster/v1/service?REQUEST=GetCapabilities',
    },
    {
      name: `${productId}-${productType}`,
      protocol: 'WMS_BASE',
      url: 'https://tiles-dev/api/raster/v1/wms',
    },
    {
      name: `${productId}-${productType}`,
      protocol: 'WMTS',
      url: 'https://tiles-dev/api/raster/v1/wmts/1.0.0/WMTSCapabilities.xml',
    },
    {
      name: `${productId}-${productType}`,
      protocol: 'WMTS_KVP',
      url: 'https://tiles-dev/api/raster/v1/service?REQUEST=GetCapabilities&SERVICE=WMTS',
    },
    {
      name: `${productId}-${productType}`,
      protocol: 'WMTS_BASE',
      url: 'https://tiles-dev/api/raster/v1/wmts',
    },
  ].map((link) => {
    return { ...link, description: faker.helpers.maybe(() => faker.word.words({ count: { min: 1, max: 10 } })) };
  });
  return faker.helpers.arrayElements(templateLinks);
};

const generateCallbackUrl = (): CallbackUrlsTargetArray[number] => faker.internet.url({ protocol: faker.helpers.arrayElement(['http', 'https']) });

const generateIngestionResolution = (): IngestionUpdateLayer['ingestionResolution'] =>
  faker.number.float({
    min: CORE_VALIDATIONS.resolutionDeg.min,
    max: CORE_VALIDATIONS.resolutionDeg.max,
  });

const generateCatalogLayerMetadata = ({ productId, productType }: { productId: string; productType: RasterProductTypes }): RasterLayerMetadata => {
  const horizontalAccuracyCE90 = [rasterLayerMetadataGenerators.horizontalAccuracyCE90(), rasterLayerMetadataGenerators.horizontalAccuracyCE90()];
  const [maxHorizontalAccuracyCE90, minHorizontalAccuracyCE90] = [Math.min(...horizontalAccuracyCE90), Math.max(...horizontalAccuracyCE90)];
  const resolutionMeter = [rasterLayerMetadataGenerators.resolutionMeter(), rasterLayerMetadataGenerators.resolutionMeter()];
  const [maxResolutionMeter, minResolutionMeter] = [Math.min(...resolutionMeter), Math.max(...resolutionMeter)];
  const resolutionDeg = [rasterLayerMetadataGenerators.resolutionDeg(), rasterLayerMetadataGenerators.resolutionDeg()];
  const [maxResolutionDeg, minResolutionDeg] = [Math.min(...resolutionDeg), Math.max(...resolutionDeg)];
  const longitude = [faker.number.float({ min: -170, max: 170 }), faker.number.float({ min: -170, max: 170 })];
  const latitude = [faker.number.float({ min: -80, max: 80 }), faker.number.float({ min: -80, max: 80 })];
  const bbox = [Math.min(...longitude), Math.min(...latitude), Math.max(...longitude), Math.max(...latitude)] satisfies BBox;
  const footprint = rasterLayerMetadataGenerators.footprint({ bbox });
  const productBoundingBox = footprint.coordinates
    .flat(3)
    .reduce<BBox>(
      (bbox, value, index) =>
        index % 2 === 0
          ? [Math.min(bbox[0], value), bbox[1], Math.max(bbox[2], value), bbox[3]]
          : [bbox[0], Math.min(bbox[1], value), bbox[2], Math.max(bbox[3], value)],
      [180, 90, -180, -90]
    )
    .join(',');

  const imagingTimes = [faker.date.past({ years: 10 }), faker.date.past({ years: 10 })].map((date) => date.getTime());
  const imagingTimeBeginUTC = new Date(Math.min(...imagingTimes));
  const imagingTimeEndUTC = new Date(Math.max(...imagingTimes));
  const updateDate = faker.date.future({ refDate: imagingTimeEndUTC, years: 10 });
  const ingestionDate = updateDate;
  const updateDateUTC = updateDate;
  const creationDateUTC = faker.date.between({ from: imagingTimeBeginUTC, to: updateDate });

  return {
    id: rasterLayerMetadataGenerators.id(),
    type: RecordType.RECORD_RASTER,
    classification: rasterLayerMetadataGenerators.classification(),
    productName: rasterLayerMetadataGenerators.productName(),
    description: faker.helpers.maybe(() => rasterLayerMetadataGenerators.description()),
    srs: rasterLayerMetadataGenerators.srs(),
    producerName: faker.helpers.maybe(() => rasterLayerMetadataGenerators.producerName()),
    imagingTimeBeginUTC,
    imagingTimeEndUTC,
    minHorizontalAccuracyCE90,
    maxHorizontalAccuracyCE90,
    sensors: faker.helpers.multiple(() => rasterLayerMetadataGenerators.sensor(), { count: faker.number.int({ min: 1, max: 10 }) }),
    region: faker.helpers.multiple(() => rasterLayerMetadataGenerators.region(), { count: faker.number.int({ min: 1, max: 100 }) }),
    productId,
    productVersion: rasterLayerMetadataGenerators.productVersion(),
    productType,
    productSubType: faker.helpers.maybe(() => rasterLayerMetadataGenerators.productSubType()),
    srsName: rasterLayerMetadataGenerators.srsName(),
    minResolutionDeg,
    maxResolutionDeg,
    minResolutionMeter,
    maxResolutionMeter,
    scale: faker.helpers.maybe(() => rasterLayerMetadataGenerators.scale()),
    footprint: rasterLayerMetadataGenerators.footprint({ bbox }),
    productBoundingBox: faker.helpers.maybe(() => productBoundingBox),
    displayPath: rasterLayerMetadataGenerators.displayPath(),
    transparency: rasterLayerMetadataGenerators.transparency(),
    tileMimeFormat: rasterLayerMetadataGenerators.tileMimeFormat(),
    tileOutputFormat: rasterLayerMetadataGenerators.tileOutputFormat(),
    creationDateUTC,
    ingestionDate,
    updateDateUTC,
    productStatus: rasterLayerMetadataGenerators.productStatus(),
  };
};

const generateNewLayerMetadata = (): IngestionNewMetadata => {
  return {
    classification: rasterLayerMetadataGenerators.classification(),
    productId: rasterLayerMetadataGenerators.productId(),
    productName: rasterLayerMetadataGenerators.productName(),
    productType: rasterLayerMetadataGenerators.productType(),
    region: faker.helpers.multiple(() => rasterLayerMetadataGenerators.region(), { count: faker.number.int({ min: 1, max: 100 }) }),
    srs: rasterLayerMetadataGenerators.srs(),
    srsName: rasterLayerMetadataGenerators.srsName(),
    transparency: rasterLayerMetadataGenerators.transparency(),
    description: rasterLayerMetadataGenerators.description(),
    producerName: rasterLayerMetadataGenerators.producerName(),
    productSubType: rasterLayerMetadataGenerators.productSubType(),
    scale: rasterLayerMetadataGenerators.scale(),
  };
};

export const generateNewLayerRequest = (): IngestionNewLayer => {
  return {
    callbackUrls: faker.helpers.maybe(() => faker.helpers.multiple(() => generateCallbackUrl(), { count: { min: 1, max: 10 } })),
    ingestionResolution: generateIngestionResolution(),
    inputFiles: generateInputFiles(),
    metadata: generateNewLayerMetadata(),
  };
};


export const generateUpdateLayerRequest = (): IngestionUpdateLayer => {
  return {
    callbackUrls: faker.helpers.maybe(() => faker.helpers.multiple(() => generateCallbackUrl(), { count: { min: 1, max: 10 } })),
    ingestionResolution: generateIngestionResolution(),
    inputFiles: generateInputFiles(),
    metadata: generateUpdateLayerMetadata(),
  };
};

const generateUpdateLayerMetadata = (): IngestionUpdateMetadata => {
  return {
    classification: faker.number.int({ max: 100 }).toString(),
  };
};

const getTestFilePath = (inputFiles: InputFiles): InputFiles => {
  const { gpkgFilesPath, metadataShapefilePath, productShapefilePath } = inputFiles;
  return {
    gpkgFilesPath: [join(getTestFilesPath(), 'gpkg', gpkgFilesPath[0])],
    metadataShapefilePath: join(getTestFilesPath(), 'metadata', metadataShapefilePath, 'ShapeMetadata.shp'),
    productShapefilePath: join(getTestFilesPath(), 'product', productShapefilePath, 'Product.shp'),
  };
};

/**
 * CAUTION generated paths can be existing files on file system
 */
const generateInputFiles = (): InputFiles => {
  return {
    gpkgFilesPath: [join(faker.system.directoryPath(), fakerHE.system.commonFileName('gpkg'))],
    metadataShapefilePath: join(faker.system.directoryPath(), 'ShapeMetadata.shp'),
    productShapefilePath: join(faker.system.directoryPath(), 'Product.shp'),
  };
};

export const rasterLayerInputFilesGenerators: IngestionLayerInputFilesPropertiesGenerators = {
  gpkgFilesPath: () => [join(getTestFilesPath(), 'gpkg', fakerHE.system.commonFileName('gpkg'))],
  metadataShapefilePath: () => join(getTestFilesPath(), 'metadata', faker.string.alphanumeric({ length: { min: 1, max: 10 } }), 'ShapeMetadata.shp'),
  productShapefilePath: () => join(getTestFilesPath(), 'product', faker.string.alphanumeric({ length: { min: 1, max: 10 } }), 'Product.shp'),
};

// TODO: fakerHE!!!!! - check hebrew generation
export const rasterLayerMetadataGenerators: RasterLayerMetadataPropertiesGenerators = {
  id: (): string => faker.string.uuid(),
  classification: (): string => faker.number.int({ max: 100 }).toString(),
  productName: (): string => faker.string.alphanumeric({ length: { min: 1, max: 100 } }),
  productId: (): string => randexp(INGESTION_VALIDATIONS.productId.pattern),
  productType: (): RasterProductTypes => faker.helpers.enumValue(RasterProductTypes),
  region: (): string => fakerHE.string.alphanumeric({ length: { min: 1, max: 100 } }),
  transparency: (): Transparency => faker.helpers.enumValue(Transparency),
  description: (): string => fakerHE.string.alphanumeric({ length: { min: 0, max: 100 } }),
  producerName: (): string => fakerHE.string.alphanumeric({ length: { min: 0, max: 100 } }),
  productSubType: (): string => fakerHE.string.alphanumeric({ length: { min: 0, max: 100 } }),
  scale: (): number => faker.number.int({ min: INGESTION_VALIDATIONS.scale.min, max: INGESTION_VALIDATIONS.scale.max }),
  srs: (): '4326' => '4326',
  srsName: (): 'WGS84GEO' => 'WGS84GEO',
  displayPath: (): string => faker.string.uuid(),
  tileOutputFormat: (): TileOutputFormat => faker.helpers.enumValue(TileOutputFormat),
  productVersion: (): string => randexp(INGESTION_VALIDATIONS.productVersion.pattern),
  resolutionDeg: (): number => faker.number.float({ min: CORE_VALIDATIONS.resolutionDeg.min, max: CORE_VALIDATIONS.resolutionDeg.max }),
  resolutionMeter: (): number =>
    faker.number.float({ min: INGESTION_VALIDATIONS.resolutionMeter.min, max: INGESTION_VALIDATIONS.resolutionMeter.max }),
  horizontalAccuracyCE90: (): number =>
    faker.number.float({ min: INGESTION_VALIDATIONS.horizontalAccuracyCE90.min, max: INGESTION_VALIDATIONS.horizontalAccuracyCE90.max }),
  // TODO: sensor: (): string => randexp(INGESTION_VALIDATIONS.sensor.pattern),
  sensor: (): string => randexp('^([^\\s]).+([^\\s])$'),
  tileMimeFormat: (): TilesMimeFormat => faker.helpers.arrayElement(['image/png', 'image/jpeg']),
  productStatus: (): RecordStatus => faker.helpers.enumValue(RecordStatus),
  type: (): RecordType.RECORD_RASTER => RecordType.RECORD_RASTER,
  footprint: (options: Parameters<typeof randomPolygon>[1]): Polygon => {
    const mergedOptions = merge(
      {
        bbox: [-170, -80, 170, 80] satisfies BBox, // polygon maximum extent cannot exceed [-180,-90,180,90]
        // eslint-disable-next-line @typescript-eslint/naming-convention
        max_radial_length: faker.number.float({ min: Number.EPSILON, max: 10 }),
      },
      structuredClone(options)
    );
    const { bbox } = mergedOptions;
    mergedOptions.max_radial_length = Math.min(bbox[2] - bbox[0], bbox[3] - bbox[1]) / 2;
    return randomPolygon(1, mergedOptions).features[0].geometry;
  },
};

export const generateCatalogLayerResponse = (): RasterLayerCatalog => {
  const productId = rasterLayerMetadataGenerators.productId();
  const productType = rasterLayerMetadataGenerators.productType();

  return {
    metadata: generateCatalogLayerMetadata({ productId, productType }),
    links: faker.helpers.arrayElements(generateCatalogLayerLinks({ productId, productType })),
  };
};

export const createNewLayerRequest = (newLayerRequest: IngestionNewLayer): IngestionNewLayer => {
  const override = structuredClone(newLayerRequest);
  override.inputFiles = getTestFilePath(override.inputFiles);
  const mergedNewLayerRequest = merge(generateNewLayerRequest(), override);
  return mergedNewLayerRequest;
};

export const createUpdateLayerRequest = (
  newLayerRequest: DeepPartial<IngestionUpdateLayer> & Pick<IngestionUpdateLayer, 'inputFiles'>
): IngestionUpdateLayer => {
  const override = structuredClone(newLayerRequest);
  override.inputFiles = getTestFilePath(override.inputFiles);
  const mergedUpdateLayerRequest = merge(generateUpdateLayerRequest(), override);
  return mergedUpdateLayerRequest;
};

export const createCatalogLayerResponse = (rasterLayerCatalog?: DeepPartial<RasterLayerCatalog>): RasterLayerCatalog => {
  const override = structuredClone(rasterLayerCatalog);
  const mergedRasterLayerCatalog = merge(generateCatalogLayerResponse(), override);
  return mergedRasterLayerCatalog;
};

export const getTestFilesPath = (): string => {
  return TEST_FILES_RELATIVE_PATH;
};

export const createFindJobsParams = (findJobsParams: IFindJobsByCriteriaBody): IFindJobsByCriteriaBody => {
  const defaultFindJobsParams = {
    isCleaned: false,
    shouldReturnTasks: false,
    statuses: [OperationStatus.PENDING, OperationStatus.IN_PROGRESS, OperationStatus.FAILED, OperationStatus.SUSPENDED],
    types: configMock.get<string[]>('jobManager.forbiddenJobTypesForParallelIngestion'),
  } satisfies Required<Pick<IFindJobsByCriteriaBody, 'isCleaned' | 'shouldReturnTasks' | 'statuses' | 'types'>>;

  return merge({}, defaultFindJobsParams, findJobsParams);
};

export const generateNewLayerRequest = (): IngestionNewLayer => {
  return {
    callbackUrls: faker.helpers.maybe(() => faker.helpers.multiple(() => generateCallbackUrl(), { count: { min: 1, max: 10 } })),
    ingestionResolution: generateIngestionResolution(),
    inputFiles: generateInputFiles(),
    metadata: generateNewLayerMetadata(),
  };
};

export const generateNewJobRequest = (): ICreateJobBody<IngestionNewJobParams, ValidationTaskParameters> => {
  const fakeProductId = faker.helpers.fromRegExp(randexp(INGESTION_VALIDATIONS.productId.pattern));
  const productName = faker.string.alphanumeric();
  const productType = RasterProductTypes.ORTHOPHOTO;
  const transparency = Transparency.TRANSPARENT;
  const domain = Domain.RASTER;
  const jobType = 'Ingestion_New';
  const taskType = 'validation';
  const checksum = 'checksome_result';

  return {
    resourceId: fakeProductId,
    version: '1.0',
    internalId: faker.string.uuid(),
    type: jobType,
    productName,
    productType,
    status: OperationStatus.PENDING,
    parameters: {
      ingestionResolution: 0.000000335276126861572,
      metadata: {
        productId: fakeProductId,
        productName,
        classification: '6',
        productType,
        region: ['test'],
        srs: '4326',
        srsName: 'WGS84GEO',
        transparency: transparency
      },
      inputFiles: mockInputFiles,
      additionalParams: {
        jobTrackerServiceURL: faker.internet.url(),
      },
    },
    domain,
    tasks: [
      {
        type: taskType,
        parameters: {
          checksums: [{ algorithm: 'XXH64', checksum, fileName: mockInputFiles.metadataShapefilePath }],
        },
      },
    ],
  };
};

export const generateUpdateJobRequest = (isSwapUpdate = false): ICreateJobBody<IngestionUpdateJobParams | IngestionSwapUpdateJobParams, ValidationTaskParameters> => {
  const fakeProductId = faker.helpers.fromRegExp(randexp(INGESTION_VALIDATIONS.productId.pattern));
  const productName = faker.string.alphanumeric();
  const productType = RasterProductTypes.ORTHOPHOTO;
  const domain = Domain.RASTER;
  const taskType = 'validation';
  const checksum = 'checksome_result';
  const updateJobType = isSwapUpdate ? 'Ingestion_Update' : 'Ingestion_Swap_Update';
  const footprint: Polygon = {coordinates: [], type: 'Polygon'};

  return {
    resourceId: fakeProductId,
    version: '2.0',
    internalId: faker.string.uuid(),
    type: updateJobType,
    productName,
    productType,
    status: OperationStatus.PENDING,
    parameters: {
      ingestionResolution: 0.000000335276126861572,
      metadata: {
        classification: '6',
      },
      inputFiles: mockInputFiles,
      additionalParams: {
        footprint,
        tileOutputFormat: TileOutputFormat.PNG,
        displayPath:faker.string.uuid(),
        jobTrackerServiceURL: faker.internet.url(),
      },
    },
    domain,
    tasks: [
      {
        type: taskType,
        parameters: {
          checksums: [{ algorithm: 'XXH64', checksum, fileName: mockInputFiles.metadataShapefilePath }],
        },
      },
    ],
  };
};


export const createUpdateJobRequest = (
  {
    ingestionUpdateLayer,
    rasterLayerMetadata,
    checksums,
  }: { ingestionUpdateLayer: IngestionUpdateLayer; rasterLayerMetadata: RasterLayerMetadata } & Pick<ValidationTaskParameters, 'checksums'>,
  isSwapUpdate = false
): ICreateJobBody<IngestionUpdateJobParams | IngestionSwapUpdateJobParams, ValidationTaskParameters> => {
  const domain = configMock.get<string>('jobManager.jobDomain');
  const updateJobType = configMock.get<string>('jobManager.ingestionUpdateJobType');
  const swapUpdateJobType = configMock.get<string>('jobManager.ingestionSwapUpdateJobType');
  const validationTaskType = configMock.get<string>('jobManager.validationTaskType');
  const jobTrackerServiceUrl = configMock.get<string>('services.jobTrackerServiceURL');
  const updateJobAction = isSwapUpdate ? swapUpdateJobType : updateJobType;

  const {
    ingestionResolution,
    inputFiles,
    metadata: { classification },
  } = ingestionUpdateLayer;
  const { displayPath, footprint, id, productId, productType, productVersion, productName, tileOutputFormat } = rasterLayerMetadata;

  return {
    resourceId: productId,
    version: (parseFloat(productVersion) + 1).toFixed(1),
    internalId: id,
    type: updateJobAction,
    productName,
    productType,
    status: OperationStatus.PENDING,
    parameters: {
      ingestionResolution,
      metadata: {
        classification,
      },
      inputFiles,
      additionalParams: {
        footprint,
        tileOutputFormat,
        displayPath,
        jobTrackerServiceURL: jobTrackerServiceUrl,
      },
    },
    domain,
    tasks: [
      {
        type: validationTaskType,
        parameters: {
          checksums,
        },
      },
    ],
  };
};
