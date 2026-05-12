import { SkyCmsTreeProvider } from './treeProvider';
import { SiteManager } from './siteManager';
import { HttpError } from './apiClient/http';

jest.mock('vscode', () => {
  class MockTreeItem {
    constructor(
      public label: string,
      public collapsibleState?: number,
    ) {}
  }

  class MockEventEmitter<T> {
    private listeners: Array<(e: T) => void> = [];
    
    public get event() {
      return (listener: (e: T) => void) => {
        this.listeners.push(listener);
        return { dispose: () => {} };
      };
    }

    public fire(event: T) {
      this.listeners.forEach((listener) => listener(event));
    }
  }

  return {
    TreeItem: MockTreeItem,
    EventEmitter: MockEventEmitter,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    ThemeIcon: jest.fn((name: string) => ({ id: name })),
  };
});
jest.mock('./siteManager');

const mockSiteManager = {
  getActiveSite: jest.fn(async () => ({ id: 'site-1', name: 'Default Site', editorUrl: 'https://editor.example.com' })),
} as unknown as SiteManager;

describe('SkyCmsTreeProvider', () => {
  test('returns a needsReauth node when a site is configured but the session has expired', async () => {
    const provider = new SkyCmsTreeProvider(
      {} as any,
      async () => undefined,
      mockSiteManager,
    );

    const nodes = await provider.getChildren();

    expect(nodes).toHaveLength(1);
    expect(nodes[0].kind).toBe('needs-reauth');
    expect(nodes[0].label).toBe('Log In to Default Site');
  });

  test('returns root node with site name when authenticated', async () => {
    const provider = new SkyCmsTreeProvider(
      {} as any,
      async () => 'token',
      mockSiteManager,
    );

    const nodes = await provider.getChildren();

    expect(nodes).toHaveLength(1);
    expect(nodes[0].kind).toBe('root');
    expect(nodes[0].label).toBe('Default Site (website)');
  });

  test('root node children are the categories when authenticated', async () => {
    const provider = new SkyCmsTreeProvider(
      {} as any,
      async () => 'token',
      mockSiteManager,
    );

    const rootNodes = await provider.getChildren();
    const categoryNodes = await provider.getChildren(rootNodes[0]);

    expect(categoryNodes.map((node) => node.label)).toEqual(['Layouts', 'Page Templates', 'Articles', 'Files']);
  });

  test('layout/template/article nodes expose expected field counts', async () => {
    const queryClient = {
      getLayouts: async () => [{ layoutNumber: 1, name: 'Default Site Layout' }],
      getLayoutVersions: async () => [{ layoutNumber: 1, version: 1, name: 'Default Site Layout', isPublished: true }],
      getTemplates: async () => [{ templateId: 'abc-123', name: 'Home Page' }],
      getArticles: async () => [
        { articleNumber: 100, title: 'Welcome', articleType: '0', isPublished: false },
      ],
      getBlogPosts: async () => [],
    };

    const provider = new SkyCmsTreeProvider(queryClient as any, async () => 'token', mockSiteManager);

    const rootNodes = await provider.getChildren();
    const roots = await provider.getChildren(rootNodes[0]);
    const layoutNode = (await provider.getChildren(roots[0]))[0];
    const templateNode = (await provider.getChildren(roots[1]))[0];
    const articleNode = (await provider.getChildren(roots[2]))[0];

    const layoutFields = await provider.getChildren(layoutNode);
    const templateFields = await provider.getChildren(templateNode);
    const articleFields = await provider.getChildren(articleNode);

    expect(layoutFields).toHaveLength(6);
    expect(layoutFields[5].label).toBe('Versions');
    expect(templateFields).toHaveLength(3);
    expect(articleFields).toHaveLength(9);
    expect(articleFields[8].label).toBe('Versions');
    expect(articleNode.label).toBe('Welcome (Draft)');
    expect(articleNode.description).toBeUndefined();
  });

  test('published article nodes include status and last published date', async () => {
    const queryClient = {
      getLayouts: async () => [],
      getTemplates: async () => [],
      getArticles: async () => [
        {
          articleNumber: 200,
          title: 'Release Notes',
          articleType: '0',
          isPublished: true,
          lastPublished: '2026-05-06T13:00:00Z',
        },
      ],
      getBlogPosts: async () => [],
    };

    const provider = new SkyCmsTreeProvider(queryClient as any, async () => 'token', mockSiteManager);

    const rootNodes = await provider.getChildren();
    const roots = await provider.getChildren(rootNodes[0]);
    const articleNode = (await provider.getChildren(roots[2]))[0];

    expect(articleNode.label).toBe('Release Notes (Published)');
    expect(articleNode.description).toBe('2026-05-06');
  });

  test('layout versions node shows history entries as published/read-only', async () => {
    const queryClient = {
      getLayouts: async () => [{ layoutNumber: 9, version: 3, name: 'Marketing Layout' }],
      getLayoutVersions: async () => [
        { layoutNumber: 9, version: 3, name: 'Marketing Layout', isPublished: false },
        { layoutNumber: 9, version: 2, name: 'Marketing Layout', isPublished: true, isDefault: true },
        { layoutNumber: 9, version: 1, name: 'Marketing Layout', isPublished: false },
      ],
      getTemplates: async () => [],
      getArticles: async () => [],
      getBlogPosts: async () => [],
    };

    const provider = new SkyCmsTreeProvider(queryClient as any, async () => 'token', mockSiteManager);
    const rootNodes = await provider.getChildren();
    const roots = await provider.getChildren(rootNodes[0]);
    const layoutNode = (await provider.getChildren(roots[0]))[0];
    const layoutChildren = await provider.getChildren(layoutNode);
    const versionsNode = layoutChildren.find((node) => node.kind === 'layout-versions-group');

    expect(versionsNode).toBeDefined();

    const versionNodes = await provider.getChildren(versionsNode);
    expect(versionNodes).toHaveLength(2);
    expect(versionNodes[0].label).toBe('Version 2');
    expect(versionNodes[0].description).toContain('Published');
    expect(versionNodes[0].description).toContain('Read-only');
    expect(versionNodes[1].label).toBe('Version 1');

    const versionFields = await provider.getChildren(versionNodes[0]);
    expect(versionFields.map((node) => node.label)).toEqual(['Notes', 'Head', 'Header', 'Footer']);
    expect(versionFields.every((node) => node.isReadOnly)).toBe(true);
    expect(versionFields.every((node) => node.layoutVersionNumber === 2)).toBe(true);
  });
});

