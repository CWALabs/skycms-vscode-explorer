import { logError, logInfo } from '../log';
import { HttpError } from './httpError';
import { ApiTransport, JsonRequestOptions, RawRequestOptions } from './transport';

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function requestJsonWeb<T>(options: JsonRequestOptions): Promise<T> {
  const url = new URL(options.path, options.baseUrl);
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  let body: string | undefined;
  if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const timeoutMs = options.timeoutMs ?? 20_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    logInfo(`HTTP ${options.method} ${url.toString()}`);
    const fetchFn = globalThis.fetch as unknown as (input: unknown, init?: unknown) => Promise<any>;
    const response = await fetchFn(url, {
      method: options.method,
      headers,
      body,
      signal: controller.signal,
    });

    const text = await response.text();
    const parsed = text.length === 0 ? undefined : tryParseJson(text);

    if (response.ok) {
      return parsed as T;
    }

    throw new HttpError(
      response.status,
      `HTTP ${response.status} for ${options.method} ${options.path}`,
      parsed,
      options.method,
      options.path,
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      const seconds = Math.round(timeoutMs / 1000);
      const timeoutError = new Error(`Request timed out after ${seconds}s: ${options.method} ${options.path}`);
      logError('HTTP timeout', timeoutError);
      throw timeoutError;
    }

    logError(`HTTP error for ${options.method} ${options.path}`, error);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function requestRawWeb(options: RawRequestOptions): Promise<void> {
  const url = new URL(options.path, options.baseUrl);
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = options.contentType ?? 'application/octet-stream';
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const fetchFn = globalThis.fetch as unknown as (input: unknown, init?: unknown) => Promise<any>;
  const response = await fetchFn(url, {
    method: options.method,
    headers,
    body: options.body,
  });

  if (response.ok) {
    return;
  }

  const text = await response.text();
  throw new HttpError(
    response.status,
    `HTTP ${response.status} for ${options.method} ${options.path}`,
    tryParseJson(text),
    options.method,
    options.path,
  );
}

export const webTransport: ApiTransport = {
  requestJson: requestJsonWeb,
  requestRaw: requestRawWeb,
};
