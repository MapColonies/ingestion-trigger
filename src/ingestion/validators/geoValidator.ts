/* eslint-disable @typescript-eslint/naming-convention */
import { GeoJSON, Geometry, MultiPolygon, Feature, Polygon } from 'geojson';
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
import { GeometryValidationError, PixelSizeError, UnsupportedEntityError } from '../errors/ingestionErrors';
import { isPixelSizeValid } from '../../utils/pixelSizeValidate';
import { ShapefileChunkReader, ReaderOptions, ChunkProcessor } from '@map-colonies/mc-utils';
import { writeFile } from 'node:fs/promises';
import { AllowedProductGeometry, ProductManager, ProudctGeometry } from '../models/productManager';

@injectable()
export class GeoValidator {
  private readonly logContext: LogContext;
  private readonly extentBufferInMeters: number;
  private readonly resolutionFixedPointTolerance: number;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
  ) {
    this.logContext = {
      fileName: __filename,
      class: GeoValidator.name,
    };
    this.extentBufferInMeters = this.config.get<number>('validationValuesByInfo.extentBufferInMeters');
    this.resolutionFixedPointTolerance = this.config.get<number>('validationValuesByInfo.resolutionFixedPointTolerance');
  }

  @withSpanV4
  public async validate(infoDataFiles: InfoDataWithFile[], productGeometry: AllowedProductGeometry): Promise<void> {
    const logCtx = { ...this.logContext, function: this.validate.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('polygonPartValidator.validate');
    // create combined extent from gpkg info data result
    const features = extractPolygons(infoDataFiles);
    //combine all gpkgs sources files geometries (footprints)
    const combinedExtent = combineExtentPolygons(features);
    this.logger.debug({ msg: 'created combined extent', logContext: logCtx, metadata: { combinedExtent } });
    const gpkgBufferedExtent = extentBuffer(this.extentBufferInMeters, combinedExtent);
    if (gpkgBufferedExtent === undefined) {
      throw new Error('error while buffer gpkg extent');
    }
    // // read "product.shp" file to check is contained within gpkg extent
    this.hasFootprintCooleration(gpkgBufferedExtent.geometry, productGeometry);
  }

  @withSpanV4
  private hasFootprintCooleration(gpkgGeometry: Geometry, productGeometry: AllowedProductGeometry): boolean {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('polygonPartValidator.hasFootprintCooleration');
    if (productGeometry.type === ProudctGeometry.MULTI_POLYGON) {
      productGeometry.coordinates.forEach(coordinate => {
        const polygon: Polygon = { type: 'Polygon', coordinates: coordinate };
        if (!(booleanContains(gpkgGeometry, polygon))) {
          activeSpan?.addEvent('polygonPartValidator.hasFootprintCooleration.false', {
            gpkgGeometry: JSON.stringify(gpkgGeometry),
            productFootprint: JSON.stringify(productGeometry),
          });
          return false;
        }
      });
    } else if (!(booleanContains(gpkgGeometry, productGeometry))) {
      activeSpan?.addEvent('polygonPartValidator.hasFootprintCooleration.false', {
        gpkgGeometry: JSON.stringify(gpkgGeometry),
        productFootprint: JSON.stringify(productGeometry),
      });
      return false;
    }
    activeSpan?.addEvent('polygonPartValidator.hasFootprintCooleration.true');
    return true;
  }
}
