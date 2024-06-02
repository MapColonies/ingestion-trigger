/* eslint-disable @typescript-eslint/naming-convention */
import { GeoJSON } from 'geojson';
import { z } from 'zod';
import { getUTCDate } from '@map-colonies/mc-utils';
import { horizontalAccuracyCE90Range, resolutionDegRange, resolutionMeterRange } from '../../common/constants';

//eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const partSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string(),
  description: z.string().optional(),
  imagingTimeBeginUTC: z.coerce.date(),
  imagingTimeEndUTC: z.coerce.date(),
  resolutionDegree: z
    .number()
    .min(resolutionDegRange.min as number)
    .max(resolutionDegRange.max as number),
  resolutionMeter: z
    .number()
    .min(resolutionMeterRange.min as number)
    .max(resolutionMeterRange.max as number),
  sourceResolutionMeter: z
    .number()
    .min(resolutionMeterRange.min as number)
    .max(resolutionMeterRange.max as number),
  horizontalAccuracyCE90: z.number().min(horizontalAccuracyCE90Range.min).max(horizontalAccuracyCE90Range.max),
  sensors: z.array(z.string()),
  countries: z.array(z.string()).optional(),
  cities: z.array(z.string()).optional(),
  geometry: z.custom<GeoJSON>(),
});

export type Part = z.infer<typeof partSchema>;

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
    )
    .describe('PartData');
};
