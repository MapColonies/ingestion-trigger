import { inject, injectable } from 'tsyringe';
import { IConfig } from 'config';
import { Logger } from '@map-colonies/js-logger';
import { Tracer } from '@opentelemetry/api';
import { withSpanV4 } from '@map-colonies/telemetry';
import { SERVICES } from '../../common/constants';
import { SQLiteClient } from '../../serviceClients/database/SQLiteClient';
import { InvalidIndexError, UnsupportedGridError, UnsupportedTileSizeError } from '../../serviceClients/database/errors';
import { LogContext } from '../../utils/logger/logContext';
import { Grid } from '../interfaces';

@injectable()
export class GpkgManager {
  private readonly logContext: LogContext;
  private readonly validTileSize: number;
  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer
  ) {
    this.logContext = {
      fileName: __filename,
      class: GpkgManager.name,
    };
    this.validTileSize = this.config.get<number>('validationValuesByInfo.tileSize');
  }

  @withSpanV4
  public validateGpkgFiles(originDirectory: string, files: string[]): void {
    const logCtx = { ...this.logContext, function: this.validateGpkgFiles.name };
    this.logger.debug({ msg: 'Validating GPKG files', logContext: logCtx, metadata: { originDirectory, files } });
    this.validateGpkgIndex(originDirectory, files);
    this.validateGpkgGrid(originDirectory, files);
    this.validateTilesSize(originDirectory, files);
    this.logger.debug({ msg: 'GPKG files are valid', logContext: logCtx, metadata: { originDirectory, files } });
  }

  @withSpanV4
  private validateGpkgIndex(originDirectory: string, files: string[]): void {
    const logCtx = { ...this.logContext, function: this.validateGpkgIndex.name };
    this.readGpkgFiles(originDirectory, files, (file, sqlClient) => {
      const isGpkgIndexExist = sqlClient.isGpkgIndexExist();

      if (!isGpkgIndexExist) {
        const message = `GPKG index does not exist in file: ${file}`;
        this.logger.warn({ msg: message, logContext: logCtx, metadata: { originDirectory, files } });
        throw new InvalidIndexError(message);
      }
    });
  }

  @withSpanV4
  private validateGpkgGrid(originDirectory: string, files: string[]): void {
    const logCtx = { ...this.logContext, function: this.validateGpkgGrid.name };
    this.readGpkgFiles(originDirectory, files, (file, sqlClient) => {
      const grid = sqlClient.getGrid();

      if (grid !== Grid.TWO_ON_ONE) {
        //should be configurable?
        const message = `Geopackage name: ${file} grid type ${grid} is not supported (grid should be ${Grid.TWO_ON_ONE})`;
        this.logger.warn({ msg: message, logContext: logCtx, metadata: { originDirectory, file, grid } });
        throw new UnsupportedGridError(message);
      }
    });
  }

  @withSpanV4
  private validateTilesSize(originDirectory: string, files: string[]): void {
    const logCtx = { ...this.logContext, function: this.validateTilesSize.name };
    this.readGpkgFiles(originDirectory, files, (file, sqlClient) => {
      const tileSize = sqlClient.getGpkgTileSize();
      if (tileSize.width !== this.validTileSize || tileSize.height !== this.validTileSize) {
        const message = `Geopackage name: ${file} tile size is not supported (tile size should be ${this.validTileSize})`;
        this.logger.warn({ msg: message, logContext: logCtx, metadata: { originDirectory, file, tileSize } });
        throw new UnsupportedTileSizeError(message);
      }
    });
  }

  @withSpanV4
  private readGpkgFiles(originDirectory: string, files: string[], readFn: (file: string, sqlClient: SQLiteClient) => void): void {
    files.forEach((file) => {
      const sqliteClient = new SQLiteClient(this.logger, this.config, this.tracer, file, originDirectory);
      readFn(file, sqliteClient);
    });
  }
}
