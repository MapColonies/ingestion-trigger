export class InvalidGpkgError extends Error {
  public constructor(message: string) {
    super(message);
  }
}

export class InvalidIndexError extends InvalidGpkgError {
  public constructor(message: string) {
    super(message);
  }
}

export class UnsupportedGridError extends InvalidGpkgError {
  public constructor(message: string) {
    super(message);
  }
}

export class UnsupportedTileSizeError extends InvalidGpkgError {
  public constructor(message: string) {
    super(message);
  }
}
