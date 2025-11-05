import { join, relative } from 'node:path';
import type { InputFiles } from '@map-colonies/raster-shared';
import type { IngestionNewLayer } from '../ingestion/schemas/ingestionLayerSchema';

export const getAbsolutePathInputFiles = ({
  sourceMount,
  inputFiles,
}: { sourceMount: string } & Pick<IngestionNewLayer, 'inputFiles'>): Pick<IngestionNewLayer, 'inputFiles'> => {
  return {
    inputFiles: {
      ...getAbsoluteGpkgFilesPath({ sourceMount, gpkgFilesPath: inputFiles.gpkgFilesPath }),
      metadataShapefilePath: join(sourceMount, inputFiles.metadataShapefilePath),
      productShapefilePath: join(sourceMount, inputFiles.productShapefilePath),
    },
  };
};

export const getRelativePathInputFiles = ({
  sourceMount,
  inputFiles,
}: { sourceMount: string } & Pick<IngestionNewLayer, 'inputFiles'>): Pick<IngestionNewLayer, 'inputFiles'> => {
  return {
    inputFiles: {
      gpkgFilesPath: inputFiles.gpkgFilesPath.map((gpkgFilePath) => relative(sourceMount, gpkgFilePath)),
      metadataShapefilePath: relative(sourceMount, inputFiles.metadataShapefilePath),
      productShapefilePath: relative(sourceMount, inputFiles.productShapefilePath),
    },
  };
};

export const getAbsoluteGpkgFilesPath = ({
  sourceMount,
  gpkgFilesPath,
}: { sourceMount: string } & Pick<InputFiles, 'gpkgFilesPath'>): Pick<InputFiles, 'gpkgFilesPath'> => {
  return { gpkgFilesPath: gpkgFilesPath.map((gpkgFilePath) => join(sourceMount, gpkgFilePath)) };
};
