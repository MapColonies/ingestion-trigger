import z from 'zod';
import { newRasterLayerRequestSchema, updateRasterLayerRequestSchema } from '../schemas/ingestionRequestSchema';

//#region LayerRequests
export type IngestionNewLayerRequest = z.infer<typeof newRasterLayerRequestSchema>;
export type IngestionUpdateLayerRequest = z.infer<typeof updateRasterLayerRequestSchema>;
//#endregion
