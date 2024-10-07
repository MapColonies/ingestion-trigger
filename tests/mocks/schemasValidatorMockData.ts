/* eslint-disable @typescript-eslint/no-magic-numbers */

import { ProductType, Transparency } from '@map-colonies/mc-model-types';
import { scaleRange, horizontalAccuracyCE90Range, resolutionDegRange, resolutionMeterRange } from '../../src/ingestion/schemas/constants';

export const fakeDataToValidate = {
  inputFiles: {
    valid: {
      originDirectory: 'sourceDirectory',
      fileNames: ['valid(blueMarble).gpkg'],
    },
    invalid: {
      filesNotSupplied: {
        originDirectory: 'sourceDirectory',
      },
      directoryNotSupplied: {
        fileNames: ['valid(blueMarble).gpkg'],
      },
      tooManyFiles: {
        originDirectory: 'sourceDirectory',
        fileNames: ['invalidCrs(3857).gpkg', 'valid(blueMarble).gpkg'],
      },
      wrongSuffix: {
        originDirectory: 'sourceDirectory',
        fileNames: ['invalidPixelSize(0.8).tiff'],
      },
    },
  },
  infoData: {
    valid: {
      crs: 4326,
      fileFormat: 'gpkg',
      pixelSize: 0.5,
      extentPolygon: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0, 1],
            [1, 1],
            [1, 0],
            [0, 0],
          ],
        ],
      },
    },
    invalid: {
      invalidCrs: {
        crs: 3857,
        fileFormat: 'gpkg',
        pixelSize: 0.5,
        extentPolygon: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [0, 1],
              [1, 1],
              [1, 0],
              [0, 0],
            ],
          ],
        },
      },
      invalidPixelSize: {
        crs: 4326,
        fileFormat: 'gpkg',
        pixelSize: 0.8,
        extentPolygon: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [0, 1],
              [1, 1],
              [1, 0],
              [0, 0],
            ],
          ],
        },
      },
      invalidFileFormat: {
        crs: 4326,
        fileFormat: 'tiff',
        pixelSize: 0.5,
        extentPolygon: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [0, 1],
              [1, 1],
              [1, 0],
              [0, 0],
            ],
          ],
        },
      },
    },
  },
  newLayerRequest: {
    valid: {
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
      partData: [
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
      ],
      inputFiles: {
        originDirectory: 'string',
        fileNames: ['example.gpkg'],
      },
    },
    invalid: {
      metadata: {
        productId: 'invalid !',
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
      partData: [
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
      ],
      inputFiles: {
        originDirectory: 'string',
        fileNames: ['example.gpkg'],
      },
    },
    emptyGeometry: {
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
      partData: [
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
          footprint: {},
        },
      ],
      inputFiles: {
        originDirectory: 'string',
        fileNames: ['example.gpkg'],
      },
    },
  },
  updateLayerRequest: {
    valid: {
      metadata: {
        classification: '6',
      },
      partData: [
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
      ],
      inputFiles: {
        originDirectory: 'string',
        fileNames: ['example.gpkg'],
      },
    },
    invalid: {
      metadata: {
        classification: '1000',
      },
      partData: [
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
      ],
      inputFiles: {
        originDirectory: 'string',
        fileNames: ['example.gpkg'],
      },
    },
    emptyGeometry: {
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
      partData: [
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
          footprint: {},
        },
      ],
      inputFiles: {
        originDirectory: 'string',
        fileNames: ['example.gpkg'],
      },
    },
  },
};
export const infoDataArray = [
  {
    crs: 4326,
    fileFormat: 'gpkg',
    pixelSize: 0.5,
    extentPolygon: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [0, 1],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
      ],
    },
  },
  {
    crs: 4326,
    fileFormat: 'gpkg',
    pixelSize: 0.2,
    extentPolygon: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [0, 2],
          [2, 2],
          [2, 0],
          [0, 0],
        ],
      ],
    },
  },
];

export const expectedExtractedPolygons = [
  {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [0, 1],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
      ],
    },
  },
  {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [0, 2],
          [2, 2],
          [2, 0],
          [0, 0],
        ],
      ],
    },
  },
];

export const expectedCombined = {
  type: 'Feature',
  properties: {
    collectedProperties: [{}, {}],
  },
  geometry: {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [0, 0],
          [0, 1],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
      ],
      [
        [
          [0, 0],
          [0, 2],
          [2, 2],
          [2, 0],
          [0, 0],
        ],
      ],
    ],
  },
};

export const mockMetadata = {
  productId: {
    valid: 'validId_123',
    invalid: 'invalid id!',
  },
  productName: {
    valid: 'ValidProductName',
    invalid: '',
  },
  productType: {
    valid: ProductType.ORTHOPHOTO,
    invalid: 'InvalidType',
  },
  srs: {
    valid: '4326',
    invalid: 'InvalidSRS',
  },
  srsName: {
    valid: 'WGS84GEO',
    invalid: 'InvalidSRSName',
  },
  transparency: {
    valid: Transparency.OPAQUE,
    invalid: 'InvalidTransparency',
  },
  region: {
    valid: ['ValidRegion'],
    invalid: [''],
  },
  classification: {
    valid: '3',
    invalid: '1000',
  },
  producerName: {
    valid: 'ValidProducerName',
    invalid: 12345,
  },
  scale: {
    valid: scaleRange.min,
    invalid: scaleRange.max + 1,
  },
  productSubType: {
    valid: 'ValidProductSubType',
    invalid: 67890,
  },
  description: {
    valid: 'Valid description.',
    invalid: 1234567890,
  },
};

export const mockPart = {
  sourceId: {
    valid: 'part_123',
    invalid: 3,
  },
  sourceName: {
    valid: 'Valid Part Name',
    invalid: '',
  },
  description: {
    valid: 'Valid description.',
    invalid: 12345,
  },
  imagingTimeBeginUTC: {
    valid: new Date('2024-06-18T12:00:00Z'),
    invalid: new Date('2024-06-20T12:00:00Z'), // invalid date (after end date)
  },
  imagingTimeEndUTC: {
    valid: new Date('2024-06-19T12:00:00Z'),
    invalid: new Date('2024-06-01T12:00:00Z'), // invalid date (before begin date)
  },
  resolutionDegree: {
    valid: resolutionDegRange.min as number,
    invalid: (resolutionDegRange.max as number) + 1, // Out of range
  },
  resolutionMeter: {
    valid: resolutionMeterRange.min as number,
    invalid: (resolutionMeterRange.max as number) + 1, // Out of range
  },
  sourceResolutionMeter: {
    valid: resolutionMeterRange.min as number,
    invalid: (resolutionMeterRange.max as number) + 1, // Out of range
  },
  horizontalAccuracyCE90: {
    valid: horizontalAccuracyCE90Range.min,
    invalid: horizontalAccuracyCE90Range.max + 1, // Out of range
  },
  sensors: {
    valid: ['SensorA', 'SensorB'],
    invalid: [],
  },
  countries: {
    valid: ['CountryA', 'CountryB'],
    invalid: [123],
  },
  cities: {
    valid: ['CityA', 'CityB'],
    invalid: ['', ''], // Empty strings, violate min length
  },
  footprint: {
    valid: {
      type: 'Polygon',
      coordinates: [
        [
          [34.61517, 34.10156],
          [34.61517, 32.242124],
          [36.4361539, 32.242124],
          [36.4361539, 34.10156],
          [34.61517, 34.10156],
        ],
      ],
    },
    invalid: {},
  },
};
