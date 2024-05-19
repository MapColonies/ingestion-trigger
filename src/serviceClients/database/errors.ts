export class GpkgError extends Error {
  public constructor(message: string) {
    super(message);
  }
}

export class InvalidIndexError extends GpkgError {
  public constructor(message: string) {
    super(message);
  }
}

export class UnsupportedGridError extends GpkgError {
  public constructor(message: string) {
    super(message);
  }
}

export class UnsupportedTileSizeError extends GpkgError {
  public constructor(message: string) {
    super(message);
  }
}
