import { z } from 'zod';
import { GeoJSON } from 'geojson';
import config from 'config';
import { PixelRange } from '../interfaces';

export const infoDataSchema = z
  .object({
    crs: z.number().refine((crs) => {
      const validCRSs = config.get<number[]>('validationValuesByInfo.crs');
      const isValidCrs = validCRSs.includes(crs);
      return isValidCrs ? true : { message: `Unsupported crs: ${crs}, must have valid crs: ${validCRSs.toString()}.` };
    }),
    fileFormat: z.string().refine((value) => {
      const validFormats = config.get<string[]>('validationValuesByInfo.fileFormat').map((format) => format.toLowerCase());
      const isValidFormat = validFormats.includes(value.toLowerCase());
      return isValidFormat ? true : { message: `Unsupported file format: ${value}, must have valid file format: ${validFormats.toString()}.` };
    }),
    pixelSize: z.number().refine((value) => {
      const pixelSizeRange = config.get<PixelRange>('validationValuesByInfo.pixelSizeRange');
      const isValidPixelSize = value > pixelSizeRange.min && value < pixelSizeRange.max;
      return isValidPixelSize
        ? true
        : { message: `Unsupported pixel size: ${value}, not in the range of: ${pixelSizeRange.min} to ${pixelSizeRange.max}.` };
    }),
    extentPolygon: z.custom<GeoJSON>(),
  })
  .describe('InfoDataSchema');

export type InfoData = z.infer<typeof infoDataSchema>;
