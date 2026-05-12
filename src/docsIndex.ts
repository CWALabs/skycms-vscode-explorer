export interface SkyCmsDocEntry {
  id: string;
  title: string;
  url: string;
  summary: string;
  keywords: string[];
}

interface SkyCmsDocsSearchPayload {
  docs?: SkyCmsDocsSearchDocument[];
}

interface SkyCmsDocsSearchDocument {
  location?: string;
  title?: string;
  text?: string;
}

type FetchJsonResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

const SKYCMS_DOCS_URL = 'https://docs.sky-cms.com/';
const SKYCMS_DOCS_SEARCH_INDEX_URL = `${SKYCMS_DOCS_URL}search/search_index.json`;
const LIVE_DOCS_CACHE_TTL_MS = 15 * 60 * 1000;

let cachedLiveDocsIndex: { expiresAt: number; docs: SkyCmsDocEntry[] } | undefined;
let liveDocsIndexPromise: Promise<SkyCmsDocEntry[]> | undefined;

export const skyCmsDocsIndex: readonly SkyCmsDocEntry[] = [
  {
    id: 'docs-map',
    title: 'Documentation Map',
    url: 'https://docs.sky-cms.com/reference/documentation-map/',
    summary: 'Best starting point when you need the reading path for a SkyCMS topic.',
    keywords: ['map', 'documentation', 'docs map', 'start', 'overview', 'where to begin'],
  },
  {
    id: 'ai-context-pack',
    title: 'AI Context Pack',
    url: 'https://docs.sky-cms.com/reference/ai-context-pack/',
    summary: 'Canonical terms and retrieval shortcuts for AI-assisted SkyCMS help.',
    keywords: ['ai', 'assistant', 'context', 'copilot', 'chat'],
  },
  {
    id: 'site-builder-layouts',
    title: 'Layouts',
    url: 'https://docs.sky-cms.com/for-site-builders/layouts/',
    summary: 'Builder-focused guide to creating the visual structure and reusable shells for a site.',
    keywords: ['layout', 'layouts', 'builder', 'page structure', 'shell'],
  },
  {
    id: 'developer-layouts',
    title: 'Developer Layouts',
    url: 'https://docs.sky-cms.com/for-developers/layouts/',
    summary: 'Developer-oriented explanation of how layouts behave in the platform.',
    keywords: ['layout', 'layouts', 'developer', 'rendering', 'architecture'],
  },
  {
    id: 'site-builder-templates',
    title: 'Templates',
    url: 'https://docs.sky-cms.com/for-site-builders/templates/',
    summary: 'Builder-focused guide to templates and reusable page/content patterns.',
    keywords: ['template', 'templates', 'builder', 'page pattern'],
  },
  {
    id: 'developer-templates',
    title: 'Developer Templates',
    url: 'https://docs.sky-cms.com/for-developers/templates/',
    summary: 'Developer-oriented explanation of template behavior and relationships.',
    keywords: ['template', 'templates', 'developer', 'rendering'],
  },
  {
    id: 'layouts-templates-articles',
    title: 'Layouts, Templates & Articles',
    url: 'https://docs.sky-cms.com/for-developers/layouts-templates-articles/',
    summary: 'The clearest single page for understanding how layouts, templates, and articles fit together.',
    keywords: ['layout', 'template', 'article', 'articles', 'relationship', 'difference'],
  },
  {
    id: 'creating-articles',
    title: 'Creating Articles',
    url: 'https://docs.sky-cms.com/for-editors/creating-articles/',
    summary: 'Editor workflow for creating new articles in SkyCMS.',
    keywords: ['article', 'articles', 'create article', 'editor', 'content'],
  },
  {
    id: 'article-lifecycle-editor',
    title: 'Article Lifecycle Reference',
    url: 'https://docs.sky-cms.com/for-editors/article-lifecycle-reference/',
    summary: 'Editorial lifecycle of content from draft through publication.',
    keywords: ['article', 'lifecycle', 'publish', 'publishing', 'draft'],
  },
  {
    id: 'blogging',
    title: 'Blogging',
    url: 'https://docs.sky-cms.com/for-editors/blogging/',
    summary: 'Editorial guidance for blog posts and blogging workflows.',
    keywords: ['blog', 'blogging', 'blog post', 'posts'],
  },
  {
    id: 'visual-editor-quickstart',
    title: 'Visual Editor Quick Start',
    url: 'https://docs.sky-cms.com/for-editors/visual-editor-quickstart/',
    summary: 'Best quick-start page for authors working in the visual editor.',
    keywords: ['visual editor', 'editor', 'quick start', 'authoring'],
  },
  {
    id: 'file-manager-quickstart',
    title: 'File Manager Quick Start',
    url: 'https://docs.sky-cms.com/for-editors/file-manager-quickstart/',
    summary: 'How to upload and organize files and media.',
    keywords: ['files', 'media', 'file manager', 'upload'],
  },
];

