import { InputFiles } from '@map-colonies/raster-shared';
import { DependencyContainer } from 'tsyringe';
import { GpkgInputFiles } from '../../ingestion/interfaces';
import { gdalInfoSchema, type GdalInfo } from '../../ingestion/schemas/gdalDataSchema';
import { createInfoDataSchema, InfoData } from '../../ingestion/schemas/infoDataSchema';
import { createNewIngestionLayerSchema, type IngestionNewLayer } from '../../ingestion/schemas/ingestionLayerSchema';
import { createGpkgInputFilesSchema, createInputFilesSchema } from '../../ingestion/schemas/inputFilesSchema';
import { createRasterLayersCatalogSchema, type RasterLayersCatalog } from '../../ingestion/schemas/layerCatalogSchema';
import { createNewMetadataSchema, type IngestionNewMetadata } from '../../ingestion/schemas/newMetadataSchema';
import { createUpdateLayerSchema, type IngestionUpdateLayerRequest } from '../../ingestion/schemas/updateLayerSchema';
import { createUpdateMetadataSchema, type IngestionUpdateMetadata } from '../../ingestion/schemas/updateMetadataSchema';
import { ZodValidator } from './zodValidator';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function schemasValidationsFactory(container: DependencyContainer) {
  const validator = container.resolve(ZodValidator);

  const inputFilesSchema = createInputFilesSchema();
  const gpkgInputFilesSchema = createGpkgInputFilesSchema();
  const infoDataSchema = createInfoDataSchema(container);
  const newLayerSchema = createNewIngestionLayerSchema();
  const newMetadataSchema = createNewMetadataSchema();
  const updateLayerSchema = createUpdateLayerSchema();
  const updateMetadataSchema = createUpdateMetadataSchema();
  const rasterLayersCatalog = createRasterLayersCatalogSchema();


  return {
    validateInputFilesRequestBody: async (value: unknown): Promise<InputFiles> => validator.validate(inputFilesSchema, value),
    validateGpkgsInputFilesRequestBody: async (value: unknown): Promise<GpkgInputFiles> => validator.validate(gpkgInputFilesSchema, value),
    validateInfoData: async (value: unknown): Promise<InfoData> => validator.validate(infoDataSchema, value),
    validateGdalInfo: async (value: unknown): Promise<GdalInfo> => validator.validate(gdalInfoSchema, value),
    validateNewLayerRequest: async (value: unknown): Promise<IngestionNewLayer> => validator.validate(newLayerSchema, value),
    validateNewMetadata: async (value: unknown): Promise<IngestionNewMetadata> => validator.validate(newMetadataSchema, value),
    validateUpdateMetadata: async (value: unknown): Promise<IngestionUpdateMetadata> => validator.validate(updateMetadataSchema, value),
    validateUpdateLayerRequest: async (value: unknown): Promise<IngestionUpdateLayerRequest> => validator.validate(updateLayerSchema, value),
    validateRasterLayersCatalog: async (value: unknown): Promise<RasterLayersCatalog> => validator.validate(rasterLayersCatalog, value),
  };
}

export type SchemasValidator = ReturnType<typeof schemasValidationsFactory>;

export const INGESTION_SCHEMAS_VALIDATOR_SYMBOL = Symbol('SchemasValidator');
