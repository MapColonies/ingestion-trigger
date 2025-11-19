import { Logger } from '@map-colonies/js-logger';
import { ChunkProcessor, ReaderOptions, ShapefileChunk, ShapefileChunkReader } from '@map-colonies/mc-utils';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';
import { trace, Tracer } from '@opentelemetry/api';
import { Feature } from 'geojson';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import type { IConfig } from '../../common/interfaces';
import { LogContext } from '../../common/interfaces';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, type SchemasValidator } from '../../utils/validation/schemasValidator';
import { UnsupportedEntityError, ValidationError } from '../errors/ingestionErrors';
import type { ProductFeatureGeometry } from '../schemas/productFeatureSchema';

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
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    @inject(INGESTION_SCHEMAS_VALIDATOR_SYMBOL) private readonly schemasValidator: SchemasValidator
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

  @withSpanAsyncV4
  public async read(productShapefilePath: string): Promise<ProductFeatureGeometry> {
    const logCtx: LogContext = { ...this.logContext, function: this.read.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('productManager.read');

    try {
      await this.readAndProcess(productShapefilePath);
      this.logger.debug({ msg: `parse validate product geometry`, logContext: logCtx });

      const productGeometry = await this.validateProductFeature(productShapefilePath);
      return productGeometry;
    } catch (error) {
      let errorMessage: string;
      if (error instanceof UnsupportedEntityError) {
        errorMessage = `Failed to read product shapefile: ${error.message}`;
      } else if (error instanceof ValidationError) {
        errorMessage = `Product shapefile is not valid: ${error.message}`;
      } else {
        errorMessage = `An unexpected error occurred during product shapefile validation: ${
          error instanceof Error ? error.message : JSON.stringify(error)
        }`;
      }

      this.logger.error({
        msg: errorMessage,
        logContext: logCtx,
        productShapefilePath,
      });
      activeSpan?.recordException(error instanceof Error ? error : errorMessage);

      throw error;
    }
  }

  @withSpanAsyncV4
  private async process(chunk: ShapefileChunk): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.process.name };
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('productManager.process');

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

  @withSpanAsyncV4
  private async validateProductFeature(productShapefilePath: string): Promise<ProductFeatureGeometry> {
    try {
      const productGeometry = await this.schemasValidator.validateProductFeature(this.features);
      return productGeometry;
    } catch (error) {
      let errorMessage = `Failed to validate product shapefile of file: ${productShapefilePath}`;
      if (error instanceof Error) {
        errorMessage = `${errorMessage}: ${error.message}`;
      }
      throw new ValidationError(errorMessage);
    }
  }

  @withSpanAsyncV4
  private async readAndProcess(productShapefilePath: string): Promise<void> {
    try {
      await this.reader.readAndProcess(productShapefilePath, this.processor);
    } catch (error) {
      let errorMessage = `Failed to read product shapefile of file: ${productShapefilePath}`;
      if (error instanceof Error) {
        errorMessage = `${errorMessage}: ${error.message}`;
      }

      // since no custom error is returned when shapefile is empty, the error message matching is used to handle this case
      if (error instanceof Error && /^Shapefile (\/?[\w-]+)(\/[\w-]+)*\/Product.shp has no valid features or vertices$/.test(error.message)) {
        throw new ValidationError(errorMessage);
      } else {
        throw new UnsupportedEntityError(errorMessage);
      }
    }
  }
}
