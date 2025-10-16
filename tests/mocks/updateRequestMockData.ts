/* eslint-disable @typescript-eslint/no-magic-numbers */
import { TileOutputFormat } from '@map-colonies/mc-model-types';
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { RasterProductTypes } from '@map-colonies/raster-shared';
import type { IngestionUpdateLayer } from '../../src/ingestion/schemas/updateLayerSchema';
import { createCatalogLayerResponse, createUpdateLayerRequest } from './mockFactory';

export const validUpdateLayerRequest = {
  valid: createUpdateLayerRequest({
    inputFiles: {
      gpkgFilesPath: ['validIndexed.gpkg'],
      productShapefilePath: 'validIndexed',
      metadataShapefilePath: 'validIndexed',
    },
  }),
} satisfies Record<string, IngestionUpdateLayer>;

export const invalidUpdateLayerRequest = {
  metadata: createUpdateLayerRequest({
    metadata: { classification: '' },
    inputFiles: {
      gpkgFilesPath: ['validIndexed.gpkg'],
      metadataShapefilePath: 'validIndexed',
      productShapefilePath: 'validIndexed',
    },
  }),
  notContainedPolygon: createUpdateLayerRequest({
    inputFiles: {
      gpkgFilesPath: ['validIndexed.gpkg'],
      metadataShapefilePath: 'validIndexed',
      productShapefilePath: 'blueMarble',
    },
  }),
  gdalInfo: createUpdateLayerRequest({
    inputFiles: { gpkgFilesPath: ['invalidCrs-3857.gpkg'], metadataShapefilePath: 'validIndexed', productShapefilePath: 'validIndexed' },
  }),
} satisfies Record<string, IngestionUpdateLayer>;

export const updateSwapJobRequest = {
  resourceId: 'blueMarble_test_2',
  version: '2.0',
  internalId: '14460cdd-44ae-4a04-944f-29e907b6cd2a',
  type: 'Ingestion_Swap_Update',
  productName: 'blueMarble_test_2',
  productType: RasterProductTypes.RASTER_VECTOR_BEST,
  status: 'Pending',
  parameters: {
    metadata: {
      classification: '6',
    },
    partsData: [
      {
        sourceId: 'c5e3f820-b2bd-4f0b-a70f-c98bf33b2692',
        sourceName: 'string',
        imagingTimeBeginUTC: '2024-06-17T12:00:00.000Z',
        imagingTimeEndUTC: '2024-06-18T12:00:00.000Z',
        resolutionDegree: 0.703125,
        resolutionMeter: 8000,
        sourceResolutionMeter: 8000,
        horizontalAccuracyCE90: 10,
        sensors: ['string'],
        countries: ['string'],
        cities: ['string'],
        description: 'string',
        footprint: {
          type: 'Polygon',
          coordinates: [
            [
              [34.85149443279957, 32.30543192283443],
              [34.85149443279957, 32.29430955805424],
              [34.86824157112912, 32.29430955805424],
              [34.86824157112912, 32.30543192283443],
              [34.85149443279957, 32.30543192283443],
            ],
          ],
        },
      },
    ],
    inputFiles: {
      originDirectory: 'testFiles',
      fileNames: ['validBlueMarble.gpkg'],
    },
    additionalParams: {
      tileOutputFormat: TileOutputFormat.PNG,
      jobTrackerServiceURL: 'http://jobTrackerServiceUrl',
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
    },
  },
  domain: 'RASTER',
  tasks: [
    {
      type: 'init',
      parameters: {
        blockDuplication: true,
      },
    },
  ],
};

export const updateRunningJobResponse = [{ status: OperationStatus.IN_PROGRESS, type: 'Ingestion_New' }];
export type RasterTypes<T extends RasterProductTypes> = `${T}`;
export type DataValues = RasterTypes<RasterProductTypes>;

export const updateJobRequest = {
  resourceId: 'blueMarble_test_2',
  version: '2.0',
  internalId: '14460cdd-44ae-4a04-944f-29e907b6cd2a',
  type: 'Ingestion_Update',
  productName: 'blueMarble_test_2',
  productType: RasterProductTypes.ORTHOPHOTO,
  status: 'Pending',
  parameters: {
    metadata: {
      classification: '6',
    },
    partsData: [
      {
        sourceId: 'c5e3f820-b2bd-4f0b-a70f-c98bf33b2692',
        sourceName: 'string',
        imagingTimeBeginUTC: '2024-06-17T12:00:00.000Z',
        imagingTimeEndUTC: '2024-06-18T12:00:00.000Z',
        resolutionDegree: 0.703125,
        resolutionMeter: 8000,
        sourceResolutionMeter: 8000,
        horizontalAccuracyCE90: 10,
        sensors: ['string'],
        countries: ['string'],
        cities: ['string'],
        description: 'string',
        footprint: {
          type: 'Polygon',
          coordinates: [
            [
              [34.85149443279957, 32.30543192283443],
              [34.85149443279957, 32.29430955805424],
              [34.86824157112912, 32.29430955805424],
              [34.86824157112912, 32.30543192283443],
              [34.85149443279957, 32.30543192283443],
            ],
          ],
        },
      },
    ],
    inputFiles: {
      originDirectory: 'testFiles',
      fileNames: ['validBlueMarble.gpkg'],
    },
    additionalParams: {
      tileOutputFormat: TileOutputFormat.PNG,
      displayPath: 'd698bf1d-bb66-4292-a8b4-524cbeadf36f',
      jobTrackerServiceURL: 'http://jobTrackerServiceUrl',
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
    },
  },
  domain: 'RASTER',
  tasks: [
    {
      type: 'init',
      parameters: {
        blockDuplication: true,
      },
    },
  ],
};

export const updatedLayer = createCatalogLayerResponse();
export const updatedSwapLayer = createCatalogLayerResponse({ metadata: { productSubType: 'testProductSubType' } });
