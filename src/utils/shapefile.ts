import { dirname, sep, basename } from 'node:path';
import { SHAPEFILE_EXTENSIONS_LIST } from '@map-colonies/raster-shared';

export const getShapefileFiles = (shapefilePath: string): string[] =>
  SHAPEFILE_EXTENSIONS_LIST.map((extension) => `${dirname(shapefilePath)}${sep}${basename(shapefilePath, '.shp')}${extension}`);
