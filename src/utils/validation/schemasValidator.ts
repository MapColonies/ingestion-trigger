import { InputFiles, inputFilesSchema, newRasterLayerMetadataSchema, updateRasterLayerMetadataSchema } from '@map-colonies/raster-shared';
import { DependencyContainer } from 'tsyringe';
import type z from 'zod';
import { gdalInfoSchema, type GdalInfo } from '../../ingestion/schemas/gdalDataSchema';
import { createInfoDataSchema, InfoData } from '../../ingestion/schemas/infoDataSchema';
import { rasterLayersCatalogSchema, type RasterLayersCatalog } from '../../ingestion/schemas/layerCatalogSchema';
import { newLayerSchema, type IngestionNewLayer } from '../../ingestion/schemas/newLayerSchema';
import { updateLayerSchema, type IngestionUpdateLayerRequest } from '../../ingestion/schemas/updateLayerSchema';
import { ZodValidator } from './zodValidator';

const gpkgInputFilesSchema = inputFilesSchema.pick({ gpkgFilesPath: true });

export type GpkgInputFiles = z.infer<typeof gpkgInputFilesSchema>;
export type IngestionNewMetadata = z.infer<typeof newRasterLayerMetadataSchema>;
export type IngestionUpdateMetadata = z.infer<typeof updateRasterLayerMetadataSchema>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function schemasValidationsFactory(container: DependencyContainer) {
  const validator = container.resolve(ZodValidator);
  const infoDataSchema = createInfoDataSchema(container);

  return {
    validateInputFilesRequestBody: async (value: unknown): Promise<InputFiles> => validator.validate(inputFilesSchema, value),
    validateGpkgsInputFilesRequestBody: async (value: unknown): Promise<GpkgInputFiles> => validator.validate(gpkgInputFilesSchema, value),
    validateInfoData: async (value: unknown): Promise<InfoData> => validator.validate(infoDataSchema, value),
    validateGdalInfo: async (value: unknown): Promise<GdalInfo> => validator.validate(gdalInfoSchema, value),
    validateNewLayerRequest: async (value: unknown): Promise<IngestionNewLayer> => validator.validate(newLayerSchema, value),
    validateNewMetadata: async (value: unknown): Promise<IngestionNewMetadata> => validator.validate(newRasterLayerMetadataSchema, value),
    validateUpdateMetadata: async (value: unknown): Promise<IngestionUpdateMetadata> => validator.validate(updateRasterLayerMetadataSchema, value),
    validateUpdateLayerRequest: async (value: unknown): Promise<IngestionUpdateLayerRequest> => validator.validate(updateLayerSchema, value),
    validateRasterLayersCatalog: async (value: unknown): Promise<RasterLayersCatalog> => validator.validate(rasterLayersCatalogSchema, value),
  };
}

export type SchemasValidator = ReturnType<typeof schemasValidationsFactory>;

export const INGESTION_SCHEMAS_VALIDATOR_SYMBOL = Symbol('SchemasValidator');
