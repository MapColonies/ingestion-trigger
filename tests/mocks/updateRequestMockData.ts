/* eslint-disable @typescript-eslint/no-magic-numbers */
import { InputFiles, PolygonPart, TileOutputFormat } from '@map-colonies/mc-model-types';
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { RasterProductTypes, type UpdateRasterLayerMetadata } from '@map-colonies/raster-shared';
import { Polygon } from 'geojson';

export const updateLayerRequest = {
  valid: {
    metadata: {
      classification: '6',
    } as UpdateRasterLayerMetadata,
    partsData: [
      {
        sourceId: 'c5e3f820-b2bd-4f0b-a70f-c98bf33b2692',
        sourceName: 'string',
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
    ] as PolygonPart[],
    inputFiles: {
      originDirectory: 'test_files',
      fileNames: ['valid(blueMarble).gpkg'],
    } as InputFiles,
  },
  invalid: {
    metadata: {
      metadata: {
        classification: '1000',
      } as UpdateRasterLayerMetadata,
      partsData: [
        {
          sourceId: 'invalid !',
          sourceName: 'string',
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
      ] as PolygonPart[],
      inputFiles: {
        originDirectory: 'string',
        fileNames: ['example.gpkg'],
      } as InputFiles,
    },
    notContainedPolygon: {
      metadata: {
        classification: '6',
      } as UpdateRasterLayerMetadata,
      partsData: [
        {
          sourceId: 'c5e3f820-b2bd-4f0b-a70f-c98bf33b2692',
          sourceName: 'string',
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
      ] as PolygonPart[],
      inputFiles: {
        originDirectory: 'test_files',
        fileNames: ['(valid)indexed.gpkg'],
      } as InputFiles,
    },
    gdalInfo: {
      metadata: {
        classification: '6',
      } as UpdateRasterLayerMetadata,
      partsData: [
        {
          sourceId: 'c5e3f820-b2bd-4f0b-a70f-c98bf33b2692',
          sourceName: 'string',
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
      ] as PolygonPart[],
      inputFiles: {
        originDirectory: 'test_files',
        fileNames: ['invalidCrs(3857).gpkg'],
      } as InputFiles,
    },
  },
};

export const updateRunningJobResponse = [{ status: OperationStatus.IN_PROGRESS, type: 'Ingestion_New' }];

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
      originDirectory: 'test_files',
      fileNames: ['valid(blueMarble).gpkg'],
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

export const updatedLayer = {
  links: [
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
  ],
  metadata: {
    id: '14460cdd-44ae-4a04-944f-29e907b6cd2a',
    type: 'RECORD_RASTER',
    classification: '3',
    productName: 'blueMarble_test_2',
    description: 'string',
    srsId: 'string',
    producerName: 'string',
    creationDate: '2022-10-25T10:44:42.787Z',
    ingestionDate: '2024-05-12T07:36:50.880Z',
    updateDate: '2024-05-12T04:36:50.880Z',
    sourceDateStart: '2022-10-25T10:44:42.787Z',
    sourceDateEnd: '2022-10-25T10:44:42.787Z',
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
    } as Polygon,
    includedInBests: [],
    productBoundingBox: '-180,-90,180,90',
    displayPath: 'd698bf1d-bb66-4292-a8b4-524cbeadf36f',
    transparency: 'TRANSPARENT',
    tileMimeFormat: 'image/png',
    tileOutputFormat: TileOutputFormat.PNG,
  },
};

export const updatedSwapLayer = {
  links: [
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
  ],
  metadata: {
    id: '14460cdd-44ae-4a04-944f-29e907b6cd2a',
    type: 'RECORD_RASTER',
    classification: '3',
    productName: 'blueMarble_test_2',
    description: 'string',
    srsId: 'string',
    producerName: 'string',
    creationDate: '2022-10-25T10:44:42.787Z',
    ingestionDate: '2024-05-12T07:36:50.880Z',
    updateDate: '2024-05-12T04:36:50.880Z',
    sourceDateStart: '2022-10-25T10:44:42.787Z',
    sourceDateEnd: '2022-10-25T10:44:42.787Z',
    minHorizontalAccuracyCE90: 4000,
    sensors: ['string'],
    region: ['string'],
    productId: 'blueMarble_test_2',
    productVersion: '1.0',
    productType: RasterProductTypes.RASTER_VECTOR_BEST,
    productSubType: 'testProductSubType',
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
    includedInBests: [],
    productBoundingBox: '-180,-90,180,90',
    displayPath: 'd698bf1d-bb66-4292-a8b4-524cbeadf36f',
    transparency: 'TRANSPARENT',
    tileMimeFormat: 'image/png',
    tileOutputFormat: 'PNG',
  },
};

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
      originDirectory: 'test_files',
      fileNames: ['valid(blueMarble).gpkg'],
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
