import { VALIDATIONS } from '@map-colonies/mc-model-types';

/* eslint-disable @typescript-eslint/no-magic-numbers */
export const PRODUCT_ID_REGEX = new RegExp(VALIDATIONS.productId.pattern);
export const GPKG_REGEX = new RegExp(VALIDATIONS.fileNames.pattern);
export const CLASSIFICATION_REGEX = new RegExp(VALIDATIONS.classification.pattern);
export const resolutionMeterRange = { min: VALIDATIONS.resolutionMeter.min, max: VALIDATIONS.resolutionMeter.max };
export const resolutionDegRange = { min: VALIDATIONS.resolutionDeg.min , max: VALIDATIONS.resolutionDeg.max };
export const horizontalAccuracyCE90Range = { min: VALIDATIONS.horizontalAccuracyCE90.min, max: VALIDATIONS.horizontalAccuracyCE90.max };
export const scaleRange = { min: VALIDATIONS.scale.min, max: VALIDATIONS.scale.max };
/* eslint-enable @typescript-eslint/no-magic-numbers */
