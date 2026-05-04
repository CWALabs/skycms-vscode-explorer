import { SiteManager } from './siteManager';

interface MockState {
  sites: Array<{ id: string; name: string; editorUrl: string; isDefault?: boolean; lastUsedAt?: string }>;
  activeSiteId?: string;
}

function makeContext(initial?: Partial<MockState>) {
  const state: MockState = {
    sites: initial?.sites ?? [],
    activeSiteId: initial?.activeSiteId,
  };

  return {
    globalState: {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'skycms.sites') {
          return state.sites;
        }

        if (key === 'skycms.activeSiteId') {
          return state.activeSiteId;
        }

        return fallback;
      }),
      update: jest.fn(async (key: string, value: unknown) => {
        if (key === 'skycms.sites') {
          state.sites = value as MockState['sites'];
        }

        if (key === 'skycms.activeSiteId') {
          state.activeSiteId = value as string | undefined;
        }
      }),
    },
  } as any;
}

describe('SiteManager', () => {
  test('migrates configured editor URL when no sites exist', async () => {
    const ctx = makeContext();
    const manager = new SiteManager(ctx);

    await manager.ensureInitialized('https://editor.example.com/');
    const active = await manager.getActiveSite();

    expect(active?.editorUrl).toBe('https://editor.example.com');
    expect(active?.isDefault).toBe(true);
  });

  test('adds and selects a site', async () => {
    const ctx = makeContext();
    const manager = new SiteManager(ctx);

    const site = await manager.addSite('https://client-a.example.com', 'Client A');
    const selected = await manager.setActiveSite(site.id);

    expect(selected.editorUrl).toBe('https://client-a.example.com');
    expect((ctx.globalState.update as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });

  test('removes active site and falls back to default', async () => {
    const ctx = makeContext({
      sites: [
        { id: 'one', name: 'One', editorUrl: 'https://one.example.com', isDefault: true },
        { id: 'two', name: 'Two', editorUrl: 'https://two.example.com' },
      ],
      activeSiteId: 'two',
    });

    const manager = new SiteManager(ctx);
    await manager.removeSite('two');

    const active = await manager.getActiveSite();
    expect(active?.id).toBe('one');
  });
});
