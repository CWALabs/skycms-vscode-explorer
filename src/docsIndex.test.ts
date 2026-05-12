import {
  findRelevantSkyCmsDocs,
  findRelevantSkyCmsDocsWithLiveLookup,
  resetSkyCmsDocsIndexCacheForTests,
} from './docsIndex';

const originalFetch = globalThis.fetch;

describe('findRelevantSkyCmsDocs', () => {
  beforeEach(() => {
    resetSkyCmsDocsIndexCacheForTests();
  });

  afterEach(() => {
    resetSkyCmsDocsIndexCacheForTests();
    if (originalFetch) {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        writable: true,
        value: originalFetch,
      });
    } else {
      Reflect.deleteProperty(globalThis, 'fetch');
    }
  });

  test('returns layout-focused docs for layout queries', () => {
    const results = findRelevantSkyCmsDocs('How do layouts work in SkyCMS?');
    const ids = results.map((entry) => entry.id);

    expect(ids).toContain('site-builder-layouts');
    expect(ids).toContain('developer-layouts');
  });

  test('returns template-focused docs for template queries', () => {
    const results = findRelevantSkyCmsDocs('template examples and reusable page patterns');
    const ids = results.map((entry) => entry.id);

    expect(ids).toContain('site-builder-templates');
    expect(ids).toContain('developer-templates');
  });

  test('returns default starting docs when query is empty', () => {
    const results = findRelevantSkyCmsDocs('');
    const ids = results.map((entry) => entry.id);

    expect(ids).toContain('docs-map');
    expect(ids).toContain('ai-context-pack');
  });

  test('prefers live docs matches when the remote index has a stronger result', async () => {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          docs: [
            {
              location: 'for-developers/multi-tenancy-deep-dive/',
              title: 'Multi-Tenancy Deep Dive',
              text: 'Tenant isolation, domain middleware, and request-scoped configuration in SkyCMS.',
            },
          ],
        }),
      }),
    });

    const results = await findRelevantSkyCmsDocsWithLiveLookup('tenant isolation domain middleware');

    expect(results[0]?.title).toBe('Multi-Tenancy Deep Dive');
    expect(results.some((entry) => entry.url === 'https://docs.sky-cms.com/for-developers/multi-tenancy-deep-dive/')).toBe(true);
  });

  test('falls back to curated docs when live lookup fails', async () => {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: jest.fn().mockRejectedValue(new Error('network unavailable')),
    });

    const results = await findRelevantSkyCmsDocsWithLiveLookup('layouts and templates');
    const ids = results.map((entry) => entry.id);

    expect(ids).toContain('site-builder-layouts');
    expect(ids).toContain('site-builder-templates');
  });
});
