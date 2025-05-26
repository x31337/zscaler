declare module 'chrome-remote-interface' {
  interface CDP {
    (options: { port: number; local: boolean }): Promise<CDP.Client>;
  }
  namespace CDP {
    interface Client {
      Network: {
        enable(): Promise<void>;
      };
      Page: {
        enable(): Promise<void>;
      };
      Runtime: {
        enable(): Promise<void>;
      };
      close(): Promise<void>;
    }
  }
  const CDP: CDP;
  export default CDP;
}

