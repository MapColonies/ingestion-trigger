/* istanbul ignore next @preserve */
export class FileNotFoundError extends Error {
  public constructor(fileName: string);
  public constructor(fileName: string, path: string);
  public constructor(fileName: string, path?: string) {
    const message = path != null ? `File '${fileName}' does not exist in path ${path}` : `File ${fileName} does not exist`;
    super(message);
  }
}

export class GdalInfoError extends Error {
  public constructor(message: string) {
    super(message);
  }
}
