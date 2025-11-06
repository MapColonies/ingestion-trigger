export class UnsupportedEntityError extends Error {
  public constructor(message: string) {
    super(message);
  }
}
export class FileNotFoundError extends UnsupportedEntityError {
  public constructor(fileName: string);
  public constructor(fileName: string, path: string);
  public constructor(fileName: string, path?: string) {
    const message = path != null ? `File '${fileName}' does not exist in path ${path}` : `File ${fileName} does not exist`;
    super(message);
  }
}

export class GdalInfoError extends UnsupportedEntityError {
  public constructor(message: string) {
    super(message);
  }
}

export class ChecksumError extends UnsupportedEntityError {
  public constructor(message: string) {
    super(message);
  }
}

// TODO: DOES THIS ERROR BELONGS HERE?
export class ValidationError extends Error {
  public constructor(message: string) {
    super(message);
  }
}