describe('SkyCmsTreeProvider additional branches', () => {
  test('refresh fires the onDidChangeTreeData event', () => {
    const provider = new SkyCmsTreeProvider({} as any, async () => undefined, mockSiteManager);
    let fired = false;
    provider.onDidChangeTreeData(() => { fired = true; });
    provider.refresh();
    expect(fired).toBe(true);
  });

  test('getTreeItem returns the element itself', () => {
    const provider = new SkyCmsTreeProvider({} as any, async () => undefined, mockSiteManager);
    const fakeNode = { label: 'test' } as any;
    expect(provider.getTreeItem(fakeNode)).toBe(fakeNode);
  });

  test('getChildren returns empty array when unauthenticated and a child element is provided', async () => {
    const provider = new SkyCmsTreeProvider({} as any, async () => undefined, mockSiteManager);
    const result = await provider.getChildren({ kind: 'layout' } as any);
    expect(result).toEqual([]);
  });

  test('getChildren returns empty array for article-group node with missing data', async () => {
    const provider = new SkyCmsTreeProvider({} as any, async () => 'token', mockSiteManager);
    const result = await provider.getChildren({ kind: 'article-group' } as any);
    expect(result).toEqual([]);
  });

  test('getChildren returns empty array for unknown node kind', async () => {
    const provider = new SkyCmsTreeProvider({} as any, async () => 'token', mockSiteManager);
    const result = await provider.getChildren({ kind: 'exotic-type' } as any);
    expect(result).toEqual([]);
  });

  test('article node shows Draft in label when articleType is null', async () => {
    const queryClient = {
      getLayouts: async () => [],
      getTemplates: async () => [],
      getArticles: async () => [
        { articleNumber: 1, title: 'Test', articleType: null, isPublished: false },
      ],
      getBlogPosts: async () => [],
    };
    const provider = new SkyCmsTreeProvider(queryClient as any, async () => 'token', mockSiteManager);
    const rootNodes = await provider.getChildren();
    const roots = await provider.getChildren(rootNodes[0]);
    const articleNode = (await provider.getChildren(roots[2]))[0];
    expect(articleNode.label).toBe('Test (Draft)');
    expect(articleNode.description).toBeUndefined();
  });

  test('blog stream articles appear as blog-stream nodes under Articles', async () => {
    const queryClient = {
      getLayouts: async () => [],
      getTemplates: async () => [],
      getArticles: async () => [
        { articleNumber: 10, title: 'Standalone Article', articleType: null, isPublished: true },
        { articleNumber: 20, title: 'Engineering Blog', articleType: '2', blogKey: 'engineering', isPublished: true },
      ],
      getBlogPosts: async () => [],
    };

    const provider = new SkyCmsTreeProvider(queryClient as any, async () => 'token', mockSiteManager);
    const rootNodes = await provider.getChildren();
    const roots = await provider.getChildren(rootNodes[0]);
    const articleNodes = await provider.getChildren(roots[2]);

    expect(articleNodes.map((n) => n.label)).toEqual([
      'Engineering Blog (Published)',
      'Standalone Article (Published)',
    ]);
    expect(articleNodes[0].kind).toBe('blog-stream');
    expect(articleNodes[1].kind).toBe('article');
  });

  test('blog stream node children include fields, Versions, and Posts group', async () => {
    const queryClient = {
      getLayouts: async () => [],
      getTemplates: async () => [],
      getArticles: async () => [
        { articleNumber: 20, title: 'Engineering Blog', articleType: '2', blogKey: 'engineering', isPublished: true },
      ],
      getBlogPosts: async () => [],
    };

    const provider = new SkyCmsTreeProvider(queryClient as any, async () => 'token', mockSiteManager);
    const rootNodes = await provider.getChildren();
    const roots = await provider.getChildren(rootNodes[0]);
    const blogNode = (await provider.getChildren(roots[2]))[0];
    const blogChildren = await provider.getChildren(blogNode);

    expect(blogChildren).toHaveLength(10);
    expect(blogChildren[8].label).toBe('Versions');
    expect(blogChildren[8].kind).toBe('article-versions-group');
    expect(blogChildren[9].label).toBe('Posts');
    expect(blogChildren[9].kind).toBe('blog-stream-posts');
  });

  test('category load failure shows informative HTTP error node', async () => {
    const queryClient = {
      getLayouts: async () => {
        throw new HttpError(403, 'Forbidden', undefined, 'GET', '/api/vscode/layouts');
      },
      getTemplates: async () => [],
      getArticles: async () => [],
      getBlogPosts: async () => [],
    };

    const provider = new SkyCmsTreeProvider(queryClient as any, async () => 'token', mockSiteManager);
    const rootNodes = await provider.getChildren();
    const categoryNodes = await provider.getChildren(rootNodes[0]);
    const layoutChildren = await provider.getChildren(categoryNodes[0]);

    expect(layoutChildren).toHaveLength(1);
    expect(layoutChildren[0].kind).toBe('error');
    expect(layoutChildren[0].label).toBe('Failed to load layouts');
    expect(layoutChildren[0].description).toBe('HTTP 403');
    expect(String(layoutChildren[0].tooltip)).toContain('Suggestion:');
  });

  test('files load failure shows network guidance in tooltip', async () => {
    const queryClient = {
      getLayouts: async () => [],
      getTemplates: async () => [],
      getArticles: async () => [],
      getFilesList: async () => {
        throw new Error('ECONNREFUSED: Connection refused');
      },
      getBlogPosts: async () => [],
    };

    const provider = new SkyCmsTreeProvider(queryClient as any, async () => 'token', mockSiteManager);
    const rootNodes = await provider.getChildren();
    const categoryNodes = await provider.getChildren(rootNodes[0]);
    const filesChildren = await provider.getChildren(categoryNodes[3]);

    expect(filesChildren).toHaveLength(1);
    expect(filesChildren[0].kind).toBe('error');
    expect(filesChildren[0].label).toBe('Failed to load files');
    expect(filesChildren[0].description).toBe('Connection Failed');
    expect(String(filesChildren[0].tooltip)).toContain('Verify that the editor URL is correct');
  });

  test('blog stream Posts group lazy-loads blog posts as article nodes', async () => {
    const queryClient = {
      getLayouts: async () => [],
      getTemplates: async () => [],
      getArticles: async () => [
        { articleNumber: 20, title: 'Engineering Blog', articleType: '2', blogKey: 'engineering', isPublished: true },
      ],
      getBlogPosts: async (blogKey: string) =>
        blogKey === 'engineering'
          ? [
              { articleNumber: 11, title: 'Release Journal', isPublished: false },
              { articleNumber: 12, title: 'Alpha Launch', isPublished: true },
            ]
          : [],
    };

    const provider = new SkyCmsTreeProvider(queryClient as any, async () => 'token', mockSiteManager);
    const rootNodes = await provider.getChildren();
    const roots = await provider.getChildren(rootNodes[0]);
    const blogNode = (await provider.getChildren(roots[2]))[0];
    const blogChildren = await provider.getChildren(blogNode);
    const postsGroup = blogChildren.find((n) => n.kind === 'blog-stream-posts')!;
    const posts = await provider.getChildren(postsGroup);

    expect(posts.map((n) => n.label)).toEqual([
      'Alpha Launch (Published)',
      'Release Journal (Draft)',
    ]);
    expect(posts.every((n) => n.kind === 'article')).toBe(true);
  });

  test('files category uses API path and explicit folder/file icons', async () => {
    const queryClient = {
      getLayouts: async () => [],
      getTemplates: async () => [],
      getArticles: async () => [],
      getBlogPosts: async () => [],
      getFilesList: async () => [
        { name: 'My Article Title', path: '/pub/articles/42', isDir: true, mimeType: 'directory', size: 0 },
        { name: 'logo.png', path: '/pub/assets/logo.png', isDir: false, mimeType: 'image/png', size: 1234 },
      ],
    };

    const provider = new SkyCmsTreeProvider(queryClient as any, async () => 'token', mockSiteManager);
    const rootNodes = await provider.getChildren();
    const categories = await provider.getChildren(rootNodes[0]);
    const filesCategory = categories.find((node) => node.kind === 'files-category');

    expect(filesCategory).toBeDefined();

    const fileNodes = await provider.getChildren(filesCategory);
    expect(fileNodes).toHaveLength(2);

    expect(fileNodes[0].kind).toBe('folder');
    expect(fileNodes[0].label).toBe('My Article Title');
    expect(fileNodes[0].path).toBe('/pub/articles/42');
    expect((fileNodes[0] as any).iconPath).toEqual({ id: 'folder' });

    expect(fileNodes[1].kind).toBe('file');
    expect(fileNodes[1].label).toBe('logo.png');
    expect(fileNodes[1].path).toBe('/pub/assets/logo.png');
    expect((fileNodes[1] as any).iconPath).toEqual({ id: 'file' });
  });
});
