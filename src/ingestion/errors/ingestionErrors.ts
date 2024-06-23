/* istanbul ignore next @preserve */

export class ValidationError extends Error {
  public constructor(message: string) {
    super(message);
  }
}
export class FileNotFoundError extends ValidationError {
  public constructor(fileName: string);
  public constructor(fileName: string, path: string);
  public constructor(fileName: string, path?: string) {
    const message = path != null ? `File '${fileName}' does not exist in path ${path}` : `File ${fileName} does not exist`;
    super(message);
  }
}

export class GdalInfoError extends ValidationError {
  public constructor(message: string) {
    super(message);
  }
}

export class GeometryValidationError extends ValidationError {
  public constructor(partDataName: string, index: number, description: string) {
    const message = `error in part: ${partDataName} at index ${index}. ${description}`;
    super(message);
  }
}
