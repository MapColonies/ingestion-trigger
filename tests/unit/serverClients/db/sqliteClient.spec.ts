/* eslint-disable jest/no-conditional-expect */
import jsLogger from '@map-colonies/js-logger';
import Database, { Database as SQLiteDB, Statement, SqliteError } from 'better-sqlite3';
import { init as initMockConfig, configMock, setValue, clear as clearMockConfig } from '../../../mocks/configMock';
import { Grid } from '../../../../src/ingestion/interfaces';
import { SQLiteClient } from '../../../../src/serviceClients/database/SQLiteClient';

jest.mock('better-sqlite3');
let sqlClient: SQLiteClient;
let mockDB: SQLiteDB;

describe('SQLClient', () => {
  beforeEach(function () {
    jest.resetAllMocks();
    jest.clearAllMocks();
    jest.restoreAllMocks();
    clearMockConfig();
    initMockConfig();
    mockDB = { close: jest.fn } as unknown as SQLiteDB;

    sqlClient = new SQLiteClient(jsLogger({ enabled: false }), configMock, 'test_gpkg', 'test_dir');
  });

  describe('getGrid', () => {
    it('should return 2x1 grid', function () {
      setValue({ layerSourceDir: 'tests/mocks' });
      const mockMatrixValues = { matrixWidth: 400, matrixHeight: 200 };
      const prepareSpy = jest.spyOn(Database.prototype, 'prepare');
      prepareSpy.mockImplementation(() => {
        return { get: () => mockMatrixValues } as Statement;
      });

      const result = sqlClient.getGrid();

      expect(result).toBe(Grid.TWO_ON_ONE);
    });

    it('should return 1x1 grid', function () {
      setValue({ layerSourceDir: 'tests/mocks' });
      const mockMatrixValues = { matrixWidth: 200, matrixHeight: 200 };
      const prepareSpy = jest.spyOn(Database.prototype, 'prepare');
      prepareSpy.mockImplementation(() => {
        return { get: () => mockMatrixValues } as Statement;
      });

      const result = sqlClient.getGrid();

      expect(result).toBe(Grid.ONE_ON_ONE);
    });

    it('should return unsupported grid', function () {
      setValue({ layerSourceDir: 'tests/mocks' });
      const mockMatrixValues = { matrixWidth: 400, matrixHeight: 1 };
      const prepareSpy = jest.spyOn(Database.prototype, 'prepare');
      prepareSpy.mockImplementation(() => {
        return { get: () => mockMatrixValues } as Statement;
      });

      const result = sqlClient.getGrid();

      expect(result).toBe(Grid.NOT_SUPPORTED);
    });

    it('should throw SqliteError error - getGrid', function () {
      jest.spyOn(SQLiteClient.prototype, 'getDB').mockImplementation(() => {
        throw new SqliteError('Database connection failed', 'SQLITE_ERROR');
      });

      const handleErrorSpy = jest.spyOn(SQLiteClient.prototype as unknown as { handleError: jest.Mock }, 'handleError');
      try {
        sqlClient.getGrid();
      } catch (err) {
        const isSqliteError = err instanceof SqliteError;
        expect(isSqliteError).toBe(true);
      }

      expect(handleErrorSpy).toHaveBeenCalled();
    });

    it('should throw SqliteError error - getGpkgTileSize', function () {
      jest.spyOn(SQLiteClient.prototype, 'getDB').mockImplementation(() => {
        throw new SqliteError('Database connection failed', 'SQLITE_ERROR');
      });

      const handleErrorSpy = jest.spyOn(SQLiteClient.prototype as unknown as { handleError: jest.Mock }, 'handleError');
      try {
        sqlClient.getGpkgTileSize();
      } catch (err) {
        const isSqliteError = err instanceof SqliteError;
        expect(isSqliteError).toBe(true);
      }

      expect(handleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('isGpkgIndexExist', () => {
    it('should return true when unique GPKG index exists', () => {
      const mockTableName = 'test_table';
      jest.spyOn(SQLiteClient.prototype, 'getDB').mockReturnValue(mockDB);
      jest.spyOn(SQLiteClient.prototype as unknown as { getGpkgTableName: jest.Mock }, 'getGpkgTableName').mockReturnValue(mockTableName);
      jest.spyOn(SQLiteClient.prototype as unknown as { hasUniqueGpkgIndex: jest.Mock }, 'hasUniqueGpkgIndex').mockReturnValue(true);
      jest.spyOn(SQLiteClient.prototype as unknown as { hasGpkgManualIndex: jest.Mock }, 'hasGpkgManualIndex').mockReturnValue(false);

      const result = sqlClient.isGpkgIndexExist();

      expect(result).toBe(true);
    });

    it('should return true when manual GPKG index exists', () => {
      const mockTableName = 'test_table';
      jest.spyOn(SQLiteClient.prototype, 'getDB').mockReturnValue(mockDB);
      jest.spyOn(SQLiteClient.prototype as unknown as { getGpkgTableName: jest.Mock }, 'getGpkgTableName').mockReturnValue(mockTableName);
      jest.spyOn(SQLiteClient.prototype as unknown as { hasUniqueGpkgIndex: jest.Mock }, 'hasUniqueGpkgIndex').mockReturnValue(false);
      jest.spyOn(SQLiteClient.prototype as unknown as { hasGpkgManualIndex: jest.Mock }, 'hasGpkgManualIndex').mockReturnValue(true);

      const result = sqlClient.isGpkgIndexExist();

      expect(result).toBe(true);
    });

    it('should return false when GPKG index does not exist', () => {
      const mockTableName = 'test_table';
      jest.spyOn(SQLiteClient.prototype, 'getDB').mockReturnValue(mockDB);
      jest.spyOn(SQLiteClient.prototype as unknown as { getGpkgTableName: jest.Mock }, 'getGpkgTableName').mockReturnValue(mockTableName);
      jest.spyOn(SQLiteClient.prototype as unknown as { hasUniqueGpkgIndex: jest.Mock }, 'hasUniqueGpkgIndex').mockReturnValue(false);
      jest.spyOn(SQLiteClient.prototype as unknown as { hasGpkgManualIndex: jest.Mock }, 'hasGpkgManualIndex').mockReturnValue(false);

      const result = sqlClient.isGpkgIndexExist();

      expect(result).toBe(false);
    });

    it('should throw SqliteError error - isGpkgIndexExist', function () {
      jest.spyOn(SQLiteClient.prototype, 'getDB').mockImplementation(() => {
        throw new SqliteError('Database connection failed', 'SQLITE_ERROR');
      });

      const handleErrorSpy = jest.spyOn(SQLiteClient.prototype as unknown as { handleError: jest.Mock }, 'handleError');
      try {
        sqlClient.isGpkgIndexExist();
      } catch (err) {
        const isSqliteError = err instanceof SqliteError;
        expect(isSqliteError).toBe(true);
      }

      expect(handleErrorSpy).toHaveBeenCalled();
    });

    it('should throw Unknown error - isGpkgIndexExist', function () {
      jest.spyOn(SQLiteClient.prototype, 'getDB').mockImplementation(() => {
        throw new Error('Unexpected Error');
      });

      const handleErrorSpy = jest.spyOn(SQLiteClient.prototype as unknown as { handleError: jest.Mock }, 'handleError');
      try {
        sqlClient.isGpkgIndexExist();
      } catch (err) {
        const isSqliteError = err instanceof Error;
        expect(isSqliteError).toBe(true);
      }

      expect(handleErrorSpy).toHaveBeenCalled();
    });
  });
});
