import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { GpkgManager } from '../../../../src/ingestion/models/gpkgManager';
import config from 'config';
import { registerDefaultConfig } from '../../../mocks/configMock';
import { mockInputFiles } from '../../../mocks/sourcesRequestBody';
import { InvalidIndexError, UnsupportedGridError, UnsupportedTileSizeError } from '../../../../src/serviceClients/database/errors';
import { SQLiteClient } from '../../../../src/serviceClients/database/SQLiteClient';
import { Grid, TileSize } from '../../../../src/ingestion/interfaces';

describe('GpkgManager', () => {
  let gpkgManager: GpkgManager;
  let isGpkgIndexExistsSpy: jest.SpyInstance;
  let getGridSpy: jest.SpyInstance;
  let getGpkgTileSizeSpy: jest.SpyInstance;

  beforeEach(() => {
    gpkgManager = new GpkgManager(config, jsLogger({ enabled: false }), trace.getTracer('testTracer'));
    isGpkgIndexExistsSpy = jest.spyOn(SQLiteClient.prototype, 'isGpkgIndexExist');
    getGridSpy = jest.spyOn(SQLiteClient.prototype, 'getGrid');
    getGpkgTileSizeSpy = jest.spyOn(SQLiteClient.prototype, 'getGpkgTileSize');

    registerDefaultConfig();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateGpkgFiles', () => {
    it('should validate GPKG files and not throw errors', () => {
      const { gpkgFilesPath } = mockInputFiles;

      isGpkgIndexExistsSpy.mockReturnValue(true);
      getGridSpy.mockReturnValue(Grid.TWO_ON_ONE);
      getGpkgTileSizeSpy.mockReturnValue({ height: 256, width: 256 } satisfies TileSize);

      gpkgManager.validateGpkgFiles(gpkgFilesPath);

      expect(isGpkgIndexExistsSpy).toHaveBeenCalledTimes(gpkgFilesPath.length);
      expect(isGpkgIndexExistsSpy).not.toThrow();
      expect(getGridSpy).toHaveBeenCalledTimes(gpkgFilesPath.length);
      expect(getGridSpy).not.toThrow();
      expect(getGpkgTileSizeSpy).toHaveBeenCalledTimes(gpkgFilesPath.length);
      expect(getGpkgTileSizeSpy).not.toThrow();
    });

    it('should throw InvalidIndexError if GPKG index does not exists', () => {
      const { gpkgFilesPath } = mockInputFiles;

      isGpkgIndexExistsSpy.mockReturnValue(false);

      expect(() => gpkgManager.validateGpkgFiles(gpkgFilesPath)).toThrow(InvalidIndexError);

      expect(isGpkgIndexExistsSpy).toHaveBeenCalledTimes(gpkgFilesPath.length);
      expect(getGridSpy).not.toHaveBeenCalled();
      expect(getGpkgTileSizeSpy).not.toHaveBeenCalled();
    });

    it('should throw UnsupportedGridError if grid type is not supported', () => {
      const { gpkgFilesPath } = mockInputFiles;

      isGpkgIndexExistsSpy.mockReturnValue(true);
      getGridSpy.mockReturnValue(Grid.ONE_ON_ONE);

      expect(() => gpkgManager.validateGpkgFiles(gpkgFilesPath)).toThrow(UnsupportedGridError);

      expect(isGpkgIndexExistsSpy).toHaveBeenCalledTimes(gpkgFilesPath.length);
      expect(getGridSpy).toHaveBeenCalledTimes(gpkgFilesPath.length);
      expect(getGpkgTileSizeSpy).not.toHaveBeenCalled();
    });

    it('should throw UnsupportedTileSizeError if tile width is not supported', () => {
      const { gpkgFilesPath } = mockInputFiles;

      isGpkgIndexExistsSpy.mockReturnValue(true);
      getGridSpy.mockReturnValue(Grid.TWO_ON_ONE);
      getGpkgTileSizeSpy.mockReturnValue({ height: 256, width: 512 } satisfies TileSize);

      expect(() => gpkgManager.validateGpkgFiles(gpkgFilesPath)).toThrow(UnsupportedTileSizeError);

      expect(isGpkgIndexExistsSpy).toHaveBeenCalledTimes(gpkgFilesPath.length);
      expect(getGridSpy).toHaveBeenCalledTimes(gpkgFilesPath.length);
      expect(getGpkgTileSizeSpy).toHaveBeenCalledTimes(gpkgFilesPath.length);
    });

    it('should throw UnsupportedTileSizeError if tile height is not supported', () => {
      const { gpkgFilesPath } = mockInputFiles;

      isGpkgIndexExistsSpy.mockReturnValue(true);
      getGridSpy.mockReturnValue(Grid.TWO_ON_ONE);
      getGpkgTileSizeSpy.mockReturnValue({ height: 512, width: 256 } satisfies TileSize);

      expect(() => gpkgManager.validateGpkgFiles(gpkgFilesPath)).toThrow(UnsupportedTileSizeError);

      expect(isGpkgIndexExistsSpy).toHaveBeenCalledTimes(gpkgFilesPath.length);
      expect(getGridSpy).toHaveBeenCalledTimes(gpkgFilesPath.length);
      expect(getGpkgTileSizeSpy).toHaveBeenCalledTimes(gpkgFilesPath.length);
    });
  });
});
