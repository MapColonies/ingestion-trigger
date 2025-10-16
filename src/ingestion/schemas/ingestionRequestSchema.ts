import z from 'zod';
import {
  callbackUrlsArraySchema,
  inputFilesSchema,
  newRasterLayerMetadataSchema,
  updateRasterLayerMetadataSchema,
} from '@map-colonies/raster-shared';

export const newRasterLayerRequestSchema = z.object({
  metadata: newRasterLayerMetadataSchema,
  inputFiles: inputFilesSchema,
  callbackUrls: callbackUrlsArraySchema.optional(),
});

export const updateRasterLayerRequestSchema = z.object({
  metadata: updateRasterLayerMetadataSchema,
  inputFiles: inputFilesSchema,
  callbackUrls: callbackUrlsArraySchema.optional(),
});
