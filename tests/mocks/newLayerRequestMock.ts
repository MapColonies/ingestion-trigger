/* eslint-disable @typescript-eslint/no-magic-numbers */
import { InputFiles, ProductType, Transparency, NewRasterLayerMetadata, PolygonPart } from '@map-colonies/mc-model-types';
import { ICreateJobResponse } from '@map-colonies/mc-priority-queue';

export const newLayerRequest = {
  valid: {
    metadata: {
      productId: 'c5e3f820-b2bd-4f0b-a70f-c98bf33b2691',
      productName: 'string',
      productType: ProductType.ORTHOPHOTO,
      productSubType: 'string',
      description: 'string',
      srs: '4326',
      srsName: 'WGS84Geo',
      transparency: Transparency.TRANSPARENT,
      region: ['string'],
      classification: '6',
      producerName: 'string',
      scale: 100000000,
    } as NewRasterLayerMetadata,
    partData: [
      {
        id: 'c5e3f820-b2bd-4f0b-a70f-c98bf33b2692',
        name: 'string',
        imagingTimeBeginUTC: new Date('2024-06-17T12:00:00Z'),
        imagingTimeEndUTC: new Date('2024-06-18T12:00:00Z'),
        resolutionDegree: 0.703125,
        resolutionMeter: 8000,
        sourceResolutionMeter: 8000,
        horizontalAccuracyCE90: 10,
        sensors: ['string'],
        countries: ['string'],
        cities: ['string'],
        description: 'string',
        geometry: {
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
    ] as PolygonPart[],
    inputFiles: {
      originDirectory: 'test_files',
      fileNames: ['valid(blueMarble).gpkg'],
    } as InputFiles,
  },
  invalid: {
    metadata: {
      productId: 'invalid !',
      productName: 'string',
      productType: 'Orthophoto',
      productSubType: 'string',
      description: 'string',
      srs: '4326',
      srsName: 'WGS84Geo',
      transparency: 'TRANSPARENT',
      region: ['string'],
      classification: '6',
      producerName: 'string',
      scale: 100000000,
    },
    partData: [
      {
        id: 'invalid !',
        name: 'string',
        imagingTimeBeginUTC: new Date('2024-06-17T12:00:00Z'),
        imagingTimeEndUTC: new Date('2024-06-18T12:00:00Z'),
        resolutionDegree: 0.703125,
        resolutionMeter: 8000,
        sourceResolutionMeter: 8000,
        horizontalAccuracyCE90: 10,
        sensors: ['string'],
        countries: ['string'],
        cities: ['string'],
        description: 'string',
        geometry: {
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
      originDirectory: 'string',
      fileNames: ['example.gpkg'],
    },
  },
};

export const jobResponse: ICreateJobResponse = {
  id: 'job_id',
  taskIds: ['task_id'],
};
