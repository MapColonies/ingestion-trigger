/* eslint-disable @typescript-eslint/no-magic-numbers */
import { ICreateJobResponse } from '@map-colonies/mc-priority-queue';
import { ingestionValidationTaskParamsSchema } from '@map-colonies/raster-shared';
import z from 'zod';
import { checksumSchema, type Checksum } from '../utils/hash/interfaces';

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

export interface IRetryRequestParams {
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

export type BaseValidationTaskParams = z.infer<typeof ingestionValidationTaskParamsSchema>;

export interface ChecksumValidationParameters {
  checksums: Checksum[];
}

export interface ValidationTaskParameters extends BaseValidationTaskParams, ChecksumValidationParameters {}

export const validationTaskParametersSchema = ingestionValidationTaskParamsSchema.extend({
  checksums: z.array(checksumSchema),
});

export const validationTaskParametersSchemaPartial = validationTaskParametersSchema.partial({ isValid: true });

export type TaskValidationParametersPartial = z.infer<typeof validationTaskParametersSchemaPartial>;
