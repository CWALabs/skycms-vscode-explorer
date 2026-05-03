import { SkyCmsQueryClient } from './queries';
import { HttpError } from './http';
import * as httpModule from './http';

jest.mock('./http');

const mockRequestJson = httpModule.requestJson as jest.MockedFunction<typeof httpModule.requestJson>;

const TOKEN = 'test-bearer-token';
const BASE_URL = 'https://editor.example.com';

const makeClient = (token?: string) =>
  new SkyCmsQueryClient(BASE_URL, async () => token);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SkyCmsQueryClient.startBrowserAuth', () => {
  test('calls auth/browser/start without a token', async () => {
    mockRequestJson.mockResolvedValue({ loginUrl: 'https://editor.example.com/login', state: 'abc' });
    const client = makeClient();

    const result = await client.startBrowserAuth();

    expect(result.loginUrl).toBe('https://editor.example.com/login');
    expect(result.state).toBe('abc');
    expect(mockRequestJson).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/vscode/auth/browser/start', method: 'GET' }),
    );
    const call = mockRequestJson.mock.calls[0][0];
    expect(call.token).toBeUndefined();
  });
});

describe('SkyCmsQueryClient.getMe', () => {
  test('calls auth/me with bearer token', async () => {
    mockRequestJson.mockResolvedValue({ username: 'ed', displayName: 'Ed', role: 'Editors' });
    const client = makeClient(TOKEN);

    const me = await client.getMe();

    expect(me.username).toBe('ed');
    expect(mockRequestJson).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/vscode/auth/me', method: 'GET', token: TOKEN }),
    );
  });

  test('throws when no token', async () => {
    const client = makeClient(undefined);
    await expect(client.getMe()).rejects.toThrow('No authentication token');
  });

  test('propagates HttpError from server', async () => {
    mockRequestJson.mockRejectedValue(new HttpError(401, 'Unauthorized'));
    const client = makeClient(TOKEN);
    await expect(client.getMe()).rejects.toBeInstanceOf(HttpError);
  });
});

describe('SkyCmsQueryClient.getLayouts', () => {
  test('returns layout list from server', async () => {
    const layouts = [{ layoutNumber: 1, name: 'Default', isDefault: true }];
    mockRequestJson.mockResolvedValue(layouts);
    const client = makeClient(TOKEN);

    const result = await client.getLayouts();
    expect(result).toEqual(layouts);
    expect(mockRequestJson).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/vscode/layouts', method: 'GET', token: TOKEN }),
    );
  });
});

describe('SkyCmsQueryClient.getTemplates', () => {
  test('returns template list from server', async () => {
    const templates = [{ templateId: 'g1', name: 'Home', layoutNumber: 1 }];
    mockRequestJson.mockResolvedValue(templates);
    const client = makeClient(TOKEN);

    const result = await client.getTemplates();
    expect(result).toEqual(templates);
  });
});

describe('SkyCmsQueryClient.getArticles', () => {
  test('returns article groups from server', async () => {
    const groups = {
      drafts: [{ articleNumber: 1, title: 'Draft', articleType: 'General' }],
      published: [],
    };
    mockRequestJson.mockResolvedValue(groups);
    const client = makeClient(TOKEN);

    const result = await client.getArticles();
    expect(result.drafts).toHaveLength(1);
    expect(result.published).toHaveLength(0);
  });
});

describe('SkyCmsQueryClient.getDocumentFieldContent', () => {
  test('returns content string', async () => {
    mockRequestJson.mockResolvedValue({ content: '<p>Hello</p>' });
    const client = makeClient(TOKEN);

    const result = await client.getDocumentFieldContent('articles', '42', 'content');
    expect(result).toBe('<p>Hello</p>');
    expect(mockRequestJson).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/vscode/articles/42/content' }),
    );
  });

  test('returns empty string when server omits content property', async () => {
    mockRequestJson.mockResolvedValue({});
    const client = makeClient(TOKEN);

    const result = await client.getDocumentFieldContent('layouts', '1', 'head');
    expect(result).toBe('');
  });
});

describe('SkyCmsQueryClient.getInputFieldValue', () => {
  test('returns value string', async () => {
    mockRequestJson.mockResolvedValue({ value: 'My Title' });
    const client = makeClient(TOKEN);

    const result = await client.getInputFieldValue('articles', '7', 'title');
    expect(result).toBe('My Title');
  });

  test('returns empty string when value is null', async () => {
    mockRequestJson.mockResolvedValue({ value: null });
    const client = makeClient(TOKEN);

    const result = await client.getInputFieldValue('articles', '7', 'title');
    expect(result).toBe('');
  });
});