export function findRelevantSkyCmsDocs(query: string, limit = 4): SkyCmsDocEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [
      getDocById('docs-map'),
      getDocById('ai-context-pack'),
      getDocById('layouts-templates-articles'),
      getDocById('visual-editor-quickstart'),
    ].filter((entry): entry is SkyCmsDocEntry => !!entry);
  }

  const scored = scoreDocs(skyCmsDocsIndex, normalized, limit);
  if (scored.length > 0) {
    return scored;
  }

  return [getDocById('docs-map'), getDocById('ai-context-pack')].filter((entry): entry is SkyCmsDocEntry => !!entry);
}

export async function findRelevantSkyCmsDocsWithLiveLookup(query: string, limit = 4): Promise<SkyCmsDocEntry[]> {
  const curatedDocs = findRelevantSkyCmsDocs(query, limit);
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return curatedDocs;
  }

  try {
    const liveDocsIndex = await getLiveDocsIndex();
    const liveDocs = scoreDocs(liveDocsIndex, normalized, limit);
    if (liveDocs.length === 0) {
      return curatedDocs;
    }

    return mergeDocs(liveDocs, curatedDocs, limit);
  } catch {
    return curatedDocs;
  }
}

export function resetSkyCmsDocsIndexCacheForTests(): void {
  cachedLiveDocsIndex = undefined;
  liveDocsIndexPromise = undefined;
}

function getDocById(id: string): SkyCmsDocEntry | undefined {
  return skyCmsDocsIndex.find((entry) => entry.id === id);
}

