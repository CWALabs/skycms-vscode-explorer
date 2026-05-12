import { requestJson } from './http';
import {
  ArticleSummary,
  ArticleVersionSummary,
  BlogPostSummary,
  EntityType,
  LayoutSummary,
  LayoutVersionSummary,
  TemplateSummary,
} from '../types';
import { logInfo, logWarn } from '../log';
import { decodeBase64ToUint8Array } from './base64';

interface AuthMeResponse {
  username: string;
  displayName: string;
  role: string;
}

interface BrowserAuthStartResponse {
  loginUrl: string;
  state?: string;
}

export interface BrowserAuthPollResponse {
  status: 'pending' | 'complete' | 'expired';
  code?: string;
  websiteTitle?: string;
  publicUrl?: string;
}

export interface FileListEntry {
  name: string;
  path?: string;
  isDir: boolean;
  mimeType?: string;
  size: number;
}

export class SkyCmsQueryClient {
  private readonly getToken: () => Promise<string | undefined>;
  private readonly resolveBaseUrl: () => string;

  public constructor(baseUrl: string | (() => string), getToken: () => Promise<string | undefined>) {
    this.resolveBaseUrl = typeof baseUrl === 'function' ? baseUrl : () => baseUrl;
    this.getToken = getToken;
  }

  public async getMe(): Promise<AuthMeResponse> {
    const token = await this.getRequiredToken();
    return requestJson<AuthMeResponse>({
      baseUrl: this.getRequiredBaseUrl(),
      path: '/api/vscode/auth/me',
      method: 'GET',
      token,
    });
  }

  public async startBrowserAuth(): Promise<BrowserAuthStartResponse> {
    return requestJson<BrowserAuthStartResponse>({
      baseUrl: this.getRequiredBaseUrl(),
      path: '/api/vscode/auth/browser/start',
      method: 'GET',
    });
  }

  public async pollBrowserAuth(state: string): Promise<BrowserAuthPollResponse> {
    return requestJson<BrowserAuthPollResponse>({
      baseUrl: this.getRequiredBaseUrl(),
      path: `/api/vscode/auth/poll?state=${encodeURIComponent(state)}`,
      method: 'GET',
    });
  }

  public async getLayouts(): Promise<LayoutSummary[]> {
    const token = await this.getRequiredToken();
    return requestJson<LayoutSummary[]>({
      baseUrl: this.getRequiredBaseUrl(),
      path: '/api/vscode/layouts',
      method: 'GET',
      token,
    });
  }

  public async getLayoutVersions(layoutNumber: number): Promise<LayoutVersionSummary[]> {
    const token = await this.getRequiredToken();
    return requestJson<LayoutVersionSummary[]>({
      baseUrl: this.getRequiredBaseUrl(),
      path: `/api/vscode/layouts/${layoutNumber}/versions`,
      method: 'GET',
      token,
    });
  }

  public async getTemplates(): Promise<TemplateSummary[]> {
    const token = await this.getRequiredToken();
    return requestJson<TemplateSummary[]>({
      baseUrl: this.getRequiredBaseUrl(),
      path: '/api/vscode/templates',
      method: 'GET',
      token,
    });
  }

  public async getArticles(): Promise<ArticleSummary[]> {
    const token = await this.getRequiredToken();
    const raw = await requestJson<unknown>({
      baseUrl: this.getRequiredBaseUrl(),
      path: '/api/vscode/articles',
      method: 'GET',
      token,
    });

    return normalizeArticlesResponse(raw);
  }

  public async getDocumentFieldContent(
    entityType: EntityType,
    entityId: string,
    fieldKey: string,
  ): Promise<string> {
    const token = await this.getRequiredToken();
    const path = this.buildFieldPath(entityType, entityId, fieldKey);
    const response = await requestJson<{ content?: string }>({
      baseUrl: this.getRequiredBaseUrl(),
      path,
      method: 'GET',
      token,
    });

    return response.content ?? '';
  }

