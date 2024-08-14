import { z } from 'zod';
import { zoomLevelToResolutionDeg } from '@map-colonies/mc-utils';
import { GeoJSON } from 'geojson';
import { DependencyContainer } from 'tsyringe';
import { PixelRange } from '../interfaces';
import { SERVICES } from '../../common/constants';
import { ConfigType } from '../../common/config';

const basicInfoDataSchema = z
  .object({
    crs: z.number(),
    fileFormat: z.string(),
    pixelSize: z.number(),
    extentPolygon: z.custom<GeoJSON>(),
  })
  .describe('InfoDataSchema');

export const infoDataSchemaArray = z.array(basicInfoDataSchema);
export type InfoDataWithFile = z.infer<typeof basicInfoDataSchema> & { fileName: string };
export type InfoData = z.infer<typeof basicInfoDataSchema>;

// eslint-disable-next-line @typescript-eslint/no-magic-numbers
export const pixelSizeRange: PixelRange = { min: zoomLevelToResolutionDeg(22) as number, max: zoomLevelToResolutionDeg(0) as number };

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createInfoDataSchema = (container: DependencyContainer) => {
  const config = container.resolve<ConfigType>(SERVICES.CONFIG);
  const validCRSs = config.get('validationValuesByInfo.crs');
  const validFormats = config.get('validationValuesByInfo.fileFormat').map((format) => format.toLowerCase());

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
