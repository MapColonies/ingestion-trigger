import { inject, injectable } from "tsyringe";
import { LogContext } from "../../utils/logger/logContext";
import { IConfig } from "config";
import { Logger } from "@map-colonies/js-logger";
import { Tracer } from "@opentelemetry/api";
import { SERVICES } from "../../common/constants";
import { withSpanAsyncV4 } from "@map-colonies/telemetry";
import { BadRequestError } from '@map-colonies/error-types';
import { ChunkProcessor, ReaderOptions, ShapefileChunk, ShapefileChunkReader } from "@map-colonies/mc-utils";
import { Feature, Geometry, Polygon, MultiPolygon } from "geojson";
import { chunk } from "lodash";
import { multiPolygonSchema, polygonSchema } from "@map-colonies/raster-shared";
import { polygon } from "@turf/turf";
import z from "zod";

export type AllowedProductGeometry = Polygon | MultiPolygon;
const productGeometrySchema = z.union([
  polygonSchema,
  multiPolygonSchema
]);

//export type ProudctGeometry = Polygon | MultiPolygon;
export const ProudctGeometry = {
  POLYGON: 'Polygon',
  MULTI_POLYGON: 'MultiPolygon',
} as const;

@injectable()
export class ProductManager {
  private readonly logContext: LogContext;
  private readonly options: ReaderOptions;
  private readonly reader: ShapefileChunkReader;
  private readonly processor: ChunkProcessor;
  private readonly features: Feature<Geometry>[] = [];
  private readonly maxVerticesPerChunk: number;
  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer
  ) {
    this.maxVerticesPerChunk = this.config.get('productReader.maxVerticesPerChunk');
    this.logContext = {
      fileName: __filename,
      class: ProductManager.name,
    };
    this.options = {
      // would be taken from config
      maxVerticesPerChunk: this.maxVerticesPerChunk,
      logger: this.logger
    };
    this.reader = new ShapefileChunkReader(this.options);
    this.processor = {
      process: async (chunk) => await this.process(chunk)
    }
  }

  public async read(shapefilePath: string): Promise<AllowedProductGeometry> {
    try {
      this.logger.info({ msg: `start reading product shapefile in path: ${shapefilePath}` });
      await this.reader.readAndProcess(shapefilePath, this.processor);
      if (this.features.length > 1) {
        const errorMessage = "product shapefile contains more than a single feature";
        this.logger.error({msg: errorMessage, shapefilePath})
        throw new BadRequestError(errorMessage);
      }

      const productGeometry = this.features[0].geometry;
      this.logger.debug({ msg: `parse validate product geometry`, productGeometry });
      const validProductGeometry = productGeometrySchema.parse(productGeometry);
      return validProductGeometry;
    } catch (error) {
      this.logger.error({
        msg: `an unexpected error occurred during product shape read, error: ${error}`,
        shapefilePath,
      });
      throw error;
    }
  };

  private async process(chunk: ShapefileChunk): Promise<void> {
    this.logger.debug({ msg: 'start processing', features: chunk.features, count: chunk.features.length });
    this.logger.info(`Processing chunk ${chunk.id} with ${chunk.features.length} features`);
    for await (const feature of chunk.features) {
      this.features.push(feature);
    };
    this.logger.debug(`processor done with ${chunk.features.length} features: ${chunk.features.length}`);
  }
}