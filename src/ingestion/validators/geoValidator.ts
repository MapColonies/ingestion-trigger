import { Logger } from '@map-colonies/js-logger';
import { withSpanV4 } from '@map-colonies/telemetry';
import { Tracer, trace } from '@opentelemetry/api';
import booleanContains from '@turf/boolean-contains';
import { IConfig } from 'config';
import { Geometry, Polygon } from 'geojson';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import { combineExtentPolygons, extentBuffer, extractPolygons } from '../../utils/geometry';
import { LogContext } from '../../utils/logger/logContext';
import { ValidationError } from '../errors/ingestionErrors';
import { type AllowedProductGeometry } from '../models/productManager';
import { InfoDataWithFile } from '../schemas/infoDataSchema';

@injectable()
export class GeoValidator {
  private readonly logContext: LogContext;
  private readonly extentBufferInMeters: number;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer
  ) {
    this.logContext = {
      fileName: __filename,
      class: GeoValidator.name,
    };
    this.extentBufferInMeters = this.config.get<number>('validationValuesByInfo.extentBufferInMeters');
  }

  @withSpanV4
  public validate(infoDataFiles: InfoDataWithFile[], productGeometry: AllowedProductGeometry): void {
    const logCtx = { ...this.logContext, function: this.validate.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('GeoValidator.validate');
    // create combined extent from gpkg info data result
    const features = extractPolygons(infoDataFiles);
    // combine all gpkgs sources files geometries (footprints)
    const combinedExtent = combineExtentPolygons(features);
    this.logger.debug({ msg: 'created combined extent', logContext: logCtx, metadata: { combinedExtent } });
    const gpkgBufferedExtent = extentBuffer(this.extentBufferInMeters, combinedExtent);
    if (gpkgBufferedExtent === undefined) {
      throw new Error('buffered gpkg extent is undefined');
    }
    // read "product.shp" file to check is contained within gpkg extent
    const hasFootprintCorrelation = this.hasFootprintCorrelation(gpkgBufferedExtent.geometry, productGeometry);
    if (!hasFootprintCorrelation) {
      const errorMessage = 'product footprint is not contained by gpkg combined extent';
      this.logger.error({
        msg: errorMessage,
        logContext: logCtx,
        metadata: { gpkgBufferedExtent, productGeometry },
      });
      throw new ValidationError(errorMessage);
    }
  }

  @withSpanV4
  private hasFootprintCorrelation(gpkgGeometry: Geometry, productGeometry: AllowedProductGeometry): boolean {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('GeoValidator.hasFootprintCorrelation');
    if (productGeometry.type === 'MultiPolygon') {
      productGeometry.coordinates.forEach((coordinate) => {
        const polygon: Polygon = { type: 'Polygon', coordinates: coordinate };
        if (!booleanContains(gpkgGeometry, polygon)) {
          activeSpan?.addEvent('GeoValidator.hasFootprintCorrelation.false', {
            gpkgGeometry: JSON.stringify(gpkgGeometry),
            productFootprint: JSON.stringify(productGeometry),
          });
          return false;
        }
      });
    } else if (!booleanContains(gpkgGeometry, productGeometry)) {
      activeSpan?.addEvent('GeoValidator.hasFootprintCorrelation.false', {
        gpkgGeometry: JSON.stringify(gpkgGeometry),
        productFootprint: JSON.stringify(productGeometry),
      });
      return false;
    }
    activeSpan?.addEvent('GeoValidator.hasFootprintCorrelation.true');
    return true;
  }
}
