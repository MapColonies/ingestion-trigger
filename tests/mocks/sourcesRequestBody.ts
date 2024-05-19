// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function getFakeIngestionSources() {
  const sourceDirectory = 'test_files';
  return {
    validSources: {
      validInputFiles: {
        originDirectory: sourceDirectory,
        fileNames: ['valid(blueMarble).gpkg'],
      },
    },
    invalidSources: {
      filesNotExist: {
        originDirectory: sourceDirectory,
        fileNames: ['notExist.gpkg'],
      },
      directoryNotExist: {
        originDirectory: 'notDirectory',
        fileNames: ['valid(blueMarble).gpkg'],
      },
      unsupportedCrs: {
        originDirectory: sourceDirectory,
        fileNames: ['invalidCrs(3857).gpkg'],
      },
      unsupportedPixelSize: {
        originDirectory: sourceDirectory,
        fileNames: ['invalidPixelSize(0.8).gpkg'],
      },
      withoutGpkgIndex: {
        originDirectory: sourceDirectory,
        fileNames: ['withoutGpkgIndex.gpkg'],
      },
      unsupportedGrid: {
        originDirectory: sourceDirectory,
        fileNames: ['unsupportedGridMatrix.gpkg'],
      },
      unsupportedTileWidthSize: {
        originDirectory: sourceDirectory,
        fileNames: ['unsupportedTileSize(width=512).gpkg'],
      },
      unsupportedTileHeightSize: {
        originDirectory: sourceDirectory,
        fileNames: ['unsupportedTileSize(height=512).gpkg'],
      },
    },
    invalidValidation: {
      tooManyFiles: {
        originDirectory: sourceDirectory,
        fileNames: ['blueMarble.gpkg', 'other.gpkg'],
      },
      noFiles: {
        originDirectory: sourceDirectory,
        fileNames: [],
      },
      noDirectory: {
        originDirectory: '',
        fileNames: ['blueMarble.gpkg'],
      },
      notGpkg: {
        originDirectory: sourceDirectory,
        fileNames: ['blueMarble.tif'],
      },
    },
  };
}

export const fakeIngestionSources = getFakeIngestionSources();

export type FakeIngestionSources = ReturnType<typeof getFakeIngestionSources>;
