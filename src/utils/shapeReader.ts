import { ShapefileChunkReader, ReaderOptions, ChunkProcessor, ShapefileChunk } from '@map-colonies/mc-utils';
import jsLogger, { Logger } from '@map-colonies/js-logger';

import { RequestHandler } from 'express';
import { StatusCodes } from 'http-status-codes';
import { inject, injectable } from 'tsyringe';
import { HttpError } from 'express-openapi-validator/dist/framework/types';
import { InputFiles, IngestionNewLayerRequest, IngestionUpdateLayerRequest } from '@map-colonies/raster-shared';
import { SERVICES } from '../common/constants';
import { IConfig } from 'config';
import { GeoJsonProperties, Geometry } from 'geojson';
import { feature } from '@turf/turf';
import { Feature } from 'geojson';

@injectable()
export class ShapeHandler {
  private readonly options: ReaderOptions;
  private readonly reader: ShapefileChunkReader;
  private readonly processor: ChunkProcessor;
  private readonly features: Feature[] = [];

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
  ) {
    this.options = {
      // would be taken from config
      maxVerticesPerChunk: 1000,
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
      return this.features[0];
    } catch (error) {
      console.log('error', error);
    }
  };

  private async process(chunk: ShapefileChunk) {
    this.logger.debug({ msg: 'start processing', features: chunk.features, count: chunk.features.length });
    this.logger.info(`Processing chunk ${chunk.id} with ${chunk.features.length} features`);
    for await (const feature of chunk.features) {
      this.features.push(feature);
    };
    this.logger.debug(`processor done with ${chunk.features.length} features: ${chunk.features.length}`);
  }
}
