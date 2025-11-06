import type { InputFiles } from '@map-colonies/raster-shared';
import type { ValidationTaskParameters } from '../../../src/ingestion/interfaces';

export const validInputFiles: Pick<ValidationTaskParameters, 'checksums'> & { inputFiles: InputFiles; } = {
  inputFiles: {
    gpkgFilesPath: ['validIndexed.gpkg'],
    productShapefilePath: 'validIndexed',
    metadataShapefilePath: 'validIndexed',
  },
  checksums: [
    { algorithm: 'XXH64', checksum: 'a0915c78be995614', fileName: 'metadata/validIndexed/ShapeMetadata.cpg' },
    { algorithm: 'XXH64', checksum: '1c4047022f216b6f', fileName: 'metadata/validIndexed/ShapeMetadata.dbf' },
    { algorithm: 'XXH64', checksum: '691fb87c5aeebb48', fileName: 'metadata/validIndexed/ShapeMetadata.prj' },
    { algorithm: 'XXH64', checksum: '5e371a633204f7eb', fileName: 'metadata/validIndexed/ShapeMetadata.shp' },
    { algorithm: 'XXH64', checksum: '89abcaac2015beff', fileName: 'metadata/validIndexed/ShapeMetadata.shx' },
  ],
};
