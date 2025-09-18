import { inject, injectable } from "tsyringe";
import { LogContext } from "../../utils/logger/logContext";
import { IConfig } from "config";
import { Logger } from "@map-colonies/js-logger";
import { Tracer } from "@opentelemetry/api";
import { SERVICES } from "../../common/constants";
import { withSpanAsyncV4 } from "@map-colonies/telemetry";
import { BadRequestError } from '@map-colonies/error-types';
import { ChunkProcessor, ReaderOptions, ShapefileChunk, ShapefileChunkReader } from "@map-colonies/mc-utils";
import { Feature, Geometry, MultiPoint } from "geojson";
import { Polygon } from "gdal-async";
import { chunk } from "lodash";

type ProudctGeometry = MultiPoint | Polygon | undefined;

@injectable()
export class ProductManager {
  private readonly logContext: LogContext;
  private readonly options: ReaderOptions;
  private readonly reader: ShapefileChunkReader;
  private readonly processor: ChunkProcessor;
  private readonly features: Feature[] = [];
  private readonly productFee: Feature | undefined;
  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer
  ) {
    this.logContext = {
      fileName: __filename,
      class: ProductManager.name,
    };
    this.options = {
      // would be taken from config
      maxVerticesPerChunk: 10000,
      logger: this.logger
    };
    this.reader = new ShapefileChunkReader(this.options);
    this.processor = {
      process: async (chunk) => await this.process(chunk)
    }
  }


  public async read(shapefilePath: string): Promise<Feature | undefined> {
    try {
      await this.reader.readAndProcess(shapefilePath, this.processor);
      if (this.features.length > 1){
        throw new BadRequestError("product shapefile contains more than a single feature");
      }
      return this.features[0];
    } catch (error) {
      console.log('error', error);
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