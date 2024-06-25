/* eslint-disable @typescript-eslint/naming-convention */
import { GeoJSON, Geometry } from 'geojson';
import { getIssues } from '@placemarkio/check-geojson';
import booleanContains from '@turf/boolean-contains';
import isValidGeoJson from '@turf/boolean-valid';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IConfig } from 'config';
import { PolygonPart } from '@map-colonies/mc-model-types';
import { LogContext } from '../../utils/logger/logContext';
import { SERVICES } from '../../common/constants';
import { InfoData } from '../schemas/infoDataSchema';
import { combineExtentPolygons, extentBuffer, extractPolygons } from '../../utils/geometry';
import { GeometryValidationError } from '../errors/ingestionErrors';

@injectable()
export class PolygonPartGeometryValidator {
  private readonly logContext: LogContext;
  private readonly extentBufferInMeters: number;
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger, @inject(SERVICES.CONFIG) private readonly config: IConfig) {
    this.logContext = {
      fileName: __filename,
      class: PolygonPartGeometryValidator.name,
    };
    this.extentBufferInMeters = this.config.get<number>('validationValuesByInfo.extentBufferInMeters');
  }

  public validate(partData: PolygonPart[], infoDataFiles: InfoData[]): void {
    const logCtx = { ...this.logContext, function: this.validate.name };
    //create combined extent
    const features = extractPolygons(infoDataFiles);
    const combinedExtent = combineExtentPolygons(features);
    this.logger.debug({ msg: 'created combined extent', logContext: logCtx, metadata: { combinedExtent } });
    //run on map and check that the geometry is in extent
    partData.map((polygonPart, index) => {
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
        throw new GeometryValidationError(polygonPart.name as string, index, 'Geometry is not valid');
      }
      const containedByExtent = this.isContainedByExtent(polygonPart.geometry as Geometry, combinedExtent as GeoJSON);
      this.logger.debug({
        msg: `validated geometry of part ${polygonPart.name} at index: ${index}. containedByExtent: ${containedByExtent}`,
        logContext: logCtx,
        metadata: { polygonPart },
      });
      if (!containedByExtent) {
        this.logger.error({
          msg: `Geometry ${polygonPart.name} at index: ${index} is not contained by combined extent`,
          logContext: logCtx,
          metadata: { polygonPart, combinedExtent },
        });
        throw new GeometryValidationError(polygonPart.name as string, index, 'Geometry is not contained by combined extent');
      }
    });
  }

  private validateGeometry(footprint: Geometry): boolean {
    const footprintIssues = getIssues(JSON.stringify(footprint));
    if ((footprint.type === 'Polygon' || footprint.type === 'MultiPolygon') && footprintIssues.length === 0 && isValidGeoJson(footprint)) {
      return true;
    }
    return false;
  }

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
}
