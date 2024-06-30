import { zoomLevelToResolutionDeg, zoomLevelToResolutionMeter } from '@map-colonies/mc-utils';

/* eslint-disable @typescript-eslint/no-magic-numbers */
export const PRODUCT_ID_REGEX = new RegExp('^[a-zA-Z0-9_-]+$');
export const GPKG_REGEX = new RegExp('^.+.[Gg][Pp][Kk][Gg]$');
export const CLASSIFICATION_REGEX = new RegExp('^[0-9]$|^[1-9][0-9]$|^(100)$');
export const resolutionMeterRange = { min: zoomLevelToResolutionMeter(22), max: zoomLevelToResolutionMeter(0) };
export const resolutionDegRange = { min: zoomLevelToResolutionDeg(22), max: zoomLevelToResolutionDeg(0) };
export const horizontalAccuracyCE90Range = { min: 0.01, max: 4000 };
export const scaleRange = { min: 0, max: 100000000 };
/* eslint-enable @typescript-eslint/no-magic-numbers */
