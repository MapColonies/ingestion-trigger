/* eslint-disable @typescript-eslint/no-magic-numbers */

export const expectedGdalUtilitiesValues = {
  validResponse: {
    crs: 4326,
    fileFormat: 'GPKG',
    pixelSize: 0.001373291015625,
    extentPolygon: {
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
  },
  validResponseZoom21: {
    crs: 4326,
    fileFormat: 'GPKG',
    pixelSize: 0.000000335276126861572,
    extentPolygon: {
      type: 'Polygon',
      coordinates: [
        [
          [34.4870513, 31.5316438],
          [34.4870513, 31.5297716],
          [34.4892373, 31.5297716],
          [34.4892373, 31.5316438],
          [34.4870513, 31.5316438],
        ],
      ],
    },
  },
};
