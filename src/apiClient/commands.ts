import { requestJson, requestRaw } from './http';
import { EntityType } from '../types';

interface BrowserAuthExchangeRequest {
  state?: string;
  code: string;
}

interface BrowserAuthExchangeResponse {
  token: string;
  role?: string;
  displayName?: string;
}

export class SkyCmsCommandClient {
  private readonly getToken: () => Promise<string | undefined>;
  private readonly resolveBaseUrl: () => string;

  public constructor(baseUrl: string | (() => string), getToken: () => Promise<string | undefined>) {
    this.resolveBaseUrl = typeof baseUrl === 'function' ? baseUrl : () => baseUrl;
    this.getToken = getToken;
  }

  public async completeBrowserAuth(payload: BrowserAuthExchangeRequest): Promise<BrowserAuthExchangeResponse> {
    return requestJson<BrowserAuthExchangeResponse>({
      baseUrl: this.getRequiredBaseUrl(),
      path: '/api/vscode/auth/browser/exchange',
      method: 'POST',
      body: payload,
    });
  }

  public async logout(): Promise<void> {
    const token = await this.getToken();

    if (!token) {
      return;
    }

    await requestJson<void>({
      baseUrl: this.getRequiredBaseUrl(),
      path: '/api/vscode/auth/logout',
      method: 'POST',
      token,
    });
  }

  public async setDocumentFieldContent(
    entityType: EntityType,
    entityId: string,
    fieldKey: string,
    content: string,
  ): Promise<void> {
    const token = await this.getRequiredToken();
    await requestJson<void>({
      baseUrl: this.getRequiredBaseUrl(),
      path: this.buildFieldPath(entityType, entityId, fieldKey),
      method: 'PUT',
      token,
      body: { content },
    });
  }

  public async setInputFieldValue(
    entityType: EntityType,
    entityId: string,
    fieldKey: string,
    value: string | null,
  ): Promise<void> {
    const token = await this.getRequiredToken();
    await requestJson<void>({
      baseUrl: this.getRequiredBaseUrl(),
      path: this.buildFieldPath(entityType, entityId, fieldKey),
      method: 'PUT',
      token,
      body: { value },
    });
  }

  public async publishArticle(articleNumber: number): Promise<void> {
    const token = await this.getRequiredToken();
    await requestJson<void>({
      baseUrl: this.getRequiredBaseUrl(),
      path: `/api/vscode/articles/${articleNumber}/publish`,
      method: 'POST',
      token,
    });
  }

  public async unpublishArticle(articleNumber: number): Promise<void> {
    const token = await this.getRequiredToken();
    await requestJson<void>({
      baseUrl: this.getRequiredBaseUrl(),
      path: `/api/vscode/articles/${articleNumber}/unpublish`,
      method: 'POST',
      token,
    });
  }

  public async createArticle(title: string, articleType?: number): Promise<{ articleNumber: number; title: string }> {
    const token = await this.getRequiredToken();
    return requestJson<{ articleNumber: number; title: string }>({
      baseUrl: this.getRequiredBaseUrl(),
      path: '/api/vscode/articles',
      method: 'POST',
      token,
      body: { title, articleType },
    });
  }

  public async publishLayoutVersion(layoutNumber: number, version: number): Promise<void> {
    const token = await this.getRequiredToken();
    await requestJson<void>({
      baseUrl: this.getRequiredBaseUrl(),
      path: `/api/vscode/layouts/${layoutNumber}/${version}/publish`,
      method: 'POST',
      token,
    });
  }

  public async setDefaultLayoutVersion(layoutNumber: number, version: number): Promise<void> {
    const token = await this.getRequiredToken();
    await requestJson<void>({
      baseUrl: this.getRequiredBaseUrl(),
      path: `/api/vscode/layouts/${layoutNumber}/${version}/set-default`,
      method: 'POST',
      token,
    });
  }

  public async duplicateLayoutVersion(layoutNumber: number): Promise<{ layoutNumber: number; version: number }> {
    const token = await this.getRequiredToken();
    return requestJson<{ layoutNumber: number; version: number }>({
      baseUrl: this.getRequiredBaseUrl(),
      path: `/api/vscode/layouts/${layoutNumber}/versions`,
      method: 'POST',
      token,
    });
  }

  public async deleteFile(path: string): Promise<void> {
    const token = await this.getRequiredToken();
    const pathHash = this.encodePathHash(path);
    await requestRaw({
      baseUrl: this.getRequiredBaseUrl(),
      path: `/api/vscode/files/${pathHash}`,
      method: 'DELETE',
      token,
    });
  }

  public async deleteFolder(path: string): Promise<void> {
    const token = await this.getRequiredToken();
    const pathHash = this.encodePathHash(path);
    await requestRaw({
      baseUrl: this.getRequiredBaseUrl(),
      path: `/api/vscode/folders/${pathHash}`,
      method: 'DELETE',
      token,
    });
  }

  public async createFolder(path: string): Promise<void> {
    const token = await this.getRequiredToken();
    const pathHash = this.encodePathHash(path);
    await requestRaw({
      baseUrl: this.getRequiredBaseUrl(),
      path: `/api/vscode/folders/${pathHash}`,
      method: 'POST',
      token,
    });
  }

  public async uploadFile(path: string, content: Uint8Array): Promise<void> {
    const token = await this.getRequiredToken();
    const pathHash = this.encodePathHash(path);
    await requestRaw({
      baseUrl: this.getRequiredBaseUrl(),
      path: `/api/vscode/files/${pathHash}`,
      method: 'POST',
      token,
      body: Buffer.from(content),
    });
  }

  public async moveFile(sourcePath: string, destPath: string): Promise<void> {
    const token = await this.getRequiredToken();
    const pathHash = this.encodePathHash(sourcePath);
    await requestJson({
      baseUrl: this.getRequiredBaseUrl(),
      path: `/api/vscode/files/${pathHash}/move`,
      method: 'POST',
      token,
      body: {destination: destPath},
    });
  }

  public async moveFolder(sourcePath: string, destPath: string): Promise<void> {
    const token = await this.getRequiredToken();
    const pathHash = this.encodePathHash(sourcePath);
    await requestJson({
      baseUrl: this.getRequiredBaseUrl(),
      path: `/api/vscode/folders/${pathHash}/move`,
      method: 'POST',
      token,
      body: {destination: destPath},
    });
  }

  private encodePathHash(path: string): string {
    const bytes = new TextEncoder().encode(path);
    const binaryString = String.fromCharCode(...Array.from(bytes));
    const base64 = btoa(binaryString);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  private async getRequiredToken(): Promise<string> {
    const token = await this.getToken();

    if (!token) {
      throw new Error('No authentication token is currently available.');
    }

    return token;
  }

  private getRequiredBaseUrl(): string {
    const baseUrl = this.resolveBaseUrl().trim();
    if (!baseUrl) {
      throw new Error('No SkyCMS site is currently selected.');
    }

    return baseUrl;
  }

  private buildFieldPath(entityType: EntityType, entityId: string, fieldKey: string): string {
    return `/api/vscode/${entityType}/${encodeURIComponent(entityId)}/${encodeURIComponent(fieldKey)}`;
  }
}
