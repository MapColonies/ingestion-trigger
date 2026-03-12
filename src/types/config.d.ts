declare module 'config' {
  const config: {
    get: <T>(key: string) => T;
    has: (key: string) => boolean;
  };
  export default config;
}
