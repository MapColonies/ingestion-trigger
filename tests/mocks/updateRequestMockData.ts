/* eslint-disable @typescript-eslint/no-magic-numbers */
import { OperationStatus } from '@map-colonies/mc-priority-queue';
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

export const updateRunningJobResponse = [{ status: OperationStatus.IN_PROGRESS, type: 'Ingestion_New' }];

export const updatedLayer = createCatalogLayerResponse();
export const updatedSwapLayer = createCatalogLayerResponse({ metadata: { productSubType: 'testProductSubType' } });
