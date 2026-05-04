import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

export class HttpError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  public constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export interface JsonRequestOptions {
  baseUrl: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  token?: string;
  body?: unknown;
}

function isLocalhost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export async function requestJson<T>(options: JsonRequestOptions): Promise<T> {
  const url = new URL(options.path, options.baseUrl);
  const transport = url.protocol === 'https:' ? https : http;

  const bodyString = options.body === undefined ? undefined : JSON.stringify(options.body);

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (bodyString !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(bodyString).toString();
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  return new Promise<T>((resolve, reject) => {
    const req = transport.request(
      {
        method: options.method,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        headers,
        // Node.js does not use the OS certificate store, so self-signed dev certs on
        // localhost are rejected even when trusted system-wide. Allow them explicitly.
        ...(url.protocol === 'https:' && isLocalhost(url.hostname) ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));

        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 0;

          const parsed = text.length === 0 ? undefined : tryParseJson(text);

          if (status >= 200 && status < 300) {
            resolve(parsed as T);
            return;
          }

          reject(new HttpError(status, `HTTP ${status} for ${options.method} ${options.path}`, parsed));
        });
      },
    );

    req.on('error', reject);

    if (bodyString !== undefined) {
      req.write(bodyString);
    }

    req.end();
  });
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface RawRequestOptions {
  baseUrl: string;
  path: string;
  method: 'POST' | 'PUT' | 'DELETE';
  token?: string;
  body?: Buffer;
  contentType?: string;
}

/**
 * Makes an HTTP request with a raw binary body. Used for file uploads.
 */
export async function requestRaw(options: RawRequestOptions): Promise<void> {
  const url = new URL(options.path, options.baseUrl);
  const transport = url.protocol === 'https:' ? https : http;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = options.contentType ?? 'application/octet-stream';
    headers['Content-Length'] = options.body.byteLength.toString();
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  return new Promise<void>((resolve, reject) => {
    const req = transport.request(
      {
        method: options.method,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        headers,
        ...(url.protocol === 'https:' && isLocalhost(url.hostname) ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          if (status >= 200 && status < 300) {
            resolve();
            return;
          }
          const text = Buffer.concat(chunks).toString('utf8');
          reject(new HttpError(status, `HTTP ${status} for ${options.method} ${options.path}`, tryParseJson(text)));
        });
      },
    );

    req.on('error', reject);

    if (options.body !== undefined) {
      req.write(options.body);
    }

    req.end();
  });
}
