const insensitiveExt = (ext: string, base = '', idx = 0): string[] => {
  const lowerBase = base + ext[idx].toLowerCase();
  const upperBase = base + ext[idx].toUpperCase();
  if (idx >= ext.length - 1) {
    return [lowerBase, upperBase];
  } else {
    return insensitiveExt(ext, lowerBase, idx + 1).concat(insensitiveExt(ext, upperBase, idx + 1));
  }
};

export const makeInsensitive = (...values: string[]): string[] => {
  const newValues: string[] = [];
  values.forEach((value: string) => {
    newValues.push(...insensitiveExt(value));
  });
  return newValues;
};
