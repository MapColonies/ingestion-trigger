export function mergeKeywords(existing: string | undefined, incoming: string | undefined): string | undefined {
  const toTokens = (value: string | undefined): string[] =>
    (value ?? '')
      .split(',')
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 0);
  const merged = [...new Set([...toTokens(existing), ...toTokens(incoming)])];
  return merged.length > 0 ? merged.join(',') : undefined;
}
