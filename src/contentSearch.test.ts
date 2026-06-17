import { findSkyCmsContentSearchResults } from './contentSearch';

jest.mock('vscode', () => ({
  TreeItem: class MockTreeItem {
    constructor(
      public label: string,
      public collapsibleState?: number,
    ) {}
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ThemeIcon: jest.fn((name: string) => ({ id: name })),
}));

const makeQueryClient = (overrides: Record<string, jest.Mock> = {}) => ({
  getLayouts: jest.fn(async () => [
    { layoutNumber: 1, version: 1, name: 'Marketing Layout', isPublished: true, isDefault: true },
    { layoutNumber: 2, version: 1, name: 'Docs Layout', isPublished: false },
  ]),
  getTemplates: jest.fn(async () => [
    { templateId: 'home', name: 'Home Page', layoutNumber: 1 },
    { templateId: 'docs', name: 'Docs Page', layoutNumber: 2 },
  ]),
  getArticles: jest.fn(async () => [
    { articleNumber: 10, title: 'Welcome Home', articleType: null, isPublished: true, urlPath: '/welcome-home' },
    { articleNumber: 11, title: 'Engineering Blog', articleType: '2', blogKey: 'engineering', isPublished: true },
  ]),
  getFilesList: jest.fn(async (path: string) => {
    if (path === '/') {
      return [
        { name: 'logo.png', path: '/pub/logo.png', isDir: false, mimeType: 'image/png', size: 42 },
        { name: 'docs', path: '/pub/docs', isDir: true, mimeType: 'directory', size: 0 },
      ];
    }

    if (path === '/pub/docs') {
      return [
        { name: 'guide.md', path: '/pub/docs/guide.md', isDir: false, mimeType: 'text/markdown', size: 13 },
      ];
    }

    return [];
  }),
  ...overrides,
});

describe('findSkyCmsContentSearchResults', () => {
  test('filters by scope and returns the best matching content first', async () => {
    const queryClient = makeQueryClient();

    const results = await findSkyCmsContentSearchResults(queryClient as any, {
      query: 'home',
      scope: 'all',
      limit: 10,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].label).toContain('Home Page');
    expect(results[0].kind).toBe('template');
    expect(results.some((result) => result.kind === 'file' && result.label === 'logo.png')).toBe(false);
  });

  test('searches only the selected scope', async () => {
    const queryClient = makeQueryClient();

    const articleResults = await findSkyCmsContentSearchResults(queryClient as any, {
      query: 'home',
      scope: 'articles',
      limit: 10,
    });

    expect(articleResults).toHaveLength(1);
    expect(articleResults[0].kind).toBe('article');
    expect(articleResults[0].label).toContain('Welcome Home');

    const templateResults = await findSkyCmsContentSearchResults(queryClient as any, {
      query: 'home',
      scope: 'templates',
      limit: 10,
    });

    expect(templateResults).toHaveLength(1);
    expect(templateResults[0].kind).toBe('template');
  });

  test('includes nested files when searching file content', async () => {
    const queryClient = makeQueryClient();

    const results = await findSkyCmsContentSearchResults(queryClient as any, {
      query: 'guide',
      scope: 'files',
      limit: 10,
    });

    expect(results).toHaveLength(1);
    expect(results[0].kind).toBe('file');
    expect(results[0].label).toBe('guide.md');
    expect(results[0].node.path).toBe('/pub/docs/guide.md');
  });

  test('matches files by friendly displayPath terms', async () => {
    const queryClient = makeQueryClient({
      getFilesList: jest.fn(async (path: string) => {
        if (path === '/') {
          return [
            {
              name: 'My Article Title',
              path: '/pub/articles/42',
              displayPath: '/pub/articles/My Article Title',
              isDir: true,
              mimeType: 'directory',
              size: 0,
            },
          ];
        }

        return [];
      }),
    });

    const results = await findSkyCmsContentSearchResults(queryClient as any, {
      query: 'my article title',
      scope: 'files',
      limit: 10,
    });

    expect(results).toHaveLength(1);
    expect(results[0].kind).toBe('folder');
    expect(results[0].node.path).toBe('/pub/articles/42');
  });

  test('returns no results for blank queries', async () => {
    const queryClient = makeQueryClient();

    const results = await findSkyCmsContentSearchResults(queryClient as any, {
      query: '   ',
      scope: 'all',
      limit: 10,
    });

    expect(results).toEqual([]);
  });
});
