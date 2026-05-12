import { webTransport } from './http.web';
import { JsonRequestOptions, RawRequestOptions } from './transport';
import { HttpError } from './httpError';

export async function requestJson<T>(options: JsonRequestOptions): Promise<T> {
  return webTransport.requestJson<T>(options);
}

export async function requestRaw(options: RawRequestOptions): Promise<void> {
  return webTransport.requestRaw(options);
}

export { JsonRequestOptions, RawRequestOptions, HttpError };