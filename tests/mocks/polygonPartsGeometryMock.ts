/* eslint-disable @typescript-eslint/no-magic-numbers */
import { PolygonPart } from '@map-colonies/mc-model-types';
import { InfoData } from '../../src/ingestion/schemas/infoDataSchema';

export const polygonPartsMock = {
  valid: [
    {
      id: 'string',
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
    {
      id: 'another-id',
      name: 'another-string',
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
  invalid: {
    notValidGeometry: [
      {
        id: 'string',
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
    notContainedGeometry: [
      {
        id: 'string',
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
  },
] as InfoData[];
