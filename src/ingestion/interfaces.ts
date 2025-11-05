/* eslint-disable @typescript-eslint/no-magic-numbers */
import { ICreateJobResponse } from '@map-colonies/mc-priority-queue';
import { inputFilesSchema } from '@map-colonies/raster-shared';
import z from 'zod';
import { type baseIngestionValidationTaskParamsSchema } from '@map-colonies/raster-shared';
import type { Checksum } from '../utils/hash/interface';

export interface SourcesValidationResponse {
  isValid: boolean;
  message: string;
}

export interface ResponseId {
  jobId: ICreateJobResponse['id'];
  taskId: ICreateJobResponse['taskIds'][number];
}

export interface IRecordRequestParams {
  id: string;
}

export interface IJobRequestParams {
  jobId: string;
}

export interface PixelRange {
  min: number;
  max: number;
}

export interface IMatrixValues {
  matrixWidth: number;
  matrixHeight: number;
}

export enum Grid {
  TWO_ON_ONE = '2X1',
  ONE_ON_ONE = '1X1',
  NOT_SUPPORTED = 'NOT_SUPPORTED',
}

export enum MatrixRatio {
  TWO_ON_ONE = 2,
  ONE_ON_ONE = 1,
}

export const matrixRatioToGrid = new Map([
  [MatrixRatio.ONE_ON_ONE, Grid.ONE_ON_ONE],
  [MatrixRatio.TWO_ON_ONE, Grid.TWO_ON_ONE],
]);

export interface TileSize {
  width: number;
  height: number;
}

export type BaseValidationTaskParams = z.infer<typeof baseIngestionValidationTaskParamsSchema>;

export interface ChecksumValidationParameters {
  checksums: Checksum[];
}

export interface ValidationTaskParameters extends BaseValidationTaskParams, ChecksumValidationParameters { }

export const gpkgFilesPathSchema = inputFilesSchema.pick({ gpkgFilesPath: true });
export type GpkgInputFiles = z.infer<typeof gpkgFilesPathSchema>;