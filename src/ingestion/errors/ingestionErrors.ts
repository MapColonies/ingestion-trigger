export class UnsupportedEntityError extends Error {
  public constructor(message: string) {
    super(message);
  }
}
export class FileNotFoundError extends UnsupportedEntityError {
  public constructor(fileName: string);
  public constructor(fileName: string[]);
  public constructor(fileName: string, path: string);
  public constructor(fileName: string | string[], path?: string) {
    const names = Array.isArray(fileName) ? fileName.join(', ') : fileName;
    const message = Array.isArray(fileName)
      ? path !== undefined
        ? `Files '${names}' do not exist in path ${path}`
        : `Files ${names} do not exist`
      : path !== undefined
      ? `File '${names}' does not exist in path ${path}`
      : `File ${names} does not exist`;
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

export class ValidationError extends Error {
  public constructor(message: string) {
    super(message);
  }
}
