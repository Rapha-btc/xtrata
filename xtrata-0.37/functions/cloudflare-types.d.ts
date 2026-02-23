type PagesFunction = (context: {
  request: Request;
  env: any;
  params?: any;
  waitUntil?: (promise: Promise<unknown>) => void;
  next?: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  data?: any;
}) => Response | Promise<Response>;

interface D1Result<T = Record<string, unknown>> {
  results?: T[];
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface R2Bucket {
  get(
    key: string
  ): Promise<{
    body: ReadableStream<Uint8Array> | null;
    httpMetadata?: {
      contentType?: string;
    };
  } | null>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string,
    options?: {
      httpMetadata?: {
        contentType?: string;
      };
    }
  ): Promise<unknown>;
  delete(key: string | string[]): Promise<unknown>;
  list(options?: {
    prefix?: string;
    cursor?: string;
  }): Promise<{
    objects: Array<{
      key: string;
      size?: number;
      uploaded?: Date;
    }>;
    truncated: boolean;
    cursor?: string;
  }>;
  getUploadUrl(options: {
    method: 'PUT' | 'POST';
    key: string;
    expires?: number;
  }): Promise<string>;
}
