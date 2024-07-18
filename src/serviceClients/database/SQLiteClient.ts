import { join } from 'path';
import Database, { Database as SQLiteDB, SqliteError } from 'better-sqlite3';
import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { Tracer } from '@opentelemetry/api';
import { withSpanV4 } from '@map-colonies/telemetry';
import { IConfig } from '../../common/interfaces';
import { SERVICES } from '../../common/constants';
import { Grid, IMatrixValues, TileSize, matrixRatioToGrid } from '../../ingestion/interfaces';
import { LogContext } from '../../utils/logger/logContext';
import { GpkgError } from './errors';

@injectable()
export class SQLiteClient {
  private readonly fullPath: string;
  private readonly logContext: LogContext;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    private readonly packageName: string,
    private readonly originDirectory: string
  ) {
    const layerSourceDir = this.config.get<string>('storageExplorer.layerSourceDir');
    this.fullPath = join(layerSourceDir, this.originDirectory, this.packageName);
    this.logContext = {
      fileName: __filename,
      class: SQLiteClient.name,
    };
  }

  @withSpanV4
  public getDB(fileMustExistFlag: boolean): SQLiteDB {
    try {
      return new Database(this.fullPath, { fileMustExist: fileMustExistFlag });
    } catch (err) {
      const message = `Failed to open database file: ${this.fullPath} with SQLiteDB`;
      const logCtx = { ...this.logContext, function: this.getDB.name };
      this.handleError(err, message, logCtx);
    }
  }

  @withSpanV4
  public isGpkgIndexExist(): boolean {
    let db: SQLiteDB | undefined;
    const logCtx = { ...this.logContext, function: this.isGpkgIndexExist.name };
    let hasGpkgIndex = false;
    try {
      db = this.getDB(true);
      const tableName = this.getGpkgTableName(db);
      hasGpkgIndex = this.hasUniqueGpkgIndex(db, tableName) || this.hasGpkgManualIndex(db, tableName);
    } catch (error) {
      this.handleError(error, `Error when validating GPKG index`, logCtx);
    } finally {
      this.closeDB(db);
    }
    return hasGpkgIndex;
  }

  @withSpanV4
  public getGrid(): Grid {
    const logCtx = { ...this.logContext, function: this.getGrid.name };
    let db: SQLiteDB | undefined;
    try {
      db = this.getDB(true);
      const matrixValues = this.getMatrixValues(db);
      const matrixRatio = Math.round(matrixValues.matrixWidth / matrixValues.matrixHeight);
      const grid = matrixRatioToGrid.get(matrixRatio) ?? Grid.NOT_SUPPORTED;
      return grid;
    } catch (err) {
      this.handleError(err, `Error when getting grid type`, logCtx);
    } finally {
      this.closeDB(db);
    }
  }

  @withSpanV4
  public getGpkgTileSize(): TileSize {
    const logCtx = { ...this.logContext, function: this.getGpkgTileSize.name };
    let db: SQLiteDB | undefined;
    const query = 'SELECT tile_width, tile_height FROM gpkg_tile_matrix GROUP BY tile_width, tile_height';
    try {
      db = this.getDB(true);
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const queryResult = db.prepare(query).all() as { tile_width: number; tile_height: number }[];

      if (queryResult.length !== 1) {
        throw new Error('Invalid GPKG: All tile_width and tile_height must be the same pixel size');
      }

      const tileSizes: TileSize = { width: queryResult[0].tile_width, height: queryResult[0].tile_height };
      return tileSizes;
    } catch (error) {
      const customMessage = 'Error when getting tile width and height';
      this.handleError(error, customMessage, logCtx, { query });
    } finally {
      this.closeDB(db);
    }
  }
  @withSpanV4
  private hasUniqueGpkgIndex(db: SQLiteDB, tableName: string): boolean {
    const logCtx = { ...this.logContext, function: this.hasUniqueGpkgIndex.name };
    const query = `SELECT name FROM pragma_index_list('${tableName}') WHERE "unique" = 1 AND origin = 'u';`;
    try {
      this.logger.debug({
        msg: `Executing query ${query} on DB ${this.fullPath}`,
        logCtx,
      });

      const indexes = db.prepare(query).all() as { name: string }[];

      for (const index of indexes) {
        const colsQuery = `SELECT name FROM pragma_index_info('${index.name}')`;

        this.logger.debug({
          msg: `Executing query ${colsQuery} on DB ${this.fullPath}`,
        });

        const cols = (db.prepare(colsQuery).all() as { name: string }[]).map((c) => c.name);
        const requiredColumns = ['tile_column', 'tile_row', 'zoom_level'];

        if (requiredColumns.every((column) => cols.includes(column))) {
          return true;
        }
      }
      return false;
    } catch (error) {
      this.handleError(error, `Error when validating unique constraint index`, logCtx);
    }
  }

  @withSpanV4
  private hasGpkgManualIndex(db: SQLiteDB, tableName: string): boolean {
    const logCtx = { ...this.logContext, function: this.hasGpkgManualIndex.name };
    const query = `SELECT COUNT(*) as count
                  FROM sqlite_master
                  WHERE type = 'index' AND tbl_name='${tableName}' AND sql LIKE '%zoom_level%'
                  AND sql LIKE '%tile_column%' AND sql LIKE '%tile_row%';`;
    try {
      const queryResult = db.prepare(query).get() as { count: number };
      const indexCount = queryResult.count;
      return indexCount > 0;
    } catch (error) {
      this.handleError(error, `Error when validating manual index`, logCtx);
    }
  }

  @withSpanV4
  private getMatrixValues(db: SQLiteDB): IMatrixValues {
    const query = 'SELECT MAX(matrix_width) as matrixWidth, MAX(matrix_height) as matrixHeight FROM gpkg_tile_matrix';
    try {
      return db.prepare(query).get() as IMatrixValues;
    } catch (error) {
      const logCtx = { ...this.logContext, function: this.getMatrixValues.name };
      this.handleError(error, `Error when getting matrix values`, logCtx);
    }
  }

  @withSpanV4
  private getGpkgTableName(db: SQLiteDB): string {
    const query = 'SELECT table_name FROM gpkg_contents';
    const logCtx = { ...this.logContext, function: this.getGpkgTableName.name };
    try {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const tableNames = db.prepare(query).all() as { table_name: string }[];
      if (tableNames.length !== 1) {
        this.handleError(undefined, `Invalid GPKG: should have single table name`, logCtx);
      }
      const tableName = tableNames[0].table_name;
      return tableName;
    } catch (error) {
      this.handleError(error, `Error when getting table name`, logCtx, { query });
    }
  }

  @withSpanV4
  private closeDB(db: SQLiteDB | undefined): void {
    if (db !== undefined) {
      db.close();
      this.logger.debug({ msg: `Connection to GPKG in path ${this.fullPath} closed` });
    }
  }
  private handleError(error: unknown, message: string, logCtx: LogContext, metadata?: Record<string, unknown>): never {
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    this.logger.error({
      msg: errorMessage,
      customMessage: message,
      err: error,
      logContext: logCtx,
      metadata: { ...metadata, gpkgPath: this.fullPath },
    });

    if (error instanceof SqliteError) {
      throw new SqliteError(`${message}: ${errorMessage}`, error.code);
    }
    throw new GpkgError(`${message}: ${errorMessage}`);
  }
}
