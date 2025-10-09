/* eslint-disable @typescript-eslint/no-magic-numbers */
import { join, normalize } from 'node:path';
import { faker, fakerHE } from '@faker-js/faker';
import { RecordType, TileOutputFormat } from '@map-colonies/mc-model-types';
import { CORE_VALIDATIONS, INGESTION_VALIDATIONS, RasterProductTypes, Transparency } from '@map-colonies/raster-shared';
import merge from 'lodash.merge';
import { randexp } from 'randexp';
import type { IFindResponseRecord } from '../../src/common/interfaces';
import type { IngestionNewLayer } from '../../src/ingestion/schemas/ingestionLayerSchema';
import type { InputFiles } from '../../src/ingestion/schemas/inputFilesSchema';
import type { IngestionNewMetadata } from '../../src/ingestion/schemas/newMetadataSchema';
import type { IngestionUpdateLayer } from '../../src/ingestion/schemas/updateLayerSchema';
import type { IngestionUpdateMetadata } from '../../src/ingestion/schemas/updateMetadataSchema';
import type { DeepPartial } from './types';

// adjust path to test files location
const TEST_FILES_RELATIVE_PATH = '../mocks/testFiles';
const TEST_FILES_ABSOLUTE_PATH = normalize(`${__dirname}/${TEST_FILES_RELATIVE_PATH}`);

const generateNewLayerMetadata = (): IngestionNewMetadata => {
  return {
    classification: faker.number.int({ max: 100 }).toString(),
    productId: randexp(INGESTION_VALIDATIONS.productId.pattern),
    productName: faker.string.alphanumeric({ length: { min: 1, max: 100 } }),
    productType: faker.helpers.enumValue(RasterProductTypes),
    region: faker.helpers.multiple(() => fakerHE.string.alphanumeric({ length: { min: 1, max: 100 } }), { count: { min: 1, max: 100 } }),
    srs: '4326',
    srsName: 'WGS84GEO',
    transparency: faker.helpers.enumValue(Transparency),
    description: faker.helpers.maybe(() => fakerHE.string.alphanumeric({ length: { min: 0, max: 100 } })),
    producerName: faker.helpers.maybe(() => fakerHE.string.alphanumeric({ length: { min: 0, max: 100 } })),
    productSubType: faker.helpers.maybe(() => fakerHE.string.alphanumeric({ length: { min: 0, max: 100 } })),
    scale: faker.helpers.maybe(() => faker.number.int({ min: INGESTION_VALIDATIONS.scale.min, max: INGESTION_VALIDATIONS.scale.max })),
  };
};
const generateNewLayerRequest = (): IngestionNewLayer => {
  return {
    callbackUrls: faker.helpers.multiple(() => faker.internet.url({ protocol: faker.helpers.arrayElement(['http', 'https']) })),
    ingestionResolution: faker.number.float({
      min: CORE_VALIDATIONS.resolutionDeg.min,
      max: CORE_VALIDATIONS.resolutionDeg.max,
    }),
    inputFiles: generateInputFiles(),
    metadata: generateNewLayerMetadata(),
  };
};

const generateUpdateLayerMetadata = (): IngestionUpdateMetadata => {
  return {
    classification: faker.number.int({ max: 100 }).toString(),
  };
};
const generateUpdateLayerRequest = (): IngestionUpdateLayer => {
  return {
    callbackUrls: faker.helpers.multiple(() => faker.internet.url({ protocol: faker.helpers.arrayElement(['http', 'https']) })),
    ingestionResolution: faker.number.float({
      min: CORE_VALIDATIONS.resolutionDeg.min,
      max: CORE_VALIDATIONS.resolutionDeg.max,
    }),
    inputFiles: generateInputFiles(),
    metadata: generateUpdateLayerMetadata(),
  };
};

