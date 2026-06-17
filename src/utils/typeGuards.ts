export function isKeyOf<const T extends Record<PropertyKey, unknown>>(key: PropertyKey, object: T): key is keyof T {
  return key in object;
}
