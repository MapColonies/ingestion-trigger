/* eslint-disable @typescript-eslint/no-magic-numbers */
import { join, relative } from 'node:path';
import { faker } from '@faker-js/faker';
import { RecordType, TileOutputFormat } from '@map-colonies/mc-model-types';
import { OperationStatus, type ICreateJobBody, type IFindJobsByCriteriaBody } from '@map-colonies/mc-priority-queue';
import {
  Checksum,
  CORE_VALIDATIONS,
  INGESTION_VALIDATIONS,
  IngestionNewJobParams,
  RasterProductTypes,
  Transparency,
  type IngestionValidationTaskParams,
  type CallbackUrlsTargetArray,
  type IngestionSwapUpdateJobParams,
  type IngestionUpdateJobParams,
  type InputFiles,
  type NewRasterLayerMetadata,
  type UpdateRasterLayerMetadata,
} from '@map-colonies/raster-shared';
import { Domain, RecordStatus, TilesMimeFormat } from '@map-colonies/types';
import { randomPolygon } from '@turf/turf';
import type { BBox, Polygon } from 'geojson';
import merge from 'lodash.merge';
import { randexp } from 'randexp';
import { trace } from '@opentelemetry/api';
import type { RasterLayersCatalog } from '../../src/ingestion/schemas/layerCatalogSchema';
import type { IngestionNewLayer } from '../../src/ingestion/schemas/newLayerSchema';
import type { IngestionUpdateLayer } from '../../src/ingestion/schemas/updateLayerSchema';
import { getShapefileFiles } from '../../src/utils/shapefile';
import type { DeepPartial, FlatRecordValues, ReplaceValueWithFunctionResponse as ReplaceValueWithGenerator } from '../utils/types';
import { configMock } from './configMock';

