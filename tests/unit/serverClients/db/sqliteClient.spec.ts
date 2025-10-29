/* eslint-disable jest/no-conditional-expect */
import jsLogger from '@map-colonies/js-logger';
import Database, { Database as SQLiteDB, Statement, SqliteError } from 'better-sqlite3';
import { trace } from '@opentelemetry/api';
import { init as initMockConfig, configMock, clear as clearMockConfig } from '../../../mocks/configMock';
import { Grid, IMatrixValues } from '../../../../src/ingestion/interfaces';
import { SQLiteClient } from '../../../../src/serviceClients/database/SQLiteClient';
import { describe } from 'node:test';
import { fakeGpkgFilePath, mockInputFiles } from '../../../mocks/sourcesRequestBody';

jest.mock('better-sqlite3');
let sqlClient: SQLiteClient;
let mockDB: SQLiteDB;
let prepareSpy: jest.SpyInstance;
let getDbSpy: jest.SpyInstance;
const sqlLiteError = new SqliteError('Database connection failed', 'SQLITE_ERROR');

describe('SQLClient', () => {
  beforeEach(function () {
    jest.resetAllMocks();
    jest.clearAllMocks();
    jest.restoreAllMocks();
    clearMockConfig();
    initMockConfig();
    prepareSpy = jest.spyOn(Database.prototype, 'prepare');
    getDbSpy = jest.spyOn(SQLiteClient.prototype, 'getDB');
    mockDB = { close: jest.fn } as unknown as SQLiteDB;

    sqlClient = new SQLiteClient(jsLogger({ enabled: false }), trace.getTracer('testTracer'), fakeGpkgFilePath);
  });

  describe('getGrid', () => {
    it('should return 2x1 grid', function () {
      const mockMatrixValues: IMatrixValues = { matrixWidth: 400, matrixHeight: 200 };
      prepareSpy.mockImplementation(() => {
        return { get: () => mockMatrixValues } as Statement;
      });

      const result = sqlClient.getGrid();

      expect(result).toBe(Grid.TWO_ON_ONE);
    });

    it('should return 1x1 grid', function () {
      const mockMatrixValues: IMatrixValues = { matrixWidth: 200, matrixHeight: 200 };
      prepareSpy.mockImplementation(() => {
        return { get: () => mockMatrixValues } as Statement;
      });

      const result = sqlClient.getGrid();

      expect(result).toBe(Grid.ONE_ON_ONE);
    });

    it('should return unsupported grid', function () {
      const mockMatrixValues: IMatrixValues = { matrixWidth: 400, matrixHeight: 1 };
      prepareSpy.mockImplementation(() => {
        return { get: () => mockMatrixValues } as Statement;
      });

      const result = sqlClient.getGrid();

      expect(result).toBe(Grid.NOT_SUPPORTED);
    });

    it('should throw SqliteError error - getGrid', function () {
      getDbSpy.mockImplementation(() => {
        throw sqlLiteError;
      });

      const action = () => sqlClient.getGrid();
      expect(action).toThrow(SqliteError);
    });
  });

  describe('getGpkgTileSize', () => {
    it('should throw SqliteError error - getGpkgTileSize', function () {
      getDbSpy.mockImplementation(() => {
        throw sqlLiteError;
      });

      const action = () => sqlClient.getGrid();
      expect(action).toThrow(SqliteError);
    });
  });

  describe('isGpkgIndexExist', () => {
    it('should return true when unique GPKG index exists', () => {
      const mockTableName = 'test_table';
      getDbSpy.mockReturnValue(mockDB);
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
        throw sqlLiteError;
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

