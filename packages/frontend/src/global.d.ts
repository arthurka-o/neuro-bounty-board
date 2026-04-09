declare global {
  interface Window {
    tlsn?: {
      execCode: (
        code: string,
        options?: {
          requestId?: string;
          sessionData?: Record<string, string>;
        },
      ) => Promise<string>;
    };
  }
}

export {};