const getTestFilePath = (inputFiles: InputFiles): InputFiles => {
  const { gpkgFilesPath, metadataShapefilePath, productShapefilePath } = inputFiles;
  return {
    gpkgFilesPath: [join(TEST_FILES_ABSOLUTE_PATH, 'gpkg', gpkgFilesPath[0])],
    metadataShapefilePath: join(TEST_FILES_ABSOLUTE_PATH, 'metadata', metadataShapefilePath, 'ShapeMetadata.zip'),
    productShapefilePath: join(TEST_FILES_ABSOLUTE_PATH, 'product', productShapefilePath, 'Product.zip'),
  };
};
const generateInputFiles = (): InputFiles => {
  return {
    // TODO: since we don't want the FS module to go to random potentially harmful places
    // we should limit this response
    gpkgFilesPath: [join(faker.system.directoryPath(), fakerHE.system.commonFileName('gpkg'))],
    metadataShapefilePath: join(faker.system.directoryPath(), 'ShapeMetadata.zip'),
    productShapefilePath: join(faker.system.directoryPath(), 'Product.zip'),
  };
};
// TODO: implement, take request as input
export const generateCatalogLayer = (): IFindResponseRecord => {
  return {
    id: faker.string.uuid(),
    links: faker.helpers.arrayElements([
      {
        name: 'blueMarble_test_2-Orthophoto',
        protocol: 'WMS',
        url: 'https://tiles-dev/api/raster/v1/service?REQUEST=GetCapabilities',
      },
      {
        name: 'blueMarble_test_2-Orthophoto',
        protocol: 'WMS_BASE',
        url: 'https://tiles-dev/api/raster/v1/wms',
      },
      {
        name: 'blueMarble_test_2-Orthophoto',
        protocol: 'WMTS',
        url: 'https://tiles-dev/api/raster/v1/wmts/1.0.0/WMTSCapabilities.xml',
      },
      {
        name: 'blueMarble_test_2-Orthophoto',
        protocol: 'WMTS_KVP',
        url: 'https://tiles-dev/api/raster/v1/service?REQUEST=GetCapabilities&SERVICE=WMTS',
      },
      {
        name: 'blueMarble_test_2-Orthophoto',
        protocol: 'WMTS_BASE',
        url: 'https://tiles-dev/api/raster/v1/wmts',
      },
    ]),
    metadata: {
      id: '14460cdd-44ae-4a04-944f-29e907b6cd2a',
      type: RecordType.RECORD_RASTER,
      classification: '3',
      productName: 'blueMarble_test_2',
      description: 'string',
      srs: 'string',
      producerName: 'string',
      creationDateUTC: new Date('2022-10-25T10:44:42.787Z'),
      ingestionDate: new Date('2024-05-12T07:36:50.880Z'),
      updateDateUTC: new Date('2024-05-12T04:36:50.880Z'),
      imagingTimeBeginUTC: new Date('2022-10-25T10:44:42.787Z'),
      imagingTimeEndUTC: new Date('2022-10-25T10:44:42.787Z'),
      minHorizontalAccuracyCE90: 4000,
      sensors: ['string'],
      region: ['string'],
      productId: 'blueMarble_test_2',
      productVersion: '1.0',
      productType: RasterProductTypes.ORTHOPHOTO,
      productSubType: 'string',
      srsName: 'string',
      maxResolutionDeg: 0.072,
      maxResolutionMeter: 8000,
      rms: 0,
      scale: 100000000,
      footprint: {
        type: 'Polygon',
        coordinates: [
          [
            [-180, -90],
            [-180, 90],
            [180, 90],
            [180, -90],
            [-180, -90],
          ],
        ],
      },
      productBoundingBox: '-180,-90,180,90',
      displayPath: 'd698bf1d-bb66-4292-a8b4-524cbeadf36f',
      transparency: Transparency.TRANSPARENT,
      tileMimeFormat: 'image/png',
      tileOutputFormat: TileOutputFormat.PNG,
      maxHorizontalAccuracyCE90: 4000,
      minResolutionDeg: 0.703125,
      minResolutionMeter: 78271.52,
    },
  };
};
export const createNewLayerRequest = (newLayerRequest: DeepPartial<IngestionNewLayer> & Pick<IngestionNewLayer, 'inputFiles'>): IngestionNewLayer => {
  const template = structuredClone(newLayerRequest);
  template.inputFiles = getTestFilePath(template.inputFiles);
  const mergedNewLayerRequest = merge(generateNewLayerRequest(), template);
  return mergedNewLayerRequest;
};
export const createUpdateLayerRequest = (
  newLayerRequest: DeepPartial<IngestionUpdateLayer> & Pick<IngestionNewLayer, 'inputFiles'>
): IngestionUpdateLayer => {
  const template = structuredClone(newLayerRequest);
  template.inputFiles = getTestFilePath(template.inputFiles);
  const mergedNewLayerRequest = merge(generateUpdateLayerRequest(), template);
  return mergedNewLayerRequest;
};
