import { z } from 'zod';
import { GeoJSON } from 'geojson';
import { DependencyContainer } from 'tsyringe';
import { IConfig } from 'config';
import { PixelRange } from '../interfaces';
import { SERVICES } from '../../common/constants';

const basicInfoDataSchema = z
  .object({
    crs: z.number(),
    fileFormat: z.string(),
    pixelSize: z.number(),
    extentPolygon: z.custom<GeoJSON>(),
  })
  .describe('InfoDataSchema');

export type InfoData = z.infer<typeof basicInfoDataSchema>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createInfoDataSchema = (container: DependencyContainer) => {
  const config = container.resolve<IConfig>(SERVICES.CONFIG);
  const validCRSs = config.get<number[]>('validationValuesByInfo.crs');
  const validFormats = config.get<string[]>('validationValuesByInfo.fileFormat').map((format) => format.toLowerCase());
  const pixelSizeRange = config.get<PixelRange>('validationValuesByInfo.pixelSizeRange');

  const infoDataSchema = basicInfoDataSchema
    .refine(
      ({ crs }) => {
        const isCrsValid = validCRSs.includes(crs);
        return isCrsValid;
      },
      ({ crs }) => ({ message: `Unsupported CRS: ${crs}, must have valid CRS: ${validCRSs.toString()}.` })
    )
    .refine(
      ({ fileFormat }) => {
        const isValidFormat = validFormats.includes(fileFormat.toLowerCase());
        return isValidFormat;
      },
      ({ fileFormat }) => ({ message: `Unsupported file format: ${fileFormat}, must have valid file format: ${validFormats.toString()}.` })
    )
    .refine(
      ({ pixelSize }) => {
        const isPixelSizeValid = pixelSize >= pixelSizeRange.min && pixelSize <= pixelSizeRange.max;
        return isPixelSizeValid;
      },
      ({ pixelSize }) => ({ message: `Unsupported pixel size (${pixelSize}): should be between ${pixelSizeRange.min} and ${pixelSizeRange.max}.` })
    );

  return infoDataSchema;
};
