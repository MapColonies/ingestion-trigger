import { BadRequestError } from '@map-colonies/error-types';
import { Logger } from '@map-colonies/js-logger';
import { ChunkProcessor, ReaderOptions, ShapefileChunk, ShapefileChunkReader } from '@map-colonies/mc-utils';
import { multiPolygonSchema, polygonSchema } from '@map-colonies/raster-shared';
import { Tracer } from '@opentelemetry/api';
import { Feature } from 'geojson';
import { inject, injectable } from 'tsyringe';
import z from 'zod';
import { SERVICES } from '../../common/constants';
import type { IConfig } from '../../common/interfaces';
import { LogContext } from '../../utils/logger/logContext';

const productGeometrySchema = z.union([polygonSchema, multiPolygonSchema]);
export type AllowedProductGeometry = z.infer<typeof productGeometrySchema>;

@injectable()
export class ProductManager {
  private readonly logContext: LogContext;
  private readonly options: ReaderOptions;
  private readonly reader: ShapefileChunkReader;
  private readonly processor: ChunkProcessor;
  private features: Feature[] = [];
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
      generateFeatureId: true,
      logger: this.logger,
    };
    this.reader = new ShapefileChunkReader(this.options);
    this.processor = {
      process: async (chunk): Promise<void> => {
        await this.process(chunk);
      },
    };
  }

  public async read(productShapefilePath: string): Promise<AllowedProductGeometry> {
    const logCtx: LogContext = { ...this.logContext, function: this.read.name };
    try {
      await this.reader.readAndProcess(productShapefilePath, this.processor);
      if (this.features.length > 1) {
        const errorMessage = 'product shapefile contains more than a single feature';
        this.logger.error({ msg: errorMessage, logContext: logCtx, productShapefilePath });
        throw new BadRequestError(errorMessage);
      }

      const productGeometry = this.features[0].geometry;
      this.logger.debug({ msg: `parse validate product geometry`, logContext: logCtx, productGeometry });
      const validProductGeometry = productGeometrySchema.parse(productGeometry);
      return validProductGeometry;
    } catch (error) {
      this.logger.error({
        msg: `an unexpected error occurred during product shape read, error: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        logContext: logCtx,
      });
      throw error;
    }
  }

  private async process(chunk: ShapefileChunk): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.process.name };
    this.logger.debug({ msg: 'start processing', logContext: logCtx, features: chunk.features, count: chunk.features.length });
    this.logger.info({ msg: `Processing chunk ${chunk.id} with ${chunk.features.length} features`, logContext: logCtx });
    // reset features array before each process
    if (this.features.length > 0) {
      this.features = [];
    }
    for await (const feature of chunk.features) {
      this.features.push(feature);
    }
    this.logger.debug({ msg: `processor done with ${chunk.features.length} features: ${chunk.features.length}`, logContext: logCtx });
  }
}
