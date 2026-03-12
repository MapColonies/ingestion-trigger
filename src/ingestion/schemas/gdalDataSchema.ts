import { z } from 'zod';
import { Geometry } from 'geojson';

export const gdalInfoSchema = z
  .object({
    stac: z.object({
      'proj:epsg': z.number(),
    }),
    geoTransform: z.array(z.number()),
    driverShortName: z.string(),
    wgs84Extent: z.custom<Geometry>(),
  })
  .describe('GdalInfoSchema');

export type GdalInfo = z.infer<typeof gdalInfoSchema>;
