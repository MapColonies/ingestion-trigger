import { DependencyContainer } from 'tsyringe';
import { z } from 'zod';
import { InputFiles, NewRasterLayer } from '@map-colonies/mc-model-types';
import { createInputFilesSchema } from '../../ingestion/schemas/inputFilesSchema';
import { InfoData, createInfoDataSchema } from '../../ingestion/schemas/infoDataSchema';
import { gdalInfoSchema } from '../../ingestion/schemas/gdalDataSchema';
import { createNewIngestionLayerSchema } from '../../ingestion/schemas/ingestionLayerSchema';
import { ZodValidator } from './zodValidator';

//
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function schemasValidationsFactory(container: DependencyContainer) {
  const validator = container.resolve(ZodValidator);

  const inputFilesSchema = createInputFilesSchema(container);
  const infoDataSchema = createInfoDataSchema(container);
  const rasterIngestionLayerSchema = createNewIngestionLayerSchema(container);

  return {
    validateInputFilesRequestBody: async (value: unknown): Promise<InputFiles> => validator.validate(inputFilesSchema, value),
    validateInfoData: async (value: unknown): Promise<InfoData> => validator.validate(infoDataSchema, value),
    validateGdalInfo: async (value: unknown): Promise<z.infer<typeof gdalInfoSchema>> => validator.validate(gdalInfoSchema, value),
    validateNewLayerRequest: async (value: unknown): Promise<NewRasterLayer> => validator.validate(rasterIngestionLayerSchema, value),
  };
}

export type SchemasValidator = ReturnType<typeof schemasValidationsFactory>;

export const INGESTION_SCHEMAS_VALIDATOR_SYMBOL = Symbol('SchemasValidator');
