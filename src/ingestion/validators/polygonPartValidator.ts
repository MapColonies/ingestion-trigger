/* eslint-disable @typescript-eslint/naming-convention */
import { Geometry } from 'geojson';
import { getIssues } from '@placemarkio/check-geojson';
import isValidGeoJson from '@turf/boolean-valid';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IConfig } from 'config';
import { PolygonPart } from '@map-colonies/mc-model-types';
import { Tracer, trace } from '@opentelemetry/api';
import { withSpanV4 } from '@map-colonies/telemetry';
import { LogContext } from '../../utils/logger/logContext';
import { SERVICES } from '../../common/constants';
import { InfoDataWithFile } from '../schemas/infoDataSchema';
import { combineExtentPolygons, extractPolygons } from '../../utils/geometry';
import { GeometryValidationError, PixelSizeError } from '../errors/ingestionErrors';
import { isPixelSizeValid } from '../../utils/pixelSizeValidate';

@injectable()
export class PolygonPartValidator {
  private readonly logContext: LogContext;
  private readonly extentBufferInMeters: number;
  private readonly resolutionFixedPointTolerance: number;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer
  ) {
    this.logContext = {
      fileName: __filename,
      class: PolygonPartValidator.name,
    };
    this.extentBufferInMeters = this.config.get<number>('validationValuesByInfo.extentBufferInMeters');
    this.resolutionFixedPointTolerance = this.config.get<number>('validationValuesByInfo.resolutionFixedPointTolerance');
  }

  @withSpanV4
  public validate(partsData: PolygonPart[], infoDataFiles: InfoDataWithFile[]): void {
    const logCtx = { ...this.logContext, function: this.validate.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('polygonPartValidator.validate');
    //create combined extent
    const features = extractPolygons(infoDataFiles);
    const combinedExtent = combineExtentPolygons(features);
    this.logger.debug({ msg: 'created combined extent', logContext: logCtx, metadata: { combinedExtent } });
    //run on map and check that the geometry is in extent
    partsData.map((polygonPart, index) => {
      this.validatePartGeometry(polygonPart, index);
      this.validatePartPixelSize(polygonPart, index, infoDataFiles);
    });
    activeSpan?.addEvent('polygonPartValidator.validate.success');
  }

  @withSpanV4
  private validatePartGeometry(polygonPart: PolygonPart, index: number): void {
    const logCtx = { ...this.logContext, function: this.validatePartGeometry.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('polygonPartValidator.validatePartGeometry');
    const validGeo = this.validateGeometry(polygonPart.footprint as Geometry);
    this.logger.debug({
      msg: `validated geometry of part ${polygonPart.sourceName} at index: ${index} . validGeo: ${validGeo}`,
      logContext: logCtx,
      metadata: { polygonPart },
      logCtx: logCtx,
    });
    if (!validGeo) {
      this.logger.error({
        msg: `invalid geometry in part: ${polygonPart.sourceName} at index: ${index} `,
        logContext: logCtx,
        metadata: { polygonPart },
      });
      throw new GeometryValidationError(polygonPart.sourceName, index, 'Geometry is invalid');
    }
  }

  @withSpanV4
  private validateGeometry(footprint: Geometry): boolean {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('polygonPartValidator.validateGeometry');
    const footprintIssues = getIssues(JSON.stringify(footprint));
    if (footprint.type === 'Polygon' && footprintIssues.length === 0 && isValidGeoJson(footprint)) {
      activeSpan?.addEvent('polygonPartValidator.validateGeometry.success');
      return true;
    }
    activeSpan?.addEvent('polygonPartValidator.validateGeometry.failed');
    return false;
  }

  @withSpanV4
  private validatePartPixelSize(polygonPart: PolygonPart, index: number, infoDataFiles: InfoDataWithFile[]): void {
    const logCtx = { ...this.logContext, function: this.validatePartPixelSize.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('polygonPartValidator.validatePartPixelSize');
    const polygonPartResolutionDegree = polygonPart.resolutionDegree;
    for (let i = 0; i < infoDataFiles.length; i++) {
      const infoDataPixelSize = infoDataFiles[i].pixelSize;
      const isValidPixelSize = isPixelSizeValid(polygonPartResolutionDegree, infoDataPixelSize, this.resolutionFixedPointTolerance);
      if (!isValidPixelSize) {
        const sourceFileName = infoDataFiles[i].fileName;
        const errorMsg = `PixelSize of ${polygonPart.sourceName} at index: ${index} is not bigger than source pixelSize of: ${infoDataPixelSize} in source file: ${sourceFileName}`;
        this.logger.error({
          msg: errorMsg,
          logContext: logCtx,
          polygonPart: { polygonPart, index, infoDataPixelSize, sourceFileName },
        });
        throw new PixelSizeError(polygonPart.sourceName, index, `ResolutionDeg is not bigger that pixelSize in ${sourceFileName}`);
      }
    }
    activeSpan?.addEvent('polygonPartValidator.validatePartPixelSize.valid');
  }
}
