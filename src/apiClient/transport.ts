export interface JsonRequestOptions {
  baseUrl: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  token?: string;
  body?: unknown;
  timeoutMs?: number;
}

export interface RawRequestOptions {
  baseUrl: string;
  path: string;
  method: 'POST' | 'PUT' | 'DELETE';
  token?: string;
  body?: Uint8Array;
  contentType?: string;
}

export interface ApiTransport {
  requestJson<T>(options: JsonRequestOptions): Promise<T>;
  requestRaw(options: RawRequestOptions): Promise<void>;
}
