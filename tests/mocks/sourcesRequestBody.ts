// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
import { faker } from '@faker-js/faker';
import { InputFiles } from '@map-colonies/raster-shared';

const gpkgFileName = faker.system.commonFileName('gpkg');
const fakeDirPath = faker.system.directoryPath();
export const fakeGpkgFilePath = `${fakeDirPath}/${gpkgFileName}`;
export const fakeShapeMetadatafilePath = `${fakeDirPath}/ShapeMetadata.shp`;
export const fakeProductShapaefilePath = `${fakeDirPath}/Product.shp`;

export const mockInputFiles: InputFiles = {
  gpkgFilesPath: [fakeGpkgFilePath],
  metadataShapefilePath: fakeShapeMetadatafilePath,
  productShapefilePath: fakeProductShapaefilePath,
};
