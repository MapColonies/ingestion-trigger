/* eslint-disable @typescript-eslint/naming-convention */
import { GeoJSON, Geometry, MultiPolygon, Feature } from 'geojson';
import { getIssues } from '@placemarkio/check-geojson';
import booleanContains from '@turf/boolean-contains';
import isValidGeoJson from '@turf/boolean-valid';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IConfig } from 'config';
import { PolygonPart } from '@map-colonies/mc-model-types';
import { LogContext } from '../../utils/logger/logContext';
import { SERVICES } from '../../common/constants';
import { InfoDataWithFile } from '../schemas/infoDataSchema';
import { combineExtentPolygons, extentBuffer, extractPolygons } from '../../utils/geometry';
import { GeometryValidationError, PixelSizeError } from '../errors/ingestionErrors';
import { isPixelSizeValid } from '../../utils/pixelSizeValidate';
import { Tracer , trace } from '@opentelemetry/api';
import { withSpanV4 } from '@map-colonies/telemetry';

@injectable()
export class PolygonPartValidator {
  private readonly logContext: LogContext;
  private readonly extentBufferInMeters: number;
  private readonly resolutionFixedPointTolerance: number;
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger, @inject(SERVICES.CONFIG) private readonly config: IConfig,@inject(SERVICES.TRACER) public readonly tracer: Tracer) {
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
    const validateGeometriesSpan = trace.getActiveSpan();
    //create combined extent
    const features = extractPolygons(infoDataFiles);
    const combinedExtent = combineExtentPolygons(features);
    this.logger.debug({ msg: 'created combined extent', logContext: logCtx, metadata: { combinedExtent } });
    //run on map and check that the geometry is in extent
    partData.map((polygonPart, index) => {
      this.validatePartGeometry(polygonPart, index, combinedExtent);
      this.validatePartPixelSize(polygonPart, index, infoDataFiles);
    });
    validateGeometriesSpan?.addEvent('polygonPartValidator.validate.success');
  }

  @withSpanV4
  private validatePartGeometry(polygonPart: PolygonPart, index: number, combinedExtent: Feature<MultiPolygon>): void {
    const logCtx = { ...this.logContext, function: this.validatePartGeometry.name };
    const validatePartGeometrySpan = trace.getActiveSpan();
    const validGeo = this.validateGeometry(polygonPart.geometry as Geometry);
    this.logger.debug({
      msg: `validated geometry of part ${polygonPart.name} at index: ${index} . validGeo: ${validGeo}`,
      logContext: logCtx,
      metadata: { polygonPart },
      logCtx: logCtx,
    });
    if (!validGeo) {
      this.logger.error({
        msg: `invalid geometry in part: ${polygonPart.name} at index: ${index} `,
        logContext: logCtx,
        metadata: { polygonPart },
      });
      const error = new GeometryValidationError(polygonPart.name as string, index, 'Geometry is not valid'); 
      validatePartGeometrySpan?.setAttribute('msg',error.message).recordException(error);
      throw error;
    }
    const containedByExtent = this.isContainedByExtent(polygonPart.geometry as Geometry, combinedExtent as GeoJSON);
    this.logger.debug({
      msg: `validated geometry of part ${polygonPart.name} at index: ${index}. containedByExtent: ${containedByExtent}`,
      logContext: logCtx,
      metadata: { polygonPart },
    });
    if (!containedByExtent) {
      this.logger.error({
        msg: `Geometry of ${polygonPart.name} at index: ${index} is not contained by combined extent`,
        logContext: logCtx,
        metadata: { polygonPart, combinedExtent },
      });
      const error = new GeometryValidationError(polygonPart.name as string, index, 'Geometry is not contained by combined extent');
      validatePartGeometrySpan?.setAttribute('msg',error.message).recordException(error);
      throw error; 
    }
  }

  @withSpanV4
  private validateGeometry(footprint: Geometry): boolean {
    const validatePartGeometrySpan = trace.getActiveSpan();
    const footprintIssues = getIssues(JSON.stringify(footprint));
    if ((footprint.type === 'Polygon' || footprint.type === 'MultiPolygon') && footprintIssues.length === 0 && isValidGeoJson(footprint)) {
      validatePartGeometrySpan?.addEvent('polygonPartValidator.validateGeometry.success');
      return true;
    }
    validatePartGeometrySpan?.addEvent('polygonPartValidator.validateGeometry.failed');
    return false;
  }

  @withSpanV4
  private isContainedByExtent(footprint: Geometry, extent: GeoJSON): boolean {
    const bufferedExtent = extentBuffer(this.extentBufferInMeters, extent);
    if (footprint.type === 'MultiPolygon') {
      for (let i = 0; i < footprint.coordinates.length; i++) {
        const coords = footprint.coordinates[i];
        const polygon = { type: 'Polygon', coordinates: coords };
        if (
          !(booleanContains(bufferedExtent as unknown as Geometry, polygon as Geometry) || booleanContains(extent as Geometry, polygon as Geometry))
        ) {
          return false;
        }
      }
    } else if (!(booleanContains(bufferedExtent as unknown as Geometry, footprint) || booleanContains(extent as Geometry, footprint))) {
      return false;
    }
    return true;
  }

  @withSpanV4
  private validatePartPixelSize(polygonPart: PolygonPart, index: number, infoDataFiles: InfoDataWithFile[]): void {
    const logCtx = { ...this.logContext, function: this.validatePartPixelSize.name };
    const polygonPartResolutionDegree = polygonPart.resolutionDegree;
    for (let i = 0; i < infoDataFiles.length; i++) {
      const infoDataPixelSize = infoDataFiles[i].pixelSize;
      const isValidPixelSize = isPixelSizeValid(polygonPartResolutionDegree as number, infoDataPixelSize, this.resolutionFixedPointTolerance);
      if (!isValidPixelSize) {
        const sourceFileName = infoDataFiles[i].fileName;
        const errorMsg = `PixelSize of ${polygonPart.name} at index: ${index} is not bigger than source pixelSize of: ${infoDataPixelSize} in source file: ${sourceFileName}`;
        this.logger.error({
          msg: errorMsg,
          logContext: logCtx,
          polygonPart: { polygonPart, index, infoDataPixelSize, sourceFileName },
        });
        throw new PixelSizeError(polygonPart.name as string, index, `ResolutionDeg is not bigger that pixelSize in ${sourceFileName}`);
      }
    }
  }
}
