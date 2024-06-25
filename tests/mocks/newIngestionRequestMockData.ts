/* eslint-disable @typescript-eslint/no-magic-numbers */
import { InputFiles, ProductType, Transparency, NewRasterLayerMetadata, PolygonPart } from '@map-colonies/mc-model-types';
import { ICreateJobResponse, OperationStatus } from '@map-colonies/mc-priority-queue';

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
      } as NewRasterLayerMetadata,
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
      ] as PolygonPart[],
      inputFiles: {
        originDirectory: 'string',
        fileNames: ['example.gpkg'],
      } as InputFiles,
    },
    notContainedPolygon: {
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
    notContainedMultiPolygon: {
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
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [-180, -90],
                  [-180, 90],
                  [180, 90],
                  [180, -90],
                  [-180, -90],
                ],
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
        fileNames: ['invalidCrs(3857).gpkg'],
      } as InputFiles,
    },
    invalidPartDataGeometry: {
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
  },
};

export const jobResponse: ICreateJobResponse = {
  id: 'job_id',
  taskIds: ['task_id'],
};

export const runningJobResponse = [{ status: OperationStatus.IN_PROGRESS, type: 'export' }];

export const newJobRequest = {
  resourceId: 'c5e3f820-b2bd-4f0b-a70f-c98bf33b2691',
  version: '1.0',
  type: 'Ingestion_New',
  status: 'Pending',
  parameters: {
    metadata: {
      productId: 'c5e3f820-b2bd-4f0b-a70f-c98bf33b2691',
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
        id: 'c5e3f820-b2bd-4f0b-a70f-c98bf33b2692',
        name: 'string',
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
      originDirectory: 'test_files',
      fileNames: ['valid(blueMarble).gpkg'],
    },
  },
  productName: 'string',
  productType: 'Orthophoto',
  domain: 'RASTER',
  tasks: [
    {
      type: 'init',
      parameters: {
        rasterIngestionLayer: {
          metadata: {
            productId: 'c5e3f820-b2bd-4f0b-a70f-c98bf33b2691',
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
              id: 'c5e3f820-b2bd-4f0b-a70f-c98bf33b2692',
              name: 'string',
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
            originDirectory: 'test_files',
            fileNames: ['valid(blueMarble).gpkg'],
          },
        },
        blockDuplication: true,
      },
    },
  ],
};