type UnAggregateKeys<T extends object> = {
  [K in keyof T as K extends `max${infer P}` | `min${infer P}` ? Uncapitalize<P> : K]: T[K];
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

const LOWER_ALPHA_CHARS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const UPPER_ALPHA_CHARS = [...'abcdefghijklmnopqrstuvwxyz'];
const NUMERIC_CHARS = [...'0123456789'];
const HEBREW_CHARS = [...'אבגדהוזחטיכלמנסעפצקרשתךםןףץ'];

const generateHebrewCommonFileName = (extension: string, options: { min: number; max: number }): string =>
  `${faker.string.fromCharacters([...LOWER_ALPHA_CHARS, ...UPPER_ALPHA_CHARS, ...NUMERIC_CHARS, ...HEBREW_CHARS, '-', '_'], options)}.${extension}`;

const generateHebrewAlphanumeric = (options: { min: number; max: number }): string => {
  return faker.helpers.multiple(() => faker.helpers.arrayElement(HEBREW_CHARS), { count: options }).join('');
};

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
    region: faker.helpers.multiple(() => rasterLayerMetadataGenerators.region(), { count: faker.number.int({ min: 1, max: 5 }) }),
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

const generateNewLayerMetadata = (): NewRasterLayerMetadata => {
  return {
    classification: rasterLayerMetadataGenerators.classification(),
    productId: rasterLayerMetadataGenerators.productId(),
    productName: rasterLayerMetadataGenerators.productName(),
    productType: rasterLayerMetadataGenerators.productType(),
    region: faker.helpers.multiple(() => rasterLayerMetadataGenerators.region(), { count: faker.number.int({ min: 1, max: 5 }) }),
    srs: rasterLayerMetadataGenerators.srs(),
    srsName: rasterLayerMetadataGenerators.srsName(),
    transparency: rasterLayerMetadataGenerators.transparency(),
    description: rasterLayerMetadataGenerators.description(),
    producerName: rasterLayerMetadataGenerators.producerName(),
    productSubType: rasterLayerMetadataGenerators.productSubType(),
    scale: rasterLayerMetadataGenerators.scale(),
  };
};

const generateUpdateLayerMetadata = (): UpdateRasterLayerMetadata => {
  return {
    classification: faker.number.int({ max: 100 }).toString(),
  };
};

const getInputFilesLocalPath = (inputFiles: InputFiles): InputFiles => {
  const { gpkgFilesPath, metadataShapefilePath, productShapefilePath } = inputFiles;
  return {
    gpkgFilesPath: getGpkgsFilesLocalPath([gpkgFilesPath[0]]),
    metadataShapefilePath: join('metadata', metadataShapefilePath, 'ShapeMetadata.shp'),
    productShapefilePath: join('product', productShapefilePath, 'Product.shp'),
  };
};

/**
 * CAUTION generated paths can be existing files on file system
 */
export const generateInputFiles = (): InputFiles => {
  return {
    gpkgFilesPath: [join(faker.system.directoryPath(), generateHebrewCommonFileName('gpkg', { min: 1, max: 1 }))],
    metadataShapefilePath: join(faker.system.directoryPath(), 'ShapeMetadata.shp'),
    productShapefilePath: join(faker.system.directoryPath(), 'Product.shp'),
  };
};

export const getGpkgsFilesLocalPath = (gpkgFilesPath: string[]): string[] => gpkgFilesPath.map((gpkgFilePath) => join('gpkg', gpkgFilePath));

export const rasterLayerInputFilesGenerators: IngestionLayerInputFilesPropertiesGenerators = {
  gpkgFilesPath: () => getGpkgsFilesLocalPath([generateHebrewCommonFileName('gpkg', { min: 1, max: 5 })]),
  metadataShapefilePath: () => join('metadata', faker.string.alphanumeric({ length: { min: 1, max: 10 } }), 'ShapeMetadata.shp'),
  productShapefilePath: () => join('product', faker.string.alphanumeric({ length: { min: 1, max: 10 } }), 'Product.shp'),
};
export const tracerMock = trace.getTracer('test');

export const generateHash = (): string => faker.string.hexadecimal({ length: 64, casing: 'lower', prefix: '' });
export const generateChecksum = (): Checksum => {
  return {
    algorithm: 'XXH64' as const,
    checksum: generateHash(),
    fileName: join(faker.system.directoryPath(), faker.system.fileName()),
  };
};

export const generateCallbackUrl = (): CallbackUrlsTargetArray[number] =>
  faker.internet.url({ protocol: faker.helpers.arrayElement(['http', 'https']) });

export const rasterLayerMetadataGenerators: RasterLayerMetadataPropertiesGenerators = {
  id: (): string => faker.string.uuid(),
  classification: (): string => faker.number.int({ max: 100 }).toString(),
  productName: (): string => faker.string.alphanumeric({ length: { min: 1, max: 100 } }),
  productId: (): string => randexp(INGESTION_VALIDATIONS.productId.pattern),
  productType: (): RasterProductTypes => faker.helpers.enumValue(RasterProductTypes),
  region: (): string => generateHebrewAlphanumeric({ min: 1, max: 100 }),
  transparency: (): Transparency => faker.helpers.enumValue(Transparency),
  description: (): string => generateHebrewAlphanumeric({ min: 0, max: 100 }),
  producerName: (): string => generateHebrewAlphanumeric({ min: 0, max: 100 }),
  productSubType: (): string => generateHebrewAlphanumeric({ min: 0, max: 100 }),
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
  sensor: (): string => randexp(INGESTION_VALIDATIONS.sensor.pattern),
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

export const generateNewJobRequest = (): ICreateJobBody<IngestionNewJobParams, IngestionValidationTaskParams> => {
  const ingestionNewJobType = configMock.get<string>('jobManager.ingestionNewJobType');
  const validationTaskType = configMock.get<string>('jobManager.validationTaskType');
  const jobTrackerServiceUrl = configMock.get<string>('services.jobTrackerServiceURL');
  const sourceMount = configMock.get<string>('storageExplorer.layerSourceDir');
  const productId = rasterLayerMetadataGenerators.productId();
  const productName = rasterLayerMetadataGenerators.productName();
  const productType = rasterLayerMetadataGenerators.productType();
  const inputFiles = {
    gpkgFilesPath: [relative(sourceMount, join(sourceMount, rasterLayerInputFilesGenerators.gpkgFilesPath()[0]))],
    metadataShapefilePath: relative(sourceMount, join(sourceMount, rasterLayerInputFilesGenerators.metadataShapefilePath())),
    productShapefilePath: relative(sourceMount, join(sourceMount, rasterLayerInputFilesGenerators.productShapefilePath())),
  };
  const checksums = [
    ...inputFiles.gpkgFilesPath,
    ...getShapefileFiles(inputFiles.metadataShapefilePath),
    ...getShapefileFiles(inputFiles.productShapefilePath),
  ].map((fileName) => {
    return {
      algorithm: 'XXH64' as const,
      checksum: generateHash(),
      fileName,
    };
  });

  return {
    resourceId: productId,
    version: '1.0',
    internalId: faker.string.uuid(),
    type: ingestionNewJobType,
    productName,
    productType,
    status: OperationStatus.PENDING,
    parameters: {
      ingestionResolution: generateIngestionResolution(),
      metadata: {
        productId,
        productName,
        classification: rasterLayerMetadataGenerators.classification(),
        productType,
        region: faker.helpers.multiple(() => rasterLayerMetadataGenerators.region(), { count: faker.number.int({ min: 1, max: 5 }) }),
        srs: rasterLayerMetadataGenerators.srs(),
        srsName: rasterLayerMetadataGenerators.srsName(),
        transparency: rasterLayerMetadataGenerators.transparency(),
        description: faker.helpers.maybe(() => rasterLayerMetadataGenerators.description()),
        scale: faker.helpers.maybe(() => rasterLayerMetadataGenerators.scale()),
        producerName: faker.helpers.maybe(() => rasterLayerMetadataGenerators.producerName()),
        productSubType: faker.helpers.maybe(() => rasterLayerMetadataGenerators.productSubType()),
      },
      inputFiles,
      additionalParams: {
        jobTrackerServiceURL: jobTrackerServiceUrl,
      },
    },
    domain: Domain.RASTER,
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

export const generateUpdateJobRequest = (
  isSwapUpdate = false
): ICreateJobBody<IngestionUpdateJobParams | IngestionSwapUpdateJobParams, IngestionValidationTaskParams> => {
  const ingestionUpdateJobType = configMock.get<string>('jobManager.ingestionUpdateJobType');
  const ingestionSwapUpdateJobType = configMock.get<string>('jobManager.ingestionSwapUpdateJobType');
  const jobTrackerServiceUrl = configMock.get<string>('services.jobTrackerServiceURL');
  const sourceMount = configMock.get<string>('storageExplorer.layerSourceDir');
  const productId = rasterLayerMetadataGenerators.productId();
  const productName = rasterLayerMetadataGenerators.productName();
  const productType = rasterLayerMetadataGenerators.productType();
  const validationTaskType = configMock.get<string>('jobManager.validationTaskType');
  const updateJobType = isSwapUpdate ? ingestionUpdateJobType : ingestionSwapUpdateJobType;
  const inputFiles = {
    gpkgFilesPath: [relative(sourceMount, join(sourceMount, rasterLayerInputFilesGenerators.gpkgFilesPath()[0]))],
    metadataShapefilePath: relative(sourceMount, join(sourceMount, rasterLayerInputFilesGenerators.metadataShapefilePath())),
    productShapefilePath: relative(sourceMount, join(sourceMount, rasterLayerInputFilesGenerators.productShapefilePath())),
  };
  const checksums = [
    ...inputFiles.gpkgFilesPath,
    ...getShapefileFiles(inputFiles.metadataShapefilePath),
    ...getShapefileFiles(inputFiles.productShapefilePath),
  ].map((fileName) => {
    return {
      algorithm: 'XXH64' as const,
      checksum: generateHash(),
      fileName,
    };
  });

  return {
    resourceId: productId,
    version: rasterLayerMetadataGenerators.productVersion(),
    internalId: faker.string.uuid(),
    type: updateJobType,
    productName,
    productType,
    status: OperationStatus.PENDING,
    parameters: {
      ingestionResolution: generateIngestionResolution(),
      metadata: {
        classification: rasterLayerMetadataGenerators.classification(),
      },
      inputFiles,
      additionalParams: {
        tileOutputFormat: rasterLayerMetadataGenerators.tileOutputFormat(),
        displayPath: rasterLayerMetadataGenerators.displayPath(),
        jobTrackerServiceURL: jobTrackerServiceUrl,
      },
    },
    domain: Domain.RASTER,
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

export const createNewLayerRequest = (newLayerRequest: DeepPartial<IngestionNewLayer> & Pick<IngestionNewLayer, 'inputFiles'>): IngestionNewLayer => {
  const override = structuredClone(newLayerRequest);
  override.inputFiles = getInputFilesLocalPath(override.inputFiles);
  const mergedNewLayerRequest = merge(generateNewLayerRequest(), override);
  return mergedNewLayerRequest;
};

export const createUpdateLayerRequest = (
  newLayerRequest: DeepPartial<IngestionUpdateLayer> & Pick<IngestionUpdateLayer, 'inputFiles'>
): IngestionUpdateLayer => {
  const override = structuredClone(newLayerRequest);
  override.inputFiles = getInputFilesLocalPath(override.inputFiles);
  const mergedUpdateLayerRequest = merge(generateUpdateLayerRequest(), override);
  return mergedUpdateLayerRequest;
};

export const createCatalogLayerResponse = (rasterLayerCatalog?: DeepPartial<RasterLayerCatalog>): RasterLayerCatalog => {
  const override = structuredClone(rasterLayerCatalog);
  const mergedRasterLayerCatalog = merge(generateCatalogLayerResponse(), override);
  return mergedRasterLayerCatalog;
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

export const createUpdateJobRequest = (
  {
    ingestionUpdateLayer,
    rasterLayerMetadata,
    checksums,
  }: { ingestionUpdateLayer: IngestionUpdateLayer; rasterLayerMetadata: RasterLayerMetadata } & IngestionValidationTaskParams,
  isSwapUpdate = false
): ICreateJobBody<IngestionUpdateJobParams | IngestionSwapUpdateJobParams, IngestionValidationTaskParams> => {
  const domain = configMock.get<string>('jobManager.jobDomain');
  const updateJobType = configMock.get<string>('jobManager.ingestionUpdateJobType');
  const swapUpdateJobType = configMock.get<string>('jobManager.ingestionSwapUpdateJobType');
  const validationTaskType = configMock.get<string>('jobManager.validationTaskType');
  const jobTrackerServiceUrl = configMock.get<string>('services.jobTrackerServiceURL');
  const sourceMount = configMock.get<string>('storageExplorer.layerSourceDir');
  const updateJobAction = isSwapUpdate ? swapUpdateJobType : updateJobType;

  const {
    ingestionResolution,
    inputFiles,
    metadata: { classification },
    callbackUrls,
  } = ingestionUpdateLayer;
  const { displayPath, id, productId, productType, productVersion, productName, tileOutputFormat } = rasterLayerMetadata;

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
      inputFiles: {
        gpkgFilesPath: inputFiles.gpkgFilesPath.map((gpkgFilePath) => relative(sourceMount, join(sourceMount, gpkgFilePath))),
        metadataShapefilePath: relative(sourceMount, join(sourceMount, inputFiles.metadataShapefilePath)),
        productShapefilePath: relative(sourceMount, join(sourceMount, inputFiles.productShapefilePath)),
      },
      additionalParams: {
        tileOutputFormat,
        jobTrackerServiceURL: jobTrackerServiceUrl,
        ...(updateJobAction === updateJobType && { displayPath }),
      },
      callbackUrls,
    },
    domain,
    tasks: [
      {
        type: validationTaskType,
        parameters: {
          checksums: checksums.map((checksum) => {
            return { ...checksum, fileName: checksum.fileName };
          }),
        },
      },
    ],
  };
};

export const createNewJobRequest = ({
  ingestionNewLayer,
  checksums,
}: { ingestionNewLayer: IngestionNewLayer } & IngestionValidationTaskParams): ICreateJobBody<
  IngestionNewJobParams,
  IngestionValidationTaskParams
> => {
  const domain = configMock.get<string>('jobManager.jobDomain');
  const ingestionNewJobType = configMock.get<string>('jobManager.ingestionNewJobType');
  const validationTaskType = configMock.get<string>('jobManager.validationTaskType');
  const jobTrackerServiceUrl = configMock.get<string>('services.jobTrackerServiceURL');
  const sourceMount = configMock.get<string>('storageExplorer.layerSourceDir');

  const { ingestionResolution, inputFiles, metadata, callbackUrls } = ingestionNewLayer;

  return {
    resourceId: metadata.productId,
    version: '1.0',
    type: ingestionNewJobType,
    status: OperationStatus.PENDING,
    parameters: {
      inputFiles: {
        gpkgFilesPath: inputFiles.gpkgFilesPath.map((gpkgFilePath) => relative(sourceMount, join(sourceMount, gpkgFilePath))),
        metadataShapefilePath: relative(sourceMount, join(sourceMount, inputFiles.metadataShapefilePath)),
        productShapefilePath: relative(sourceMount, join(sourceMount, inputFiles.productShapefilePath)),
      },
      ingestionResolution,
      metadata,
      additionalParams: {
        jobTrackerServiceURL: jobTrackerServiceUrl,
      },
      callbackUrls,
    },
    productName: metadata.productName,
    productType: metadata.productType,
    domain,
    tasks: [
      {
        type: validationTaskType,
        parameters: {
          checksums: checksums.map((checksum) => {
            return { ...checksum, fileName: checksum.fileName };
          }),
        },
      },
    ],
  };
};
