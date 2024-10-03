/* eslint-disable @typescript-eslint/naming-convention */
import { GeoJSON } from 'geojson';
import { z } from 'zod';
import { partSchema } from '@map-colonies/mc-model-types'
import { getUTCDate } from '@map-colonies/mc-utils';

export type Part = z.infer<typeof partSchema>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createPartDataSchema = () => {
  return z
    .array(
      partSchema
        .refine(
          (data: Part) => {
            const isImagingTimeBeginUTCValid = data.imagingTimeBeginUTC <= getUTCDate();
            return isImagingTimeBeginUTCValid;
          },
          (data: Part) => ({
            message: `imagingTimeBeginUTC: ${data.imagingTimeBeginUTC.toISOString()} should be before current time in utc: ${getUTCDate().toISOString()}.`,
          })
        )
        .refine(
          (data: Part) => {
            const isImagingTimeEndUTCValid = data.imagingTimeEndUTC <= getUTCDate();
            return isImagingTimeEndUTCValid;
          },
          (data: Part) => ({
            message: `imagingTimeEndUTC: ${data.imagingTimeEndUTC.toISOString()} should be before current time in utc: ${getUTCDate().toISOString()}.`,
          })
        )
        .refine(
          (data: Part) => {
            const isValidImagingTime = data.imagingTimeEndUTC >= data.imagingTimeBeginUTC;
            return isValidImagingTime;
          },
          (data: Part) => ({
            message: `imagingTimeEndUTC: ${data.imagingTimeEndUTC.toISOString()} must be after imagingTimeBeginUTC: ${data.imagingTimeBeginUTC.toISOString()}`,
          })
        )
        .refine(
          (data: Part) => {
            const isValidGeoJson = typeof data.footprint === 'object' && (data.footprint.type === 'Polygon' || data.footprint.type === 'MultiPolygon');
            return isValidGeoJson;
          },
          () => ({
            message: `footprint is not a valid polygon`,
          })
        )
    )
    .min(1)
    .describe('PartData');
};
