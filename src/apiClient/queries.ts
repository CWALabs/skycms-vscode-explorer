import { requestJson } from './http';
import { ArticleGroups, BlogPostSummary, BlogSummary, EntityType, LayoutSummary, TemplateSummary } from '../types';

interface AuthMeResponse {
  username: string;
  displayName: string;
  role: string;
}

interface BrowserAuthStartResponse {
  loginUrl: string;
  state?: string;
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

  public async getLayouts(): Promise<LayoutSummary[]> {
    const token = await this.getRequiredToken();
    return requestJson<LayoutSummary[]>({
      baseUrl: this.getRequiredBaseUrl(),
      path: '/api/vscode/layouts',
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

  public async getArticles(): Promise<ArticleGroups> {
    const token = await this.getRequiredToken();
    return requestJson<ArticleGroups>({
      baseUrl: this.getRequiredBaseUrl(),
      path: '/api/vscode/articles',
      method: 'GET',
      token,
    });
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

  public async getFilesList(path: string): Promise<Array<{name: string; isDir: boolean; size: number}>> {
    const token = await this.getRequiredToken();
    const pathHash = this.encodePathHash(path);
    const apiPath = `/api/vscode/files/${pathHash}`;

    const response = await requestJson<Array<{name: string; isDir: boolean; size: number}>>({
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

  public async readFile(path: string): Promise<Uint8Array | string> {
    const token = await this.getRequiredToken();
    const pathHash = this.encodePathHash(path);
    const apiPath = `/api/vscode/files/${pathHash}/read`;

    const response = await requestJson<{content?: string; isBase64?: boolean} | ArrayBuffer>({
      baseUrl: this.getRequiredBaseUrl(),
      path: apiPath,
      method: 'GET',
      token,
    });

    // If response is base64-encoded object, decode it
    if (typeof response === 'object' && 'content' in response && response.isBase64) {
      return response.content ?? '';
    }

    // Otherwise return as-is
    if (response instanceof ArrayBuffer) {
      return new Uint8Array(response);
    }

    return '';
  }

  public async getBlogs(): Promise<BlogSummary[]> {
    const token = await this.getRequiredToken();
    return requestJson<BlogSummary[]>({
      baseUrl: this.getRequiredBaseUrl(),
      path: '/api/vscode/blogs',
      method: 'GET',
      token,
    });
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
