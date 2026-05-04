import { SkyCmsTreeProvider } from './treeProvider';
import { SiteManager } from './siteManager';

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
  test('returns empty array when unauthenticated (welcome view handles messaging)', async () => {
    const provider = new SkyCmsTreeProvider(
      {} as any,
      async () => undefined,
      mockSiteManager,
    );

    const nodes = await provider.getChildren();

    expect(nodes).toHaveLength(0);
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
    expect(nodes[0].label).toBe('SkyCMS (Default Site)');
  });

  test('root node children are the categories when authenticated', async () => {
    const provider = new SkyCmsTreeProvider(
      {} as any,
      async () => 'token',
      mockSiteManager,
    );

    const rootNodes = await provider.getChildren();
    const categoryNodes = await provider.getChildren(rootNodes[0]);

    expect(categoryNodes.map((node) => node.label)).toEqual(['Layouts', 'Page Templates', 'Articles', 'Blogs', 'Files']);
  });

  test('layout/template/article nodes expose expected field counts', async () => {
    const queryClient = {
      getLayouts: async () => [{ layoutNumber: 1, name: 'Default Site Layout' }],
      getTemplates: async () => [{ templateId: 'abc-123', name: 'Home Page' }],
      getArticles: async () => ({
        drafts: [{ articleNumber: 100, title: 'Welcome', articleType: 'Blog' }],
        published: [],
      }),
    };

    const provider = new SkyCmsTreeProvider(queryClient as any, async () => 'token', mockSiteManager);

    const rootNodes = await provider.getChildren();
    const roots = await provider.getChildren(rootNodes[0]);
    const layoutNode = (await provider.getChildren(roots[0]))[0];
    const templateNode = (await provider.getChildren(roots[1]))[0];
    const articleGroup = (await provider.getChildren(roots[2]))[0];
    const articleNode = (await provider.getChildren(articleGroup))[0];

    const layoutFields = await provider.getChildren(layoutNode);
    const templateFields = await provider.getChildren(templateNode);
    const articleFields = await provider.getChildren(articleNode);

    expect(layoutFields).toHaveLength(5);
    expect(templateFields).toHaveLength(3);
    expect(articleFields).toHaveLength(8);
    expect(articleNode.description).toBe('Blog');
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

  test('article node has undefined description when articleType is null', async () => {
    const queryClient = {
      getLayouts: async () => [],
      getTemplates: async () => [],
      getArticles: async () => ({
        drafts: [{ articleNumber: 1, title: 'Test', articleType: null }],
        published: [],
      }),
    };
    const provider = new SkyCmsTreeProvider(queryClient as any, async () => 'token', mockSiteManager);
    const rootNodes = await provider.getChildren();
    const roots = await provider.getChildren(rootNodes[0]);
    const articleGroup = (await provider.getChildren(roots[2]))[0];
    const articleNode = (await provider.getChildren(articleGroup))[0];
    expect(articleNode.description).toBeUndefined();
  });
});
