export type DeepPartial<T> = T extends object
  ? {
      [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
    }
  : T;

export type FlatRecordValues<T> = {
  [K in keyof T as T[K] extends unknown[] ? (K extends `${infer Q}s` ? Q : K) : K]: T[K] extends (infer U)[] ? U : T[K];
};

export type ReplaceValueWithFunctionResponse<T extends object> = {
  [K in keyof T]: (...args: any[]) => T[K];
};