  public async getInputFieldValue(
    entityType: EntityType,
    entityId: string,
    fieldKey: string,
  ): Promise<string> {
    const token = await this.getRequiredToken();
    const path = this.buildFieldPath(entityType, entityId, fieldKey);
    const response = await requestJson<{ value?: string | null }>({
      baseUrl: this.getRequiredBaseUrl(),
      path,
      method: 'GET',
      token,
    });

    if (response.value === null || response.value === undefined) {
      return '';
    }

    return String(response.value);
  }

  public async getLayoutVersionDocumentFieldContent(
    layoutNumber: number,
    version: number,
    fieldKey: string,
  ): Promise<string> {
    const token = await this.getRequiredToken();
    const response = await requestJson<{ content?: string; value?: string | null }>({
      baseUrl: this.getRequiredBaseUrl(),
      path: `/api/vscode/layouts/${layoutNumber}/${version}/${encodeURIComponent(fieldKey)}`,
      method: 'GET',
      token,
    });

    if (response.content !== undefined) {
      return response.content;
    }

    if (response.value === null || response.value === undefined) {
      return '';
    }

    return String(response.value);
  }

  public async getArticleVersions(
    articleNumber: number,
    skip = 0,
    take = 10,
  ): Promise<{ items: ArticleVersionSummary[]; total: number; hasMore: boolean }> {
    const token = await this.getRequiredToken();
    return requestJson<{ items: ArticleVersionSummary[]; total: number; hasMore: boolean }>({
      baseUrl: this.getRequiredBaseUrl(),
      path: `/api/vscode/articles/${articleNumber}/versions?skip=${skip}&take=${take}`,
      method: 'GET',
      token,
    });
  }

  public async getArticleVersionFieldContent(
    articleNumber: number,
    versionId: string,
    fieldKey: string,
  ): Promise<string> {
    const token = await this.getRequiredToken();
    const response = await requestJson<{ content?: string; value?: string | null }>({
      baseUrl: this.getRequiredBaseUrl(),
      path: `/api/vscode/articles/${articleNumber}/versions/${encodeURIComponent(versionId)}/${encodeURIComponent(fieldKey)}`,
      method: 'GET',
      token,
    });

    if (response.content !== undefined) {
      return response.content;
    }

    if (response.value === null || response.value === undefined) {
      return '';
    }

    return String(response.value);
  }

  private buildFieldPath(entityType: EntityType, entityId: string, fieldKey: string): string {
    return `/api/vscode/${entityType}/${encodeURIComponent(entityId)}/${encodeURIComponent(fieldKey)}`;
  }

  private async getRequiredToken(): Promise<string> {
    const token = await this.getToken();

    if (!token) {
      throw new Error('No authentication token is currently available.');
    }

    return token;
  }

  public async getFilesList(path: string): Promise<FileListEntry[]> {
    const token = await this.getRequiredToken();
    const pathHash = this.encodePathHash(path);
    const apiPath = `/api/vscode/files/${pathHash}`;

    const response = await requestJson<FileListEntry[]>({
      baseUrl: this.getRequiredBaseUrl(),
      path: apiPath,
      method: 'GET',
      token,
    });

    return response ?? [];
  }

  public async getFileStat(
    path: string,
  ): Promise<{size: number; mtime: number; isDir: boolean; mimeType: string}> {
    const token = await this.getRequiredToken();
    const pathHash = this.encodePathHash(path);
    const apiPath = `/api/vscode/files/${pathHash}/stat`;

    const response = await requestJson<{size: number; mtime: number; isDir: boolean; mimeType: string}>({
      baseUrl: this.getRequiredBaseUrl(),
      path: apiPath,
      method: 'GET',
      token,
    });

    return response ?? {size: 0, mtime: 0, isDir: false, mimeType: 'application/octet-stream'};
  }

