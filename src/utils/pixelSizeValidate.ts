export const isPixelSizeValid = (requestedPixelSize: number, sourcePixelSize: number, resolutionFixedPointTolerance: number): boolean => {
  const fixedRequestedPixelSize = parseFloat(requestedPixelSize.toFixed(resolutionFixedPointTolerance));
  const fixedSourcePixelSize = parseFloat(sourcePixelSize.toFixed(resolutionFixedPointTolerance));
  return fixedRequestedPixelSize >= fixedSourcePixelSize;
};
