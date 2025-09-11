import { PolygonPart } from '@map-colonies/mc-model-types';
import { InputFiles } from '@map-colonies/raster-shared';
import { DependencyContainer } from 'tsyringe';
import { gdalInfoSchema, type GdalInfo } from '../../ingestion/schemas/gdalDataSchema';
import { InfoData, createInfoDataSchema } from '../../ingestion/schemas/infoDataSchema';
import { createNewIngestionLayerSchema, type IngestionNewLayer } from '../../ingestion/schemas/ingestionLayerSchema';
import { createInputFilesSchema } from '../../ingestion/schemas/inputFilesSchema';
import { createNewMetadataSchema, type IngestionNewMetadata } from '../../ingestion/schemas/newMetadataSchema';
import { createPartsDataSchema } from '../../ingestion/schemas/partsDataSchema';
import { createUpdateLayerSchema, type IngestionUpdateLayer } from '../../ingestion/schemas/updateLayerSchema';
import { createUpdateMetadataSchema, type IngestionUpdateMetadata } from '../../ingestion/schemas/updateMetadataSchema';
import { ZodValidator } from './zodValidator';

//
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function schemasValidationsFactory(container: DependencyContainer) {
  const validator = container.resolve(ZodValidator);

  const inputFilesSchema = createInputFilesSchema();
  const infoDataSchema = createInfoDataSchema(container);
  const newLayerSchema = createNewIngestionLayerSchema();
  const newMetadataSchema = createNewMetadataSchema();
  const partsDataSchema = createPartsDataSchema();
  const updateLayerSchema = createUpdateLayerSchema();
  const updateMetadataSchema = createUpdateMetadataSchema();

  return {
    validateInputFilesRequestBody: async (value: unknown): Promise<InputFiles> => validator.validate(inputFilesSchema, value),
    validateInfoData: async (value: unknown): Promise<InfoData> => validator.validate(infoDataSchema, value),
    validateGdalInfo: async (value: unknown): Promise<GdalInfo> => validator.validate(gdalInfoSchema, value),
    validateNewLayerRequest: async (value: unknown): Promise<IngestionNewLayer> => validator.validate(newLayerSchema, value),
    validateNewMetadata: async (value: unknown): Promise<IngestionNewMetadata> => validator.validate(newMetadataSchema, value),
    validatepartsData: async (value: unknown): Promise<PolygonPart[]> => validator.validate(partsDataSchema, value),
    validateUpdateMetadata: async (value: unknown): Promise<IngestionUpdateMetadata> => validator.validate(updateMetadataSchema, value),
    validateUpdateLayerRequest: async (value: unknown): Promise<IngestionUpdateLayer> => validator.validate(updateLayerSchema, value),
  };
}

export type SchemasValidator = ReturnType<typeof schemasValidationsFactory>;

export const INGESTION_SCHEMAS_VALIDATOR_SYMBOL = Symbol('SchemasValidator');
