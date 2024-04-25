export interface SourcesValidationResponse {
  isValid: boolean;
  message: string;
}

export interface SourcesValidationResponseWithStatusCode extends SourcesValidationResponse {
  statusCode: number;
}

export interface PixelRange {
  min: number;
  max: number;
}
