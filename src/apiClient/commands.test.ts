import { SkyCmsCommandClient } from './commands';
import * as httpModule from './http';

jest.mock('./http');

const mockRequestJson = httpModule.requestJson as jest.MockedFunction<typeof httpModule.requestJson>;
const mockRequestRaw = httpModule.requestRaw as jest.MockedFunction<typeof httpModule.requestRaw>;

const TOKEN = 'test-bearer-token';
const BASE_URL = 'https://editor.example.com';

const makeClient = (token?: string) =>
  new SkyCmsCommandClient(BASE_URL, async () => token);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SkyCmsCommandClient.completeBrowserAuth', () => {
  test('posts exchange payload and returns token response', async () => {
    mockRequestJson.mockResolvedValue({ token: 'bearer-tok', role: 'Editors', displayName: 'Ed' });
    const client = makeClient();

    const result = await client.completeBrowserAuth({ state: 'st', code: 'ABCD1234' });

    expect(result.token).toBe('bearer-tok');
    expect(mockRequestJson).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/vscode/auth/browser/exchange',
        method: 'POST',
        body: { state: 'st', code: 'ABCD1234' },
      }),
    );
    const call = mockRequestJson.mock.calls[0][0];
    expect(call.token).toBeUndefined();
  });
});

describe('SkyCmsCommandClient.logout', () => {
  test('posts to auth/logout with bearer token', async () => {
    mockRequestJson.mockResolvedValue(undefined);
    const client = makeClient(TOKEN);

    await client.logout();

    expect(mockRequestJson).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/vscode/auth/logout',
        method: 'POST',
        token: TOKEN,
      }),
    );
  });

  test('skips request when no token stored', async () => {
    const client = makeClient(undefined);

    await client.logout();

    expect(mockRequestJson).not.toHaveBeenCalled();
  });
});

describe('SkyCmsCommandClient.setDocumentFieldContent', () => {
  test('sends PUT with content body to correct field path', async () => {
    mockRequestJson.mockResolvedValue(undefined);
    const client = makeClient(TOKEN);

    await client.setDocumentFieldContent('articles', '42', 'content', '<p>Hi</p>');

    expect(mockRequestJson).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/vscode/articles/42/content',
        method: 'PUT',
        token: TOKEN,
        body: { content: '<p>Hi</p>' },
      }),
    );
  });

  test('throws when no token stored', async () => {
    const client = makeClient(undefined);
    await expect(
      client.setDocumentFieldContent('articles', '1', 'content', 'x'),
    ).rejects.toThrow('No authentication token');
  });
});

describe('SkyCmsCommandClient.setInputFieldValue', () => {
  test('sends PUT with value body', async () => {
    mockRequestJson.mockResolvedValue(undefined);
    const client = makeClient(TOKEN);

    await client.setInputFieldValue('layouts', '3', 'layoutname', 'New Name');

    expect(mockRequestJson).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/vscode/layouts/3/layoutname',
        method: 'PUT',
        body: { value: 'New Name' },
      }),
    );
  });

  test('sends null value for cleared fields', async () => {
    mockRequestJson.mockResolvedValue(undefined);
    const client = makeClient(TOKEN);

    await client.setInputFieldValue('articles', '5', 'bannerimage', null);

    expect(mockRequestJson).toHaveBeenCalledWith(
      expect.objectContaining({ body: { value: null } }),
    );
  });
});

describe('SkyCmsCommandClient.publishArticle', () => {
  test('sends POST to articles/{n}/publish', async () => {
    mockRequestJson.mockResolvedValue(undefined);
    const client = makeClient(TOKEN);

    await client.publishArticle(7);

    expect(mockRequestJson).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/vscode/articles/7/publish',
        method: 'POST',
      }),
    );
  });

  test('throws when no token', async () => {
    const client = makeClient(undefined);
    await expect(client.publishArticle(1)).rejects.toThrow();
  });
});

describe('SkyCmsCommandClient.unpublishArticle', () => {
  test('sends POST to articles/{n}/unpublish', async () => {
    mockRequestJson.mockResolvedValue(undefined);
    const client = makeClient(TOKEN);

    await client.unpublishArticle(3);

    expect(mockRequestJson).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/vscode/articles/3/unpublish',
        method: 'POST',
      }),
    );
  });
});

describe('SkyCmsCommandClient.createArticle', () => {
  test('sends POST to /api/vscode/articles with title', async () => {
    mockRequestJson.mockResolvedValue({ articleNumber: 42, title: 'New One' });
    const client = makeClient(TOKEN);

    const result = await client.createArticle('New One');

    expect(mockRequestJson).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/vscode/articles',
        method: 'POST',
        body: { title: 'New One', articleType: undefined },
      }),
    );
    expect(result.articleNumber).toBe(42);
  });

  test('includes articleType when provided', async () => {
    mockRequestJson.mockResolvedValue({ articleNumber: 43, title: 'Typed' });
    const client = makeClient(TOKEN);

    await client.createArticle('Typed', 2);

    expect(mockRequestJson).toHaveBeenCalledWith(
      expect.objectContaining({ body: { title: 'Typed', articleType: 2 } }),
    );
  });
});

