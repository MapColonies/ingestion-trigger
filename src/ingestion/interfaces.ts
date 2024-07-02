/* eslint-disable @typescript-eslint/no-magic-numbers */

export interface SourcesValidationResponse {
  isValid: boolean;
  message: string;
}

export interface ResponseStatus {
  status: string;
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

export interface ITaskParameters {
  blockDuplication?: boolean;
}
