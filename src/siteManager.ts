import * as vscode from 'vscode';

const SITES_KEY = 'skycms.sites';
const ACTIVE_SITE_ID_KEY = 'skycms.activeSiteId';

export interface SkyCmsSiteProfile {
  id: string;
  name: string;
  editorUrl: string;
  isDefault?: boolean;
  lastUsedAt?: string;
  websiteTitle?: string;
  publicUrl?: string;
}

export class SiteManager {
  private readonly context: vscode.ExtensionContext;

  public constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  public async ensureInitialized(fallbackEditorUrl: string): Promise<void> {
    const sites = await this.getSites();
    if (sites.length > 0) {
      return;
    }

    if (!fallbackEditorUrl) {
      return;
    }

    const normalized = this.normalizeUrl(fallbackEditorUrl);
    const defaultSite: SkyCmsSiteProfile = {
      id: this.createId(normalized),
      name: this.suggestName(normalized),
      editorUrl: normalized,
      isDefault: true,
      lastUsedAt: new Date().toISOString(),
    };

    await this.saveSites([defaultSite]);
    await this.context.globalState.update(ACTIVE_SITE_ID_KEY, defaultSite.id);
  }

  public async getSites(): Promise<SkyCmsSiteProfile[]> {
    const sites = this.context.globalState.get<SkyCmsSiteProfile[]>(SITES_KEY, []);
    return [...sites].sort((a, b) => a.name.localeCompare(b.name));
  }

  public async addSite(editorUrl: string, name?: string): Promise<SkyCmsSiteProfile> {
    const normalized = this.normalizeUrl(editorUrl);
    const sites = await this.getSites();

    if (sites.some((site) => this.normalizeUrl(site.editorUrl) === normalized)) {
      throw new Error('That SkyCMS editor URL already exists.');
    }

    const site: SkyCmsSiteProfile = {
      id: this.createId(normalized),
      name: name?.trim() || this.suggestName(normalized),
      editorUrl: normalized,
      isDefault: sites.length === 0,
      lastUsedAt: new Date().toISOString(),
    };

    const updated = [...sites, site];
    await this.saveSites(updated);

    if (updated.length === 1) {
      await this.context.globalState.update(ACTIVE_SITE_ID_KEY, site.id);
    }

    return site;
  }

  public async removeSite(siteId: string): Promise<SkyCmsSiteProfile | undefined> {
    const sites = await this.getSites();
    const removed = sites.find((site) => site.id === siteId);
    if (!removed) {
      return undefined;
    }

    let updated = sites.filter((site) => site.id !== siteId);

    if (removed.isDefault && updated.length > 0 && !updated.some((site) => site.isDefault)) {
      updated = updated.map((site, index) => ({ ...site, isDefault: index === 0 }));
    }

    await this.saveSites(updated);

    const activeId = this.getActiveSiteId();
    if (activeId === siteId) {
      const next = updated.find((site) => site.isDefault) ?? updated[0];
      await this.context.globalState.update(ACTIVE_SITE_ID_KEY, next?.id);
    }

    return removed;
  }

  public async setActiveSite(siteId: string): Promise<SkyCmsSiteProfile> {
    const sites = await this.getSites();
    const target = sites.find((site) => site.id === siteId);

    if (!target) {
      throw new Error('Selected SkyCMS site was not found.');
    }

    const updated = sites.map((site) =>
      site.id === target.id
        ? { ...site, lastUsedAt: new Date().toISOString() }
        : site,
    );

    await this.saveSites(updated);
    await this.context.globalState.update(ACTIVE_SITE_ID_KEY, target.id);
    return updated.find((site) => site.id === target.id)!;
  }

  public async getActiveSite(): Promise<SkyCmsSiteProfile | undefined> {
    const sites = await this.getSites();
    if (sites.length === 0) {
      return undefined;
    }

    const activeId = this.getActiveSiteId();
    if (activeId) {
      return sites.find((site) => site.id === activeId);
    }

    const fallback = sites.find((site) => site.isDefault) ?? sites[0];
    await this.context.globalState.update(ACTIVE_SITE_ID_KEY, fallback.id);
    return fallback;
  }

  public async setDefaultSite(siteId: string): Promise<void> {
    const sites = await this.getSites();
    const target = sites.find((site) => site.id === siteId);

    if (!target) {
      throw new Error('Selected SkyCMS site was not found.');
    }

    await this.saveSites(sites.map((site) => ({ ...site, isDefault: site.id === siteId })));
  }

  public getTokenSecretKey(siteId: string): string {
    return `skycms.bearerToken.${siteId}`;
  }

  public async updateSiteMetadata(
    siteId: string,
    websiteTitle: string | undefined,
    publicUrl: string | undefined,
  ): Promise<void> {
    const sites = await this.getSites();
    const updated = sites.map((site) =>
      site.id === siteId
        ? { ...site, websiteTitle: websiteTitle ?? site.websiteTitle, publicUrl: publicUrl ?? site.publicUrl }
        : site,
    );
    await this.saveSites(updated);
  }

  private getActiveSiteId(): string | undefined {
    return this.context.globalState.get<string>(ACTIVE_SITE_ID_KEY);
  }

  private async saveSites(sites: SkyCmsSiteProfile[]): Promise<void> {
    await this.context.globalState.update(SITES_KEY, sites);
  }

  private normalizeUrl(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error('SkyCMS editor URL is required.');
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error('Enter a valid absolute URL, for example https://editor.example.com.');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http and https URLs are supported.');
    }

    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '');
  }

  private suggestName(editorUrl: string): string {
    const host = new URL(editorUrl).host;
    return host;
  }

  private createId(input: string): string {
    const normalized = input.toLowerCase();
    let hash = 0;

    for (let i = 0; i < normalized.length; i += 1) {
      hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
      hash |= 0;
    }

    return `site-${Math.abs(hash)}`;
  }
}
