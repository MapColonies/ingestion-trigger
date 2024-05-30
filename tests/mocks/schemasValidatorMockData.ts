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
};