  public async readFile(path: string): Promise<Uint8Array> {
    const token = await this.getRequiredToken();
    const pathHash = this.encodePathHash(path);
    const apiPath = `/api/vscode/files/${pathHash}/read`;

    const response = await requestJson<{content?: string; isBase64?: boolean} | ArrayBuffer | string>({
      baseUrl: this.getRequiredBaseUrl(),
      path: apiPath,
      method: 'GET',
      token,
    });

    // If response is ArrayBuffer, convert to Uint8Array
    if (response instanceof ArrayBuffer) {
      return new Uint8Array(response);
    }

    // If response is a plain string, return it directly
    if (typeof response === 'string') {
      return new TextEncoder().encode(response);
    }

    // If response is an object, extract content and decode only when explicitly marked base64.
    if (typeof response === 'object' && response !== null && 'content' in response) {
      const content = response.content ?? '';
      if (response.isBase64) {
        return decodeBase64ToUint8Array(content);
      }

      return new TextEncoder().encode(content);
    }

    // Plain JSON file bodies may be parsed into objects by requestJson.
    if (typeof response === 'object' && response !== null) {
      return new TextEncoder().encode(JSON.stringify(response));
    }

    // Fallback for unexpected formats
    return new Uint8Array();
  }

  public async getBlogPosts(blogKey: string): Promise<BlogPostSummary[]> {
    const token = await this.getRequiredToken();
    return requestJson<BlogPostSummary[]>({
      baseUrl: this.getRequiredBaseUrl(),
      path: `/api/vscode/blogs/${encodeURIComponent(blogKey)}/posts`,
      method: 'GET',
      token,
    });
  }

  private getRequiredBaseUrl(): string {
    const baseUrl = this.resolveBaseUrl().trim();
    if (!baseUrl) {
      throw new Error('No SkyCMS site is currently selected.');
    }

    return baseUrl;
  }

  private encodePathHash(path: string): string {
    const bytes = new TextEncoder().encode(path);
    const binaryString = String.fromCharCode(...Array.from(bytes));
    const base64 = btoa(binaryString);
    // Convert to URL-safe base64
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
}

function normalizeArticlesResponse(raw: unknown): ArticleSummary[] {
  if (!Array.isArray(raw)) {
    logWarn(`[SkyCMS] /api/vscode/articles expected an array but received: ${describeValue(raw)}`);
    return [];
  }

  if (raw.length > 0) {
    const first = raw[0];
    const firstKeys = first && typeof first === 'object' ? Object.keys(first as Record<string, unknown>) : [];
    logInfo(`[SkyCMS] /api/vscode/articles response: count=${raw.length}; firstKeys=${firstKeys.join(',')}`);
  } else {
    logInfo('[SkyCMS] /api/vscode/articles response: count=0');
  }

  return raw
    .map((item) => normalizeArticle(item))
    .filter((item): item is ArticleSummary => item !== undefined);
}

function normalizeArticle(item: unknown): ArticleSummary | undefined {
  if (!item || typeof item !== 'object') {
    return undefined;
  }

  const row = item as Record<string, unknown>;
  const articleNumber = toNumber(row.articleNumber ?? row.ArticleNumber);
  if (articleNumber === undefined) {
    return undefined;
  }

  const title = toStringValue(row.title ?? row.Title) ?? '(Untitled)';
  const urlPath = toStringValue(row.urlPath ?? row.UrlPath) ?? undefined;
  const articleType = toStringValue(row.articleType ?? row.ArticleType) ?? undefined;
  const blogKey = toStringValue(row.blogKey ?? row.BlogKey) ?? undefined;
  const isPublished = toBoolean(row.isPublished ?? row.IsPublished);
  const lastPublished = toStringValue(row.lastPublished ?? row.LastPublished) ?? null;

  return {
    articleNumber,
    title,
    urlPath,
    articleType,
    blogKey,
    isPublished,
    lastPublished,
  };
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') {
      return true;
    }

    if (value.toLowerCase() === 'false') {
      return false;
    }
  }

  return undefined;
}

function describeValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return `array(length=${value.length})`;
  }

  return typeof value;
}
