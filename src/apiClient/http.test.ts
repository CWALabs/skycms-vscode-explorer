import { EventEmitter } from 'events';

jest.mock('http', () => ({ request: jest.fn() }));
jest.mock('https', () => ({ request: jest.fn() }));

import { HttpError, requestJson, requestRaw } from './http';

const httpMock = jest.requireMock('http') as { request: jest.Mock };
const httpsMock = jest.requireMock('https') as { request: jest.Mock };

function setupTransport(
  mock: { request: jest.Mock },
  statusCode: number,
  body: string,
): { req: EventEmitter & { write: jest.Mock; end: jest.Mock } } {
  const res = new EventEmitter() as EventEmitter & { statusCode: number };
  res.statusCode = statusCode;

  const req = new EventEmitter() as EventEmitter & { write: jest.Mock; end: jest.Mock };
  req.write = jest.fn();
  req.end = jest.fn(() => {
    process.nextTick(() => {
      if (body.length > 0) {
        res.emit('data', Buffer.from(body));
      }
      res.emit('end');
    });
  });

  mock.request.mockImplementation((_opts: unknown, cb: (r: typeof res) => void) => {
    cb(res);
    return req;
  });

  return { req };
}

describe('requestJson', () => {
  beforeEach(() => jest.resetAllMocks());

  test('resolves with parsed JSON body on 200 response', async () => {
    setupTransport(httpsMock, 200, '{"value":42}');

    const result = await requestJson<{ value: number }>({
      baseUrl: 'https://example.com',
      path: '/api/test',
      method: 'GET',
    });

    expect(result).toEqual({ value: 42 });
  });

  test('uses http transport for http:// URLs', async () => {
    setupTransport(httpMock, 200, '{"ok":true}');

    const result = await requestJson<{ ok: boolean }>({
      baseUrl: 'http://localhost',
      path: '/api/test',
      method: 'GET',
    });

    expect(result).toEqual({ ok: true });
    expect(httpsMock.request).not.toHaveBeenCalled();
  });

  test('includes Authorization header when token is provided', async () => {
    setupTransport(httpsMock, 200, '{}');

    await requestJson({
      baseUrl: 'https://example.com',
      path: '/api/me',
      method: 'GET',
      token: 'my-bearer-token',
    });

    const callArgs = httpsMock.request.mock.calls[0][0] as Record<string, any>;
    expect(callArgs.headers['Authorization']).toBe('Bearer my-bearer-token');
  });

  test('omits Authorization header when no token is provided', async () => {
    setupTransport(httpsMock, 200, '{}');

    await requestJson({
      baseUrl: 'https://example.com',
      path: '/api/test',
      method: 'GET',
    });

    const callArgs = httpsMock.request.mock.calls[0][0] as Record<string, any>;
    expect(callArgs.headers['Authorization']).toBeUndefined();
  });

  test('sends JSON body and sets Content-Type header for POST', async () => {
    const { req } = setupTransport(httpsMock, 201, '{"id":1}');

    await requestJson({
      baseUrl: 'https://example.com',
      path: '/api/items',
      method: 'POST',
      body: { name: 'test' },
    });

    expect(req.write).toHaveBeenCalledWith(JSON.stringify({ name: 'test' }));
    const callArgs = httpsMock.request.mock.calls[0][0] as Record<string, any>;
    expect(callArgs.headers['Content-Type']).toBe('application/json');
    expect(callArgs.headers['Content-Length']).toBeDefined();
  });

  test('does not call write when no body is provided', async () => {
    const { req } = setupTransport(httpsMock, 200, '{}');

    await requestJson({
      baseUrl: 'https://example.com',
      path: '/api/test',
      method: 'GET',
    });

    expect(req.write).not.toHaveBeenCalled();
  });

  test('resolves with undefined for empty response body', async () => {
    setupTransport(httpsMock, 204, '');

    const result = await requestJson({
      baseUrl: 'https://example.com',
      path: '/api/items/1',
      method: 'DELETE',
    });

    expect(result).toBeUndefined();
  });

  test('resolves with raw string when response body is not valid JSON', async () => {
    setupTransport(httpsMock, 200, 'plain text response');

    const result = await requestJson<string>({
      baseUrl: 'https://example.com',
      path: '/api/text',
      method: 'GET',
    });

    expect(result).toBe('plain text response');
  });

  test('rejects with HttpError on 404', async () => {
    setupTransport(httpsMock, 404, '{"message":"Not Found"}');

    await expect(
      requestJson({
        baseUrl: 'https://example.com',
        path: '/api/missing',
        method: 'GET',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  test('rejects with HttpError on 500', async () => {
    setupTransport(httpsMock, 500, '"Internal Server Error"');

    await expect(
      requestJson({
        baseUrl: 'https://example.com',
        path: '/api/broken',
        method: 'GET',
      }),
    ).rejects.toBeInstanceOf(HttpError);
  });

  test('rejects when the request emits an error event', async () => {
    const res = new EventEmitter() as EventEmitter & { statusCode: number };
    res.statusCode = 200;

    const req = new EventEmitter() as EventEmitter & { write: jest.Mock; end: jest.Mock };
    req.write = jest.fn();
    req.end = jest.fn(() => {
      process.nextTick(() => {
        req.emit('error', new Error('connection refused'));
      });
    });

    httpsMock.request.mockImplementation((_opts: unknown, cb: (r: typeof res) => void) => {
      cb(res);
      return req;
    });

    await expect(
      requestJson({
        baseUrl: 'https://example.com',
        path: '/api/test',
        method: 'GET',
      }),
    ).rejects.toThrow('connection refused');
  });
});

describe('requestRaw', () => {
  beforeEach(() => jest.resetAllMocks());

  test('resolves on 2xx response', async () => {
    setupTransport(httpsMock, 204, '');

    await expect(
      requestRaw({
        baseUrl: 'https://example.com',
        path: '/api/vscode/files/abc',
        method: 'DELETE',
      }),
    ).resolves.toBeUndefined();
  });

  test('sends binary body with correct content-type', async () => {
    const { req } = setupTransport(httpsMock, 204, '');
    const body = Buffer.from([1, 2, 3]);

    await requestRaw({
      baseUrl: 'https://example.com',
      path: '/api/vscode/files/abc',
      method: 'POST',
      body,
      contentType: 'application/octet-stream',
    });

    expect(req.write).toHaveBeenCalledWith(body);
    const callArgs = httpsMock.request.mock.calls[0][0] as Record<string, any>;
    expect(callArgs.headers['Content-Type']).toBe('application/octet-stream');
    expect(Number(callArgs.headers['Content-Length'])).toBe(3);
  });

  test('rejects with HttpError on 4xx', async () => {
    setupTransport(httpsMock, 403, 'Forbidden');

    await expect(
      requestRaw({
        baseUrl: 'https://example.com',
        path: '/api/vscode/files/abc',
        method: 'DELETE',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
