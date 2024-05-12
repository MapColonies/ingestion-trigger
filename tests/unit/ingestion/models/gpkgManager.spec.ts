import jsLogger from '@map-colonies/js-logger';
import { IConfig } from 'config'; // Import the correct type for IConfig
import { GpkgManager } from '../../../../src/ingestion/models/gpkgManager';
import { configMock, registerDefaultConfig } from '../../../mocks/configMock';
import { fakeIngestionSources } from '../../../mocks/sourcesRequestBody';
import { InvalidIndexError, UnsupportedGridError, UnsupportedTileSizeError } from '../../../../src/serviceClients/database/errors';

describe('GpkgManager', () => {
  let gpkgManager: GpkgManager;
  let validateGpkgIndexSpy: jest.SpyInstance;
  let validateGpkgGridSpy: jest.SpyInstance;
  let validateTilesSizeSpy: jest.SpyInstance;

  beforeEach(() => {
    gpkgManager = new GpkgManager(configMock as unknown as IConfig, jsLogger({ enabled: false }));
    validateGpkgIndexSpy = jest.spyOn(gpkgManager as unknown as { validateGpkgIndex: jest.Mock }, 'validateGpkgIndex');
    validateGpkgGridSpy = jest.spyOn(gpkgManager as unknown as { validateGpkgGrid: jest.Mock }, 'validateGpkgGrid');
    validateTilesSizeSpy = jest.spyOn(gpkgManager as unknown as { validateTilesSize: jest.Mock }, 'validateTilesSize');

    registerDefaultConfig();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateGpkgFiles', () => {
    it('should validate GPKG files and not throw errors', () => {
      const validInputFiles = fakeIngestionSources.validSources.validInputFiles;
      const { originDirectory, fileNames } = validInputFiles;

      validateGpkgIndexSpy.mockImplementation(() => undefined);
      validateGpkgGridSpy.mockImplementation(() => undefined);
      validateTilesSizeSpy.mockImplementation(() => undefined);

      gpkgManager.validateGpkgFiles(originDirectory, fileNames);

      expect(validateGpkgIndexSpy).toHaveBeenCalledWith(originDirectory, fileNames);
      expect(validateGpkgIndexSpy).not.toThrow();
      expect(validateGpkgGridSpy).toHaveBeenCalledWith(originDirectory, fileNames);
      expect(validateGpkgGridSpy).not.toThrow();
      expect(validateTilesSizeSpy).toHaveBeenCalledWith(originDirectory, fileNames);
      expect(validateTilesSizeSpy).not.toThrow();
    });

    it('should throw InvalidIndexError if GPKG index does not exist', () => {
      const inputFiles = fakeIngestionSources.invalidSources.withoutGpkgIndex;
      const { originDirectory, fileNames } = inputFiles;

      expect(() => gpkgManager.validateGpkgFiles(originDirectory, fileNames)).toThrow(InvalidIndexError);
      expect(validateGpkgIndexSpy).toHaveBeenCalledWith(originDirectory, fileNames);
    });

    it('should throw UnsupportedGridError if grid type is not supported', () => {
      const inputFiles = fakeIngestionSources.invalidSources.unsupportedGrid;
      const { originDirectory, fileNames } = inputFiles;

      expect(() => gpkgManager.validateGpkgFiles(originDirectory, fileNames)).toThrow(UnsupportedGridError);
      expect(validateGpkgGridSpy).toHaveBeenCalledWith(originDirectory, fileNames);
    });

    it('should throw UnsupportedTileSizeError if tile size is not supported', () => {
      const inputFiles = fakeIngestionSources.invalidSources.unsupportedTileSize;
      const { originDirectory, fileNames } = inputFiles;

      expect(() => gpkgManager.validateGpkgFiles(originDirectory, fileNames)).toThrow(UnsupportedTileSizeError);
      expect(validateTilesSizeSpy).toHaveBeenCalledWith(originDirectory, fileNames);
    });
  });
});