function tokenize(value: string): string[] {
  return value
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function scoreDocs(entries: ReadonlyArray<SkyCmsDocEntry>, normalizedQuery: string, limit: number): SkyCmsDocEntry[] {
  const tokens = tokenize(normalizedQuery);
  return entries
    .map((entry) => ({ entry, score: scoreEntry(entry, normalizedQuery, tokens) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.title.localeCompare(right.entry.title))
    .slice(0, limit)
    .map((candidate) => candidate.entry);
}

function scoreEntry(entry: SkyCmsDocEntry, normalizedQuery: string, tokens: string[]): number {
  let score = 0;

  if (normalizedQuery.includes(entry.title.toLowerCase())) {
    score += 8;
  }

  for (const keyword of entry.keywords) {
    const normalizedKeyword = keyword.toLowerCase();
    if (normalizedQuery.includes(normalizedKeyword)) {
      score += 5;
    }
  }

  for (const token of tokens) {
    if (entry.title.toLowerCase().includes(token)) {
      score += 3;
    }

    if (entry.summary.toLowerCase().includes(token)) {
      score += 2;
    }

    if (entry.keywords.some((keyword) => keyword.toLowerCase().includes(token))) {
      score += 2;
    }
  }

  return score;
}

async function getLiveDocsIndex(): Promise<SkyCmsDocEntry[]> {
  if (cachedLiveDocsIndex && cachedLiveDocsIndex.expiresAt > Date.now()) {
    return cachedLiveDocsIndex.docs;
  }

  if (!liveDocsIndexPromise) {
    liveDocsIndexPromise = loadLiveDocsIndex();
  }

  try {
    const docs = await liveDocsIndexPromise;
    cachedLiveDocsIndex = {
      docs,
      expiresAt: Date.now() + LIVE_DOCS_CACHE_TTL_MS,
    };

    return docs;
  } finally {
    liveDocsIndexPromise = undefined;
  }
}

async function loadLiveDocsIndex(): Promise<SkyCmsDocEntry[]> {
  const fetchJson = getFetchJson();
  const response = await fetchJson(SKYCMS_DOCS_SEARCH_INDEX_URL);
  if (!response.ok) {
    throw new Error(`SkyCMS docs search index request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as SkyCmsDocsSearchPayload;
  const docs = (payload.docs ?? [])
    .map((entry, index) => mapLiveDocEntry(entry, index))
    .filter((entry): entry is SkyCmsDocEntry => !!entry);

  if (docs.length === 0) {
    throw new Error('SkyCMS docs search index returned no usable documents.');
  }

  return docs;
}

function getFetchJson(): (url: string) => Promise<FetchJsonResponse> {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Global fetch is unavailable in this environment.');
  }

  return async (url: string) => {
    const response = await globalThis.fetch(url);
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.json(),
    };
  };
}

function mapLiveDocEntry(entry: SkyCmsDocsSearchDocument, index: number): SkyCmsDocEntry | undefined {
  const location = (entry.location ?? '').trim();
  const title = stripMarkup(entry.title ?? '').trim();
  const text = normalizeWhitespace(stripMarkup(entry.text ?? ''));
  const url = new URL(location || '.', SKYCMS_DOCS_URL).toString();
  const summary = buildSummary(text, title);
  const keywords = buildKeywords(title, text, location);

  if (!title && !summary) {
    return undefined;
  }

  return {
    id: `live-doc-${index}`,
    title: title || humanizeLocation(location),
    url,
    summary,
    keywords,
  };
}

function buildSummary(text: string, title: string): string {
  if (text) {
    return text.length > 220 ? `${text.slice(0, 217).trimEnd()}...` : text;
  }

  return title ? `Live SkyCMS documentation result for ${title}.` : 'Live SkyCMS documentation result.';
}

function buildKeywords(title: string, text: string, location: string): string[] {
  const uniqueKeywords = new Set<string>();
  for (const token of [...tokenize(title.toLowerCase()), ...tokenize(text.toLowerCase()), ...tokenize(location.toLowerCase())]) {
    uniqueKeywords.add(token);
    if (uniqueKeywords.size >= 24) {
      break;
    }
  }

  return Array.from(uniqueKeywords);
}

function stripMarkup(value: string): string {
  return value.replace(/<[^>]+>/g, ' ');
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function humanizeLocation(location: string): string {
  const withoutAnchor = location.split('#')[0];
  const trimmed = withoutAnchor.replace(/^\/+|\/+$/g, '');
  if (!trimmed) {
    return 'SkyCMS Documentation';
  }

  const segment = trimmed.split('/').at(-1) ?? trimmed;
  return segment
    .split(/[-_]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function mergeDocs(primary: ReadonlyArray<SkyCmsDocEntry>, secondary: ReadonlyArray<SkyCmsDocEntry>, limit: number): SkyCmsDocEntry[] {
  const merged: SkyCmsDocEntry[] = [];
  const seen = new Set<string>();

  for (const entry of [...primary, ...secondary]) {
    if (seen.has(entry.url)) {
      continue;
    }

    seen.add(entry.url);
    merged.push(entry);

    if (merged.length >= limit) {
      break;
    }
  }

  return merged;
}
