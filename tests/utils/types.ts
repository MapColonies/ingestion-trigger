export type DeepPartial<T> = T extends object
  ? {
      [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
    }
  : T;

export type DeepRequired<T> = T extends object
  ? {
      [K in keyof T]-?: T[K] extends object ? DeepRequired<T[K]> : T[K];
    }
  : T;

export type FlattenLeafKeyTupleUnion<T> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown> ? [K, ...FlattenLeafKeyTupleUnion<T[K]>] : [K];
}[keyof T & string];

export type FlattenKeyTupleUnion<T> = {
  [K in keyof T & string]: [K,] | (T[K] extends Record<string, unknown> ? [K, ...FlattenKeyTupleUnion<T[K]>] : [K]);
}[keyof T & string];

export type FlatRecordValues<T> = {
  [K in keyof T as T[K] extends unknown[] ? (K extends `${infer Q}s` ? Q : K) : K]: T[K] extends (infer U)[] ? U : T[K];
};

export type ReplaceValueWithFunctionResponse<T extends object> = {
  [K in keyof T]: (...args: any[]) => T[K];
};
