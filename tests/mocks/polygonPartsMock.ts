/* eslint-disable @typescript-eslint/no-magic-numbers */
import { PolygonPart } from '@map-colonies/mc-model-types';
import { InfoDataWithFile } from '../../src/ingestion/schemas/infoDataSchema';

export const polygonPartsMock = {
  valid: [
    {
      sourceId: 'string',
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
    {
      sourceId: 'another-id',
      sourceName: 'another-string',
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
    {
      sourceId: 'third-id',
      sourceName: 'another-string',
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
              [34.85149443279957, 32.30543192283443],
              [34.85149443279957, 32.29430955805424],
              [34.86824157112912, 32.29430955805424],
              [34.86824157112912, 32.30543192283443],
              [34.85149443279957, 32.30543192283443],
            ],
          ],
        ],
      },
    },
  ] as PolygonPart[],
  invalid: {
    notValidGeometry: [
      {
        sourceId: 'string',
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
    notContainedGeometry: [
      {
        sourceId: 'string',
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
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [200, 100],
              [200, 80],
              [220, 80],
              [220, 100],
              [200, 100],
            ],
          ],
        },
      },
    ] as PolygonPart[],
    notContainedMultiPolygon: [
      {
        sourceId: 'string',
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
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [200, 100],
                [200, 80],
                [220, 80],
                [220, 100],
                [200, 100],
              ],
            ],
          ],
        },
      },
    ] as PolygonPart[],
    notValidResolutionDeg: [
      {
        sourceId: 'string',
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
      {
        sourceId: 'another-id',
        sourceName: 'another-string',
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
      {
        sourceId: 'third-id',
        sourceName: 'another-string',
        imagingTimeBeginUTC: new Date('2024-06-17T12:00:00Z'),
        imagingTimeEndUTC: new Date('2024-06-18T12:00:00Z'),
        resolutionDegree: 0.01,
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
                [34.85149443279957, 32.30543192283443],
                [34.85149443279957, 32.29430955805424],
                [34.86824157112912, 32.29430955805424],
                [34.86824157112912, 32.30543192283443],
                [34.85149443279957, 32.30543192283443],
              ],
            ],
          ],
        },
      },
    ] as PolygonPart[],
  },
};

export const infoDataMock = [
  {
    crs: 4326,
    extentPolygon: {
      coordinates: [
        [
          [-180, 90],
          [-180, -90],
          [180, -90],
          [180, 90],
          [-180, 90],
        ],
      ],
      type: 'Polygon',
    },
    fileFormat: 'GPKG',
    pixelSize: 0.0439453125,
    fileName: 'example.gpkg',
  },
] as InfoDataWithFile[];
