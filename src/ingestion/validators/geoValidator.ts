/* eslint-disable @typescript-eslint/naming-convention */
import { GeoJSON, Geometry, MultiPolygon, Feature } from 'geojson';
import { getIssues } from '@placemarkio/check-geojson';
import booleanContains from '@turf/boolean-contains';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IConfig } from 'config';
import { PolygonPart } from '@map-colonies/mc-model-types';
import { Tracer, trace } from '@opentelemetry/api';
import { withSpanV4 } from '@map-colonies/telemetry';
import { LogContext } from '../../utils/logger/logContext';
import { SERVICES } from '../../common/constants';
import { InfoDataWithFile } from '../schemas/infoDataSchema';
import { combineExtentPolygons, extentBuffer, extractPolygons } from '../../utils/geometry';
import { GeometryValidationError, PixelSizeError } from '../errors/ingestionErrors';
import { isPixelSizeValid } from '../../utils/pixelSizeValidate';
import { ShapefileChunkReader, ReaderOptions, ChunkProcessor } from '@map-colonies/mc-utils';
import { ShapeHandler } from '../../utils/shapeReader';
import { writeFile } from 'node:fs/promises';

@injectable()
export class GeoValidator {
  private readonly logContext: LogContext;
  private readonly extentBufferInMeters: number;
  private readonly resolutionFixedPointTolerance: number;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    @inject(ShapeHandler) private readonly shapeHandler: ShapeHandler
  ) {
    this.logContext = {
      fileName: __filename,
      class: GeoValidator.name,
    };
    this.extentBufferInMeters = this.config.get<number>('validationValuesByInfo.extentBufferInMeters');
    this.resolutionFixedPointTolerance = this.config.get<number>('validationValuesByInfo.resolutionFixedPointTolerance');
  }

  @withSpanV4
  public async validate(infoDataFiles: InfoDataWithFile[]): Promise<void> {
    const logCtx = { ...this.logContext, function: this.validate.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('polygonPartValidator.validate');
    // create combined extent from gpkg info data result
    const features = extractPolygons(infoDataFiles);
    //combine all gpkgs sources files geometries (footprints)
    const combinedExtent = combineExtentPolygons(features);
    this.logger.debug({ msg: 'created combined extent', logContext: logCtx, metadata: { combinedExtent } });
    // // read "product.shp" file to check is contained within gpkg extent.
    // const productFeature = await this.shapeHandler.read('/path/to/the/shapefile.shp');
    // // implement validation vs gpkg extent instead of this writeFile
    // await writeFile('./test.json', JSON.stringify(productFeature?.geometry), 'utf-8');
    await new Promise((resolve) => resolve(true)); // TODO: REMOVE!
  }


  @withSpanV4
  private validateGeometry(footprint: Geometry): boolean {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('polygonPartValidator.validateGeometry');
    const footprintIssues = getIssues(JSON.stringify(footprint));
    if (footprint.type === 'Polygon' && footprintIssues.length === 0) {
      activeSpan?.addEvent('polygonPartValidator.validateGeometry.success');
      return true;
    }
    activeSpan?.addEvent('polygonPartValidator.validateGeometry.failed');
    return false;
  }

  @withSpanV4
  private isContainedByExtent(footprint: Geometry, extent: GeoJSON): boolean {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('polygonPartValidator.isContainedByExtent');
    const bufferedExtent = extentBuffer(this.extentBufferInMeters, extent);
    if (!(booleanContains(bufferedExtent as unknown as Geometry, footprint) || booleanContains(extent as Geometry, footprint))) {
      activeSpan?.addEvent('polygonPartValidator.isContainedByExtent.false', {
        providedExtent: JSON.stringify(extent),
        bufferedExtent: JSON.stringify(bufferedExtent),
        footprint: JSON.stringify(footprint),
      });
      return false;
    }
    activeSpan?.addEvent('polygonPartValidator.isContainedByExtent.true');
    return true;
  }
}
