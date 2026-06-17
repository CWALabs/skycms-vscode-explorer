import {
  addRecentContentShortcut,
  getContentShortcutPicks,
  getPinnedContentShortcuts,
  getRecentContentShortcuts,
  isShortcutEligibleNode,
  togglePinnedContentShortcut,
} from './contentShortcuts';

function makeContext(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial));

  return {
    globalState: {
      get: jest.fn((key: string, defaultValue?: unknown) => (store.has(key) ? store.get(key) : defaultValue)),
      update: jest.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
    },
    _store: store,
  } as any;
}

function makeFileNode(path = '/pub/readme.md') {
  return {
    kind: 'file',
    label: 'readme.md',
    path,
    isDir: false,
  };
}

function makeArticleNode(articleNumber = 10) {
  return {
    kind: 'article',
    label: 'Welcome',
    article: {
      articleNumber,
      title: 'Welcome',
      isPublished: true,
    },
  };
}

describe('contentShortcuts', () => {
  test('accepts eligible node kinds only', () => {
    expect(isShortcutEligibleNode(makeFileNode())).toBe(true);
    expect(isShortcutEligibleNode(makeArticleNode())).toBe(true);
    expect(isShortcutEligibleNode({ kind: 'category', label: 'Layouts' })).toBe(false);
  });

  test('stores recent items newest-first without duplicates', async () => {
    const context = makeContext();

    await addRecentContentShortcut(context, makeFileNode('/pub/a.txt') as any);
    await addRecentContentShortcut(context, makeFileNode('/pub/b.txt') as any);
    await addRecentContentShortcut(context, makeFileNode('/pub/a.txt') as any);

    const recent = getRecentContentShortcuts(context);
    expect(recent).toHaveLength(2);
    expect(recent[0].id).toBe('file:/pub/a.txt');
    expect(recent[1].id).toBe('file:/pub/b.txt');
  });

  test('toggles pinned state on and off', async () => {
    const context = makeContext();
    const node = makeArticleNode(42);

    const pinned = await togglePinnedContentShortcut(context, node as any);
    expect(pinned).toBe(true);
    expect(getPinnedContentShortcuts(context)).toHaveLength(1);

    const unpinned = await togglePinnedContentShortcut(context, node as any);
    expect(unpinned).toBe(false);
    expect(getPinnedContentShortcuts(context)).toHaveLength(0);
  });

  test('returns picks with pinned items first and removes duplicates from recent', async () => {
    const context = makeContext();
    const fileNode = makeFileNode('/pub/doc.txt');

    await addRecentContentShortcut(context, fileNode as any);
    await togglePinnedContentShortcut(context, fileNode as any);
    await addRecentContentShortcut(context, makeArticleNode(7) as any);

    const picks = getContentShortcutPicks(context);
    expect(picks).toHaveLength(2);
    expect(picks[0].source).toBe('pinned');
    expect(picks[0].id).toBe('file:/pub/doc.txt');
    expect(picks[1].source).toBe('recent');
    expect(picks[1].id).toBe('article:7');
  });
});
