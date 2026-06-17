import { SkyCmsQueryClient, FileListEntry } from './apiClient/queries';
import {
  ArticleSummary,
  LayoutSummary,
  TemplateSummary,
} from './types';
import { SkyCmsNode } from './treeProvider';

export type SkyCmsContentSearchScope = 'all' | 'layouts' | 'templates' | 'articles' | 'files';

export interface SkyCmsContentSearchOptions {
  query: string;
  scope: SkyCmsContentSearchScope;
  limit?: number;
}

export interface SkyCmsContentSearchResult {
  kind: 'layout' | 'template' | 'article' | 'blog-stream' | 'file' | 'folder';
  label: string;
  description?: string;
  node: SkyCmsNode;
}

interface SearchCandidate extends SkyCmsContentSearchResult {
  searchText: string;
  score: number;
}

export async function findSkyCmsContentSearchResults(
  queryClient: SkyCmsQueryClient,
  options: SkyCmsContentSearchOptions,
): Promise<SkyCmsContentSearchResult[]> {
  const query = normalizeQuery(options.query);
  const limit = options.limit ?? 25;

  if (!query) {
    return [];
  }

  const candidates = await collectSearchCandidates(queryClient, options.scope);
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreCandidate(candidate.searchText, query),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
    .slice(0, limit)
    .map(({ searchText: _searchText, score: _score, ...candidate }) => candidate);
}

async function collectSearchCandidates(
  queryClient: SkyCmsQueryClient,
  scope: SkyCmsContentSearchScope,
): Promise<SearchCandidate[]> {
  const candidates: SearchCandidate[] = [];

  const includeLayouts = scope === 'all' || scope === 'layouts';
  const includeTemplates = scope === 'all' || scope === 'templates';
  const includeArticles = scope === 'all' || scope === 'articles';
  const includeFiles = scope === 'all' || scope === 'files';

  const [layouts, templates, articles] = await Promise.all([
    includeLayouts ? queryClient.getLayouts() : Promise.resolve([] as LayoutSummary[]),
    includeTemplates ? queryClient.getTemplates() : Promise.resolve([] as TemplateSummary[]),
    includeArticles ? queryClient.getArticles() : Promise.resolve([] as ArticleSummary[]),
  ]);
  const safeLayouts = normalizeArray(layouts);
  const safeTemplates = normalizeArray(templates);
  const safeArticles = normalizeArray(articles);

  if (includeLayouts) {
    for (const layout of safeLayouts) {
      if (!layout) {
        continue;
      }
      const node = SkyCmsNode.layout(layout);
      candidates.push(buildCandidate('layout', node, [layout.name, node.description ? String(node.description) : undefined]));
    }
  }

  if (includeTemplates) {
    for (const template of safeTemplates) {
      if (!template) {
        continue;
      }
      const node = SkyCmsNode.template(template);
      candidates.push(buildCandidate('template', node, [template.name, template.layoutNumber ? `layout ${template.layoutNumber}` : undefined]));
    }
  }

  if (includeArticles) {
    for (const article of safeArticles) {
      if (!article) {
        continue;
      }
      const node = buildArticleSearchNode(article);
      candidates.push(
        buildCandidate(node.kind as SearchCandidate['kind'], node, [
          article.title,
          article.urlPath,
          article.blogKey,
          node.description ? String(node.description) : undefined,
        ]),
      );
    }
  }

  if (includeFiles) {
    const fileCandidates = await collectFileCandidates(queryClient, '/');
    candidates.push(...fileCandidates);
  }

  return candidates;
}

function buildArticleSearchNode(article: ArticleSummary): SkyCmsNode {
  if (normalizeArticleType(article.articleType) === 2) {
    return SkyCmsNode.blogStream(article);
  }

  return SkyCmsNode.article('', article);
}

async function collectFileCandidates(
  queryClient: SkyCmsQueryClient,
  parentPath: string,
): Promise<SearchCandidate[]> {
  const entries = normalizeArray(await queryClient.getFilesList(parentPath));
  const candidates: SearchCandidate[] = [];

  for (const entry of entries) {
    const path = entry.path ?? buildFilePath(parentPath, entry.name);
    const displayPath = entry.displayPath;
    const node = isDirectoryEntry(entry)
      ? SkyCmsNode.folderFromPath(path, entry.name, displayPath)
      : SkyCmsNode.fileFromPath(path, entry.name, displayPath);

    candidates.push(
      buildCandidate(node.kind as SearchCandidate['kind'], node, [entry.name, displayPath, path]),
    );

    if (isDirectoryEntry(entry)) {
      candidates.push(...await collectFileCandidates(queryClient, path));
    }
  }

  return candidates;
}

function buildCandidate(kind: SearchCandidate['kind'], node: SkyCmsNode, textParts: Array<string | number | null | undefined>): SearchCandidate {
  const searchText = textParts
    .map((part) => (part === null || part === undefined ? '' : String(part)))
    .filter((part) => part.length > 0)
    .join(' ')
    .toLowerCase();

  return {
    kind,
    label: String(node.label),
    description: typeof node.description === 'string' ? node.description : undefined,
    node,
    searchText,
    score: 0,
  };
}

function scoreCandidate(searchText: string, query: string): number {
  if (!query) {
    return 0;
  }

  if (searchText === query) {
    return 1000;
  }

  let score = 0;
  if (searchText.startsWith(query)) {
    score += 250;
  }
  if (searchText.includes(query)) {
    score += 150;
  }

  const tokens = query
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);

  for (const token of tokens) {
    if (searchText.includes(token)) {
      score += 20;
    }
  }

  return score;
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildFilePath(parentPath: string, name: string): string {
  return parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
}

function isDirectoryEntry(entry: FileListEntry): boolean {
  if (typeof entry.mimeType === 'string' && entry.mimeType.length > 0) {
    return entry.mimeType.toLowerCase() === 'directory';
  }

  return entry.isDir;
}

function normalizeArticleType(articleType: string | number | null | undefined): number | undefined {
  if (articleType === null || articleType === undefined || articleType === '') {
    return undefined;
  }

  const value = Number(articleType);
  return Number.isNaN(value) ? undefined : value;
}

function normalizeArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}
