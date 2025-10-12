/* eslint-disable @typescript-eslint/no-magic-numbers */
import { ICreateJobResponse, OperationStatus } from '@map-colonies/mc-priority-queue';
import type { IngestionNewLayer } from '../../src/ingestion/schemas/ingestionLayerSchema';
import { createNewLayerRequest } from '../utils/faker';

export const validNewLayerRequest = {
  valid: createNewLayerRequest({
    inputFiles: {
      gpkgFilesPath: ['(valid)indexed.gpkg'],
      productShapefilePath: '(valid)indexed',
      metadataShapefilePath: '(valid)indexed',
    },
  }),
} satisfies Record<PropertyKey, IngestionNewLayer>;

export const invalidNewLayerRequest = {
  metadata: createNewLayerRequest({
    metadata: { productId: 'invalid !' },
    inputFiles: {
      gpkgFilesPath: ['(valid)indexed.gpkg'],
      productShapefilePath: '(valid)indexed',
      metadataShapefilePath: '(valid)indexed',
    },
  }),
  notContainedPolygon: createNewLayerRequest({
    inputFiles: {
      gpkgFilesPath: ['(valid)indexed.gpkg'],
      productShapefilePath: '(valid)indexed',
      metadataShapefilePath: 'blueMarble',
    },
  }),
  gdalInfo: createNewLayerRequest({
    inputFiles: { gpkgFilesPath: ['invalidCrs(3857).gpkg'], metadataShapefilePath: '(valid)indexed', productShapefilePath: '(valid)indexed' },
  }),
} satisfies Record<string, IngestionNewLayer>;

export const jobResponse: ICreateJobResponse = {
  id: 'job_id',
  taskIds: ['task_id'],
};

export const runningJobResponse = [{ status: OperationStatus.IN_PROGRESS, type: 'export' }];

export const newJobRequest = {
  resourceId: 'BLUE_2',
  version: '1.0',
  type: 'Ingestion_New',
  status: 'Pending',
  parameters: {
    metadata: {
      productId: 'BLUE_2',
      productName: 'string',
      productType: 'Orthophoto',
      productSubType: 'string',
      description: 'string',
      srs: '4326',
      srsName: 'WGS84GEO',
      transparency: 'TRANSPARENT',
      region: ['string'],
      classification: '6',
      producerName: 'string',
      scale: 100000000,
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
      fileNames: ['valid(blueMarble).gpkg'],
    },
    additionalParams: {
      jobTrackerServiceURL: 'http://jobTrackerServiceUrl',
    },
  },
  productName: 'string',
  productType: 'Orthophoto',
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
