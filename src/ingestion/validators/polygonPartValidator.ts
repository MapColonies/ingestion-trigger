/* eslint-disable @typescript-eslint/naming-convention */
import { GeoJSON, Geometry, MultiPolygon, Feature } from 'geojson';
import { getIssues } from '@placemarkio/check-geojson';
import booleanContains from '@turf/boolean-contains';
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
import { combineExtentPolygons, extentBuffer, extractPolygons } from '../../utils/geometry';
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
  public validate(partData: PolygonPart[], infoDataFiles: InfoDataWithFile[]): void {
    const logCtx = { ...this.logContext, function: this.validate.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('polygonPartValidator.validate');
    //create combined extent
    const features = extractPolygons(infoDataFiles);
    const combinedExtent = combineExtentPolygons(features);
    this.logger.debug({ msg: 'created combined extent', logContext: logCtx, metadata: { combinedExtent } });
    //run on map and check that the geometry is in extent
    partData.map((polygonPart, index) => {
      this.validatePartGeometry(polygonPart, index, combinedExtent);
      this.validatePartPixelSize(polygonPart, index, infoDataFiles);
    });
    activeSpan?.addEvent('polygonPartValidator.validate.success');
  }

  @withSpanV4
  private validatePartGeometry(polygonPart: PolygonPart, index: number, combinedExtent: Feature<MultiPolygon>): void {
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
      throw new GeometryValidationError(polygonPart.sourceName as string, index, 'Geometry is invalid');
    }
    const containedByExtent = this.isContainedByExtent(polygonPart.footprint as Geometry, combinedExtent as GeoJSON);
    this.logger.debug({
      msg: `validated geometry of part ${polygonPart.sourceName} at index: ${index}. containedByExtent: ${containedByExtent}`,
      logContext: logCtx,
      metadata: { polygonPart },
    });
    if (!containedByExtent) {
      this.logger.error({
        msg: `Geometry of ${polygonPart.sourceName} at index: ${index} is not contained by combined extent`,
        logContext: logCtx,
        metadata: { polygonPart, combinedExtent },
      });
      throw new GeometryValidationError(polygonPart.sourceName as string, index, 'Geometry is not contained by combined extent');
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

  @withSpanV4
  private validatePartPixelSize(polygonPart: PolygonPart, index: number, infoDataFiles: InfoDataWithFile[]): void {
    const logCtx = { ...this.logContext, function: this.validatePartPixelSize.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('polygonPartValidator.validatePartPixelSize');
    const polygonPartResolutionDegree = polygonPart.resolutionDegree;
    for (let i = 0; i < infoDataFiles.length; i++) {
      const infoDataPixelSize = infoDataFiles[i].pixelSize;
      const isValidPixelSize = isPixelSizeValid(polygonPartResolutionDegree as number, infoDataPixelSize, this.resolutionFixedPointTolerance);
      if (!isValidPixelSize) {
        const sourceFileName = infoDataFiles[i].fileName;
        const errorMsg = `PixelSize of ${polygonPart.sourceName} at index: ${index} is not bigger than source pixelSize of: ${infoDataPixelSize} in source file: ${sourceFileName}`;
        this.logger.error({
          msg: errorMsg,
          logContext: logCtx,
          polygonPart: { polygonPart, index, infoDataPixelSize, sourceFileName },
        });
        throw new PixelSizeError(polygonPart.sourceName as string, index, `ResolutionDeg is not bigger that pixelSize in ${sourceFileName}`);
      }
    }
    activeSpan?.addEvent('polygonPartValidator.validatePartPixelSize.valid');
  }
}
