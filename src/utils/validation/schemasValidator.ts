import { DependencyContainer } from 'tsyringe';
import { z } from 'zod';
import { createInputFilesSchema } from '../../ingestion/schemas/inputFilesSchema';
import { InfoData, createInfoDataSchema } from '../../ingestion/schemas/infoDataSchema';
import { gdalInfoSchema } from '../../ingestion/schemas/gdalDataSchema';
import { ZodValidator } from './zodValidator';

//
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function schemasValidationsFactory(container: DependencyContainer) {
  const validator = container.resolve(ZodValidator);

  const inputFilesSchema = createInputFilesSchema(container);
  const infoDataSchema = createInfoDataSchema(container);

  return {
    validateInputFilesRequestBody: async (value: unknown): Promise<z.infer<typeof inputFilesSchema>> => validator.validate(inputFilesSchema, value),
    validateInfoData: async (value: unknown): Promise<InfoData> => validator.validate(infoDataSchema, value),
    validateGdalInfo: async (value: unknown): Promise<z.infer<typeof gdalInfoSchema>> => validator.validate(gdalInfoSchema, value),
  };
}

export type SchemasValidator = ReturnType<typeof schemasValidationsFactory>;

export const INGESTION_SCHEMAS_VALIDATOR_SYMBOL = Symbol('SchemasValidator');