describe('SkyCmsCommandClient.publishLayoutVersion', () => {
  test('sends POST to layouts/{n}/{v}/publish', async () => {
    mockRequestJson.mockResolvedValue(undefined);
    const client = makeClient(TOKEN);

    await client.publishLayoutVersion(1, 3);

    expect(mockRequestJson).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/vscode/layouts/1/3/publish',
        method: 'POST',
      }),
    );
  });
});

describe('SkyCmsCommandClient.setDefaultLayoutVersion', () => {
  test('sends POST to layouts/{n}/{v}/set-default', async () => {
    mockRequestJson.mockResolvedValue(undefined);
    const client = makeClient(TOKEN);

    await client.setDefaultLayoutVersion(2, 1);

    expect(mockRequestJson).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/vscode/layouts/2/1/set-default',
        method: 'POST',
      }),
    );
  });
});

describe('SkyCmsCommandClient.duplicateLayoutVersion', () => {
  test('sends POST to layouts/{n}/versions', async () => {
    mockRequestJson.mockResolvedValue({ layoutNumber: 2, version: 3 });
    const client = makeClient(TOKEN);

    const result = await client.duplicateLayoutVersion(2);

    expect(mockRequestJson).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/vscode/layouts/2/versions',
        method: 'POST',
      }),
    );
    expect(result.version).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Phase 5 write methods
// ---------------------------------------------------------------------------

describe('SkyCmsCommandClient.deleteFile', () => {
  test('sends DELETE to files/{pathHash}', async () => {
    mockRequestRaw.mockResolvedValue(undefined);
    const client = makeClient(TOKEN);

    await client.deleteFile('/pub/test.txt');

    expect(mockRequestRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        token: TOKEN,
      }),
    );
    const call = mockRequestRaw.mock.calls[0][0];
    expect(call.path).toContain('/api/vscode/files/');
  });

  test('throws when no token', async () => {
    const client = makeClient(undefined);
    await expect(client.deleteFile('/pub/test.txt')).rejects.toThrow();
  });
});

describe('SkyCmsCommandClient.deleteFolder', () => {
  test('sends DELETE to folders/{pathHash}', async () => {
    mockRequestRaw.mockResolvedValue(undefined);
    const client = makeClient(TOKEN);

    await client.deleteFolder('/pub/images');

    expect(mockRequestRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        token: TOKEN,
      }),
    );
    const call = mockRequestRaw.mock.calls[0][0];
    expect(call.path).toContain('/api/vscode/folders/');
  });
});

describe('SkyCmsCommandClient.createFolder', () => {
  test('sends POST to folders/{pathHash}', async () => {
    mockRequestRaw.mockResolvedValue(undefined);
    const client = makeClient(TOKEN);

    await client.createFolder('/pub/new-folder');

    expect(mockRequestRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        token: TOKEN,
      }),
    );
    const call = mockRequestRaw.mock.calls[0][0];
    expect(call.path).toContain('/api/vscode/folders/');
  });
});

describe('SkyCmsCommandClient.uploadFile', () => {
  test('sends POST to files/{pathHash} with binary body', async () => {
    mockRequestRaw.mockResolvedValue(undefined);
    const client = makeClient(TOKEN);
    const data = new Uint8Array([1, 2, 3]);

    await client.uploadFile('/pub/photo.jpg', data);

    expect(mockRequestRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        token: TOKEN,
        body: expect.any(Buffer),
      }),
    );
    const call = mockRequestRaw.mock.calls[0][0];
    expect(call.path).toContain('/api/vscode/files/');
  });

  test('throws when no token', async () => {
    const client = makeClient(undefined);
    await expect(client.uploadFile('/pub/photo.jpg', new Uint8Array([1]))).rejects.toThrow();
  });
});

describe('SkyCmsCommandClient.moveFile', () => {
  test('sends POST to files/{pathHash}/move with destination body', async () => {
    mockRequestJson.mockResolvedValue(undefined);
    const client = makeClient(TOKEN);

    await client.moveFile('/pub/old.txt', '/pub/new.txt');

    expect(mockRequestJson).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        token: TOKEN,
        body: {destination: '/pub/new.txt'},
      }),
    );
    const call = mockRequestJson.mock.calls[0][0];
    expect(call.path).toContain('/api/vscode/files/');
    expect(call.path).toContain('/move');
  });

  test('throws when no token', async () => {
    const client = makeClient(undefined);
    await expect(client.moveFile('/pub/old.txt', '/pub/new.txt')).rejects.toThrow();
  });
});

describe('SkyCmsCommandClient.moveFolder', () => {
  test('sends POST to folders/{pathHash}/move with destination body', async () => {
    mockRequestJson.mockResolvedValue(undefined);
    const client = makeClient(TOKEN);

    await client.moveFolder('/pub/old-dir', '/pub/new-dir');

    expect(mockRequestJson).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        token: TOKEN,
        body: {destination: '/pub/new-dir'},
      }),
    );
    const call = mockRequestJson.mock.calls[0][0];
    expect(call.path).toContain('/api/vscode/folders/');
    expect(call.path).toContain('/move');
  });
});
