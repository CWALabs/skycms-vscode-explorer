
import * as vscode from 'vscode';
import { FileListEntry, SkyCmsQueryClient } from './apiClient/queries';
import {
  ArticleSummary,
  ArticleVersionSummary,
  EntityType,
  FieldDescriptor,
  InteractionMode,
  LayoutSummary,
  LayoutVersionSummary,
  TemplateSummary,
} from './types';
import { SiteManager } from './siteManager';
import { AuthManager } from './authManager';
import { HttpError } from './apiClient/httpError';
import { logError, logInfo } from './log';
import { ErrorHandler } from './errorHandler';

export class SkyCmsTreeProvider implements vscode.TreeDataProvider<SkyCmsNode> {
  private readonly queryClient: SkyCmsQueryClient;
  private readonly getToken: () => Promise<string | undefined>;
  private readonly siteManager: SiteManager;
  private authManager: AuthManager | undefined;
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<SkyCmsNode | undefined>();

  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  public constructor(
    queryClient: SkyCmsQueryClient,
    getToken: () => Promise<string | undefined>,
    siteManager: SiteManager,
    authManager?: AuthManager,
  ) {
    this.queryClient = queryClient;
    this.getToken = getToken;
    this.siteManager = siteManager;
    this.authManager = authManager;
  }

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public refreshNode(node: SkyCmsNode): void {
    this.onDidChangeTreeDataEmitter.fire(node);
  }

  public getTreeItem(element: SkyCmsNode): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: SkyCmsNode): Promise<SkyCmsNode[]> {
    logInfo(`getChildren called: kind=${element?.kind ?? 'root'}`);
    const token = await this.getToken();
    logInfo(`getChildren token present=${token ? 'yes' : 'no'}`);

    if (!token) {
      return await this.getUnauthenticatedNodes(element);
    }

    if (!element) {
      // Return the root node with site name indicator
      const activeSite = await this.siteManager.getActiveSite();
      const rootLabel = activeSite ? `${activeSite.websiteTitle || activeSite.name} (website)` : 'SkyCMS Website';
      return [SkyCmsNode.root(rootLabel)];
    }

    // Handle root node - return category children
    if (element.kind === 'root') {
      return [
        SkyCmsNode.category('Layouts', 'layouts', 'Layouts define the shared structure applied to every page — header, footer, and <head> content. Changes here affect your entire site.'),
        SkyCmsNode.category('Page Templates', 'templates', 'Page Templates define content regions and structure that articles and pages are built on. Each template controls which editable areas appear on a page.'),
        SkyCmsNode.category('Articles', 'articles', 'Articles are the primary content type in SkyCMS — standalone web pages with titles, categories, banner images, and rich-text body content.'),
        SkyCmsNode.filesCategory(),
      ];
    }

    switch (element.kind) {
      case 'category':
        return this.getCategoryChildren(element);
      case 'files-category':
        return this.getFilesCategoryChildren();
      case 'folder':
        return element.path ? this.getFolderChildren(element.path) : [];
      case 'layout':
        return element.layout ? this.getLayoutFields(element.layout) : [];
      case 'layout-versions-group':
        return element.layout ? this.getLayoutVersions(element.layout) : [];
      case 'layout-version':
        return element.layout && element.layoutVersion
          ? this.getLayoutVersionFields(element.layout, element.layoutVersion)
          : [];
      case 'template':
        return element.template ? this.getTemplateFields(element.template) : [];
      case 'article-group':
        return element.groupName && element.articles
          ? this.getArticleGroupChildren(element.groupName, element.articles)
          : [];
      case 'article':
        return element.article ? this.getArticleFields(element.article) : [];
      case 'article-versions-group':
        return this.getArticleVersionsChildren(element);
      case 'article-version':
        return element.article && element.articleVersion
          ? this.getArticleVersionFields(element.article, element.articleVersion)
          : [];
      case 'blog-stream':
        return element.article ? this.getBlogStreamFields(element.article) : [];
      case 'blog-stream-posts':
        return element.article ? this.getBlogStreamPosts(element.article) : [];
      default:
        return [];
    }
  }

  private async getUnauthenticatedNodes(element?: SkyCmsNode): Promise<SkyCmsNode[]> {
    if (element) {
      return [];
    }

    const activeSite = await this.siteManager.getActiveSite();
    if (!activeSite) {
      // No site configured — let viewsWelcome show the "Add Site" prompt.
      return [];
    }

    // Site is configured but session is not active — show a clickable node.
    const siteName = activeSite.websiteTitle || activeSite.name;
    return [SkyCmsNode.needsReauth(siteName)];
  }

  private async getCategoryChildren(category: SkyCmsNode): Promise<SkyCmsNode[]> {
    logInfo(`getCategoryChildren: category=${category.category}`);
    try {
      if (category.category === 'layouts') {
        const layouts = await this.queryClient.getLayouts();
        return layouts.map((layout) => SkyCmsNode.layout(layout));
      }

      if (category.category === 'templates') {
        const templates = await this.queryClient.getTemplates();
        return templates.map((template) => SkyCmsNode.template(template));
      }

      logInfo('Fetching articles from API');
      const articles = await this.queryClient.getArticles();
      logInfo(`getArticles returned ${articles.length} items`);
      const sorted = [...articles].sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
      return sorted
        .filter((article) => Number(article.articleType) !== 1)
        .map((article) =>
          Number(article.articleType) === 2
            ? SkyCmsNode.blogStream(article)
            : SkyCmsNode.article('', article),
        );
    } catch (error) {
      logError(`Failed to load category children: category=${category.category}`, error);
      if (error instanceof HttpError && error.status === 401 && this.authManager) {
        void this.authManager.promptReauthIfNeeded();
      }

      const target = category.category === 'layouts'
        ? 'layouts'
        : category.category === 'templates'
          ? 'page templates'
          : 'articles';

      return [this.createLoadErrorNode(target, error)];
    }
  }

  private getArticleGroupChildren(groupName: string, articles: ArticleSummary[]): SkyCmsNode[] {
    const sorted = [...articles].sort((a, b) => a.title.localeCompare(b.title));
    return sorted.map((article) => SkyCmsNode.article(groupName, article));
  }

  private getBlogStreamFields(article: ArticleSummary): SkyCmsNode[] {
    const fields = this.buildFieldNodes('articles', String(article.articleNumber), [
      { key: 'published', label: 'Published', interactionMode: 'input', tooltip: 'Publication status: true or false' },
      { key: 'title', label: 'Title', interactionMode: 'input', tooltip: 'The blog headline' },
      { key: 'bannerImage', label: 'Banner Image', interactionMode: 'input', tooltip: 'URL of the banner image' },
      { key: 'category', label: 'Category', interactionMode: 'input', tooltip: 'Blog category or section' },
      { key: 'introduction', label: 'Introduction', interactionMode: 'doc', tooltip: 'Summary or teaser shown before the full blog' },
      { key: 'content', label: 'Body', interactionMode: 'doc', tooltip: 'The main blog body' },
      { key: 'headerJavaScript', label: 'Head', interactionMode: 'doc', tooltip: 'Anything that needs to be injected into the <head> specific for this blog' },
      { key: 'footerJavaScript', label: 'Footer', interactionMode: 'doc', tooltip: 'Anything that needs injecting below the Layout footer specific for this blog' },
    ], article.title);
    fields.push(SkyCmsNode.articleVersionsGroup(article));
    fields.push(SkyCmsNode.blogStreamPostsGroup(article));
    return fields;
  }

  private async getBlogStreamPosts(article: ArticleSummary): Promise<SkyCmsNode[]> {
    try {
      const blogKey = article.blogKey ?? '';
      const posts = await this.queryClient.getBlogPosts(blogKey);

      // The API may return one record per version. Deduplicate by articleNumber,
      // keeping the first occurrence (which represents the current/editable version).
      const seen = new Set<number>();
      const unique = posts.filter((post) => {
        if (seen.has(post.articleNumber)) {
          return false;
        }
        seen.add(post.articleNumber);
        return true;
      });

      const sorted = [...unique].sort((a, b) => a.title.localeCompare(b.title));
      return sorted.map((post) =>
        SkyCmsNode.article('', {
          articleNumber: post.articleNumber,
          title: post.title,
          isPublished: post.isPublished,
        }),
      );
    } catch (error) {
      logError('Failed to load blog posts.', error);
      return [this.createLoadErrorNode('blog posts', error)];
    }
  }

  private getLayoutFields(layout: LayoutSummary): SkyCmsNode[] {
    const editableFields = this.buildFieldNodes('layouts', String(layout.layoutNumber), [
      { key: 'layoutName', label: 'Layout Name', interactionMode: 'input', tooltip: 'The name of this layout' },
      { key: 'notes', label: 'Notes', interactionMode: 'doc', tooltip: 'Internal notes about this layout' },
      { key: 'head', label: 'Head', interactionMode: 'doc', tooltip: 'HTML/CSS/JS content for the <head> section' },
      { key: 'header', label: 'Header', interactionMode: 'doc', tooltip: 'Content displayed at the top of every page' },
      { key: 'footer', label: 'Footer', interactionMode: 'doc', tooltip: 'Content displayed at the bottom of every page' },
    ], layout.name);

    editableFields.push(SkyCmsNode.layoutVersionsGroup(layout));
    return editableFields;
  }

  private async getLayoutVersions(layout: LayoutSummary): Promise<SkyCmsNode[]> {
    try {
      const versions = await this.queryClient.getLayoutVersions(layout.layoutNumber);
      const historyOnly = versions.filter((version) => version.version !== layout.version);
      return historyOnly.map((version) => SkyCmsNode.layoutVersion(layout, version));
    } catch (error) {
      logError(`Failed to load layout versions: layout=${layout.layoutNumber}`, error);
      return [this.createLoadErrorNode('layout versions', error)];
    }
  }

  private getLayoutVersionFields(layout: LayoutSummary, version: LayoutVersionSummary): SkyCmsNode[] {
    return this.buildFieldNodes(
      'layouts',
      String(layout.layoutNumber),
      [
        { key: 'notes', label: 'Notes', interactionMode: 'doc', tooltip: 'Internal notes about this layout version' },
        { key: 'head', label: 'Head', interactionMode: 'doc', tooltip: 'HTML/CSS/JS content for the <head> section' },
        { key: 'header', label: 'Header', interactionMode: 'doc', tooltip: 'Content displayed at the top of every page' },
        { key: 'footer', label: 'Footer', interactionMode: 'doc', tooltip: 'Content displayed at the bottom of every page' },
      ],
      `${layout.name} v${version.version}`,
      { isReadOnly: true, layoutVersionNumber: version.version },
    );
  }

  private async getArticleVersionsChildren(groupNode: SkyCmsNode): Promise<SkyCmsNode[]> {
    if (!groupNode.article) {
      return [];
    }

    try {
      const loadCount = groupNode.versionsLoadedCount ?? 10;
      const result = await this.queryClient.getArticleVersions(groupNode.article.articleNumber, 0, loadCount);
      const nodes = result.items
        .filter((v) => !v.isEditable)
        .map((v) => SkyCmsNode.articleVersion(groupNode.article!, v));

      if (result.hasMore) {
        nodes.push(SkyCmsNode.articleVersionsEllipsis(groupNode));
      }

      if (nodes.length === 0) {
        return [SkyCmsNode.noVersionHistory()];
      }

      return nodes;
    } catch (error) {
      logError(`Failed to load article versions: article=${groupNode.article?.articleNumber}`, error);
      return [this.createLoadErrorNode('article versions', error)];
    }
  }

  private getArticleVersionFields(article: ArticleSummary, version: ArticleVersionSummary): SkyCmsNode[] {
    const label = version.isPublished
      ? `${article.title} v${version.versionNumber} (Published)`
      : `${article.title} v${version.versionNumber}`;

    return this.buildFieldNodes(
      'articles',
      String(article.articleNumber),
      [
        { key: 'title', label: 'Title', interactionMode: 'input', tooltip: 'Article title for this version' },
        { key: 'bannerImage', label: 'Banner Image', interactionMode: 'input', tooltip: 'Banner image URL for this version' },
        { key: 'category', label: 'Category', interactionMode: 'input', tooltip: 'Category for this version' },
        { key: 'introduction', label: 'Introduction', interactionMode: 'doc', tooltip: 'Introduction text for this version' },
        { key: 'content', label: 'Body', interactionMode: 'doc', tooltip: 'Body content for this version' },
        { key: 'headerJavaScript', label: 'Head', interactionMode: 'doc', tooltip: 'Head scripts for this version' },
        { key: 'footerJavaScript', label: 'Footer', interactionMode: 'doc', tooltip: 'Footer scripts for this version' },
      ],
      label,
      { isReadOnly: true, articleVersionId: version.versionId },
    );
  }

  private getTemplateFields(template: TemplateSummary): SkyCmsNode[] {
    return this.buildFieldNodes('templates', template.templateId, [
      { key: 'title', label: 'Title', interactionMode: 'input', tooltip: 'The name of this template' },
      { key: 'content', label: 'Content', interactionMode: 'doc', tooltip: 'The template markup and structure' },
      { key: 'description', label: 'Description', interactionMode: 'doc', tooltip: 'Information about when to use this template' },
    ], template.name);
  }

  private getArticleFields(article: ArticleSummary): SkyCmsNode[] {
    const fields = this.buildFieldNodes('articles', String(article.articleNumber), [
      { key: 'published', label: 'Published', interactionMode: 'input', tooltip: 'Publication status: true or false' },
      { key: 'title', label: 'Title', interactionMode: 'input', tooltip: 'The article headline' },
      { key: 'bannerImage', label: 'Banner Image', interactionMode: 'input', tooltip: 'URL of the banner image' },
      { key: 'category', label: 'Category', interactionMode: 'input', tooltip: 'Article category or section' },
      { key: 'introduction', label: 'Introduction', interactionMode: 'doc', tooltip: 'Summary or teaser shown before the full article' },
      { key: 'content', label: 'Body', interactionMode: 'doc', tooltip: 'The main article body' },
      { key: 'headerJavaScript', label: 'Head', interactionMode: 'doc', tooltip: 'Anything that needs to be injected into the <head> specific for this article' },
      { key: 'footerJavaScript', label: 'Footer', interactionMode: 'doc', tooltip: 'Anything that needs injecting below the Layout footer and just above the </body> end tag specific for this article' },
    ], article.title);
    fields.push(SkyCmsNode.articleVersionsGroup(article));
    return fields;
  }

  private buildFieldNodes(
    entityType: EntityType,
    entityId: string,
    descriptors: FieldDescriptor[],
    entityLabel: string,
    options?: { isReadOnly?: boolean; layoutVersionNumber?: number; articleVersionId?: string },
  ): SkyCmsNode[] {
    return descriptors.map((descriptor) =>
      SkyCmsNode.field(entityType, entityId, descriptor, entityLabel, options),
    );
  }

  private async getFilesCategoryChildren(): Promise<SkyCmsNode[]> {
    try {
      const entries = await this.queryClient.getFilesList('/');
      return entries.map((entry) => {
        const fullPath = entry.path ?? `/${entry.name}`;
        return isDirectoryEntry(entry)
          ? SkyCmsNode.folderFromPath(fullPath, entry.name)
          : SkyCmsNode.fileFromPath(fullPath, entry.name);
      });
    } catch (error) {
      logError('Failed to load files.', error);
      return [this.createLoadErrorNode('files', error)];
    }
  }

  private async getFolderChildren(parentPath: string): Promise<SkyCmsNode[]> {
    try {
      const entries = await this.queryClient.getFilesList(parentPath);
      return entries.map((entry) => {
        const childPath = entry.path ?? (parentPath.endsWith('/') ? `${parentPath}${entry.name}` : `${parentPath}/${entry.name}`);
        return isDirectoryEntry(entry)
          ? SkyCmsNode.folderFromPath(childPath, entry.name)
          : SkyCmsNode.fileFromPath(childPath, entry.name);
      });
    } catch (error) {
      logError(`Failed to load folder contents: path=${parentPath}`, error);
      return [this.createLoadErrorNode('folder contents', error)];
    }
  }

  private createLoadErrorNode(target: string, error: unknown): SkyCmsNode {
    const errorInfo = ErrorHandler.classifyError(error);
    const details: string[] = [];

    if (error instanceof HttpError) {
      details.push(`HTTP ${error.status}: ${errorInfo.title}`);
    } else {
      details.push(errorInfo.title);
    }

    if (errorInfo.message) {
      details.push(errorInfo.message);
    }

    if (errorInfo.suggestion) {
      details.push(`Suggestion: ${errorInfo.suggestion}`);
    }

    details.push('Tip: run "SkyCMS: Refresh" after fixing the issue.');

    const description = error instanceof HttpError
      ? `HTTP ${error.status}`
      : errorInfo.title;

    return SkyCmsNode.error(`Failed to load ${target}`, details.join('\n\n'), description);
  }
}

export class SkyCmsNode extends vscode.TreeItem {
  public kind: 'root' | 'sign-in' | 'needs-reauth' | 'category' | 'files-category' | 'folder' | 'file' | 'layout' | 'layout-versions-group' | 'layout-version' | 'template' | 'article-group' | 'article' | 'article-versions-group' | 'article-version' | 'article-versions-ellipsis' | 'no-version-history' | 'blog-stream' | 'blog-stream-posts' | 'field' | 'error';
  public category?: EntityType;
  public layout?: LayoutSummary;
  public layoutVersion?: LayoutVersionSummary;
  public template?: TemplateSummary;
  public article?: ArticleSummary;
  public articleVersion?: ArticleVersionSummary;
  public groupName?: string;
  public articles?: ArticleSummary[];
  public entityType?: EntityType;
  public entityId?: string;
  public fieldKey?: string;
  public interactionMode?: InteractionMode;
  public entityLabel?: string;
  public layoutVersionNumber?: number;
  public articleVersionId?: string;
  public isReadOnly?: boolean;
  public path?: string;
  public isDir?: boolean;
  public versionsLoadedCount?: number;
  public blogKey?: string;
  public errorMessage?: string;
  public errorDetails?: string;

  private constructor(
    label: string,
    kind: SkyCmsNode['kind'],
    collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(label, collapsibleState);
    this.kind = kind;
  }

  public static root(label: string): SkyCmsNode {
    const node = new SkyCmsNode(label, 'root', vscode.TreeItemCollapsibleState.Expanded);
    node.iconPath = new vscode.ThemeIcon('globe');
    node.contextValue = 'rootNode';
    node.tooltip = 'Your SkyCMS website. Right-click or click ··· for site actions.';
    return node;
  }

  public static signIn(): SkyCmsNode {
    const node = new SkyCmsNode('Sign in to SkyCMS…', 'sign-in', vscode.TreeItemCollapsibleState.None);
    node.command = {
      command: 'skycms.signIn',
      title: 'Sign in to SkyCMS',
    };
    node.contextValue = 'signInNode';
    return node;
  }

  public static needsReauth(siteName: string): SkyCmsNode {
    const node = new SkyCmsNode(`Log In to ${siteName}`, 'needs-reauth', vscode.TreeItemCollapsibleState.None);
    node.iconPath = new vscode.ThemeIcon('sign-in');
    node.tooltip = `Your session for ${siteName} has expired. Click to sign in again.`;
    node.command = {
      command: 'skycms.signIn',
      title: `Log In to ${siteName}`,
    };
    node.contextValue = 'needsReauthNode';
    return node;
  }

  public static category(label: string, category: EntityType, tooltip?: string): SkyCmsNode {
    const node = new SkyCmsNode(label, 'category', vscode.TreeItemCollapsibleState.Collapsed);
    node.category = category;
    node.contextValue = `${category}Category`;
    if (tooltip) {
      node.tooltip = tooltip;
    }
    return node;
  }

  public static filesCategory(): SkyCmsNode {
    const node = new SkyCmsNode('Files', 'files-category', vscode.TreeItemCollapsibleState.Collapsed);
    node.contextValue = 'filesCategoryNode';
    node.tooltip = 'The full file store root (/). Manage files and folders across the complete storage tree.';
    return node;
  }

  public static articleVersionsGroup(article: ArticleSummary): SkyCmsNode {
    const node = new SkyCmsNode('Versions', 'article-versions-group', vscode.TreeItemCollapsibleState.Collapsed);
    node.article = article;
    node.versionsLoadedCount = 10;
    node.contextValue = 'articleVersionsGroupNode';
    node.iconPath = new vscode.ThemeIcon('versions');
    return node;
  }

  public static articleVersion(article: ArticleSummary, version: ArticleVersionSummary): SkyCmsNode {
    const label = `Version ${version.versionNumber}`;
    const node = new SkyCmsNode(label, 'article-version', vscode.TreeItemCollapsibleState.Collapsed);
    node.article = article;
    node.articleVersion = version;

    const tags: string[] = [];
    if (version.isPublished) {
      tags.push('Published');
      node.iconPath = new vscode.ThemeIcon('verified-filled');
    } else {
      node.iconPath = new vscode.ThemeIcon('history');
    }

    tags.push('Read-only');
    node.description = tags.join(' · ');
    node.contextValue = 'articleVersionNode';
    return node;
  }

  public static articleVersionsEllipsis(parentGroupNode: SkyCmsNode): SkyCmsNode {
    const node = new SkyCmsNode('Load more versions…', 'article-versions-ellipsis', vscode.TreeItemCollapsibleState.None);
    node.contextValue = 'articleVersionsEllipsisNode';
    node.iconPath = new vscode.ThemeIcon('ellipsis');
    node.command = {
      command: 'skycms.loadMoreVersions',
      title: 'Load more versions',
      arguments: [parentGroupNode],
    };
    return node;
  }

  public static noVersionHistory(): SkyCmsNode {
    const node = new SkyCmsNode('No version history yet', 'no-version-history', vscode.TreeItemCollapsibleState.None);
    node.contextValue = 'noVersionHistoryNode';
    node.iconPath = new vscode.ThemeIcon('info');
    node.tooltip = 'Version history will appear here once this content has been published and edited again.';
    return node;
  }

  public static folder(parentPath: string, name: string): SkyCmsNode {
    const path = parentPath.endsWith('/') ? `${parentPath}${name}` : `${parentPath}/${name}`;
    return this.folderFromPath(path, name);
  }

  public static folderFromPath(path: string, name: string): SkyCmsNode {
    const node = new SkyCmsNode(name, 'folder', vscode.TreeItemCollapsibleState.Collapsed);
    node.path = path;
    node.isDir = true;
    node.iconPath = new vscode.ThemeIcon('folder');
    node.contextValue = 'folderNode';
    return node;
  }

  public static file(parentPath: string, name: string): SkyCmsNode {
    const path = parentPath.endsWith('/') ? `${parentPath}${name}` : `${parentPath}/${name}`;
    return this.fileFromPath(path, name);
  }

  public static fileFromPath(path: string, name: string): SkyCmsNode {
    const node = new SkyCmsNode(name, 'file', vscode.TreeItemCollapsibleState.None);
    node.path = path;
    node.isDir = false;
    node.iconPath = new vscode.ThemeIcon('file');
    node.contextValue = 'fileNode';
    node.command = {
      command: 'skycms.openFile',
      title: 'Open SkyCMS file',
      arguments: [node],
    };
    return node;
  }

  public static layout(layout: LayoutSummary): SkyCmsNode {
    const node = new SkyCmsNode(formatLayoutLabel(layout), 'layout', vscode.TreeItemCollapsibleState.Collapsed);
    node.layout = layout;
    node.description = formatLayoutDescription(layout);
    node.iconPath = new vscode.ThemeIcon('edit');
    node.contextValue = 'layoutNode';
    return node;
  }

  public static layoutVersionsGroup(layout: LayoutSummary): SkyCmsNode {
    const node = new SkyCmsNode('Versions', 'layout-versions-group', vscode.TreeItemCollapsibleState.Collapsed);
    node.layout = layout;
    node.contextValue = 'layoutVersionsGroupNode';
    node.iconPath = new vscode.ThemeIcon('versions');
    return node;
  }

  public static layoutVersion(layout: LayoutSummary, version: LayoutVersionSummary): SkyCmsNode {
    const node = new SkyCmsNode(`Version ${version.version}`, 'layout-version', vscode.TreeItemCollapsibleState.Collapsed);
    node.layout = layout;
    node.layoutVersion = version;

    const tags: string[] = [];
    if (version.isDefault || version.isPublished) {
      tags.push('Published');
      node.iconPath = new vscode.ThemeIcon('verified-filled');
    } else {
      node.iconPath = new vscode.ThemeIcon('history');
    }

    tags.push('Read-only');
    node.description = tags.join(' · ');
    node.contextValue = 'layoutVersionNode';
    return node;
  }

  public static template(template: TemplateSummary): SkyCmsNode {
    const node = new SkyCmsNode(template.name, 'template', vscode.TreeItemCollapsibleState.Collapsed);
    node.template = template;
    node.contextValue = 'templateNode';
    return node;
  }

  public static articleGroup(groupName: string, articles: ArticleSummary[]): SkyCmsNode {
    const node = new SkyCmsNode(groupName, 'article-group', vscode.TreeItemCollapsibleState.Collapsed);
    node.groupName = groupName;
    node.articles = articles;
    node.contextValue = 'articleGroupNode';
    return node;
  }

  public static article(groupName: string, article: ArticleSummary): SkyCmsNode {
    const node = new SkyCmsNode(formatArticleLabel(groupName, article), 'article', vscode.TreeItemCollapsibleState.Collapsed);
    node.groupName = groupName;
    node.article = article;
    node.description = formatArticleDescription(groupName, article);
    node.contextValue = article.isPublished ? 'articlePublishedNode' : 'articleNode';
    return node;
  }

  public static blogStream(article: ArticleSummary): SkyCmsNode {
    const label = `${article.title} (${article.isPublished ? 'Published' : 'Draft'})`;
    const node = new SkyCmsNode(label, 'blog-stream', vscode.TreeItemCollapsibleState.Collapsed);
    node.article = article;
    node.blogKey = article.blogKey;
    node.iconPath = new vscode.ThemeIcon('rss');
    node.description = article.lastPublished ? normalizeDateForDisplay(article.lastPublished) : undefined;
    node.contextValue = article.isPublished ? 'blogStreamPublishedNode' : 'blogStreamNode';
    return node;
  }

  public static blogStreamPostsGroup(article: ArticleSummary): SkyCmsNode {
    const node = new SkyCmsNode('Posts', 'blog-stream-posts', vscode.TreeItemCollapsibleState.Collapsed);
    node.article = article;
    node.blogKey = article.blogKey;
    node.iconPath = new vscode.ThemeIcon('list-unordered');
    node.contextValue = 'blogStreamPostsNode';
    return node;
  }

  public static field(
    entityType: EntityType,
    entityId: string,
    descriptor: FieldDescriptor,
    entityLabel: string,
    options?: { isReadOnly?: boolean; layoutVersionNumber?: number; articleVersionId?: string },
  ): SkyCmsNode {
    const node = new SkyCmsNode(descriptor.label, 'field', vscode.TreeItemCollapsibleState.None);
    node.entityType = entityType;
    node.entityId = entityId;
    node.fieldKey = descriptor.key;
    node.interactionMode = descriptor.interactionMode;
    node.entityLabel = entityLabel;
    node.layoutVersionNumber = options?.layoutVersionNumber;
    node.articleVersionId = options?.articleVersionId;
    node.isReadOnly = options?.isReadOnly ?? false;
    node.tooltip = descriptor.tooltip || `${entityLabel} - ${descriptor.label}`;
    node.contextValue = options?.isReadOnly ? `${entityType}FieldReadOnlyNode` : `${entityType}FieldNode`;
    node.command = {
      command: 'skycms.openField',
      title: 'Open SkyCMS field',
      arguments: [node],
    };
    return node;
  }

  public static error(message: string, details?: string, description?: string): SkyCmsNode {
    const node = new SkyCmsNode(message, 'error', vscode.TreeItemCollapsibleState.None);
    node.errorMessage = message;
    node.errorDetails = details;
    node.iconPath = new vscode.ThemeIcon('error');
    node.contextValue = 'errorNode';
    node.description = description;
    node.command = {
      command: 'skycms.refresh',
      title: 'Refresh SkyCMS Explorer',
    };
    if (details) {
      node.tooltip = `${message}\n\n${details}\n\nClick to try again.`;
    } else {
      node.tooltip = `${message}\n\nClick to try again.`;
    }
    return node;
  }
}

function formatArticleType(articleType: string | number | null | undefined): string | undefined {
  if (articleType === null || articleType === undefined || articleType === '') {
    return undefined;
  }

  // Raw numeric enum values are not human-readable; suppress them in the description.
  if (typeof articleType === 'number' || (typeof articleType === 'string' && /^\d+$/.test(articleType))) {
    return undefined;
  }

  return String(articleType);
}

function formatArticleDescription(groupName: string, article: ArticleSummary): string | undefined {
  const parts: string[] = [];

  const articleType = formatArticleType(article.articleType);
  if (articleType) {
    parts.push(articleType);
  }

  const published = resolvePublishedStatus(groupName, article);
  if (published && article.lastPublished) {
    const normalizedDate = normalizeDateForDisplay(article.lastPublished);
    if (normalizedDate) {
      parts.push(normalizedDate);
    }
  }

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function formatArticleLabel(groupName: string, article: ArticleSummary): string {
  const published = resolvePublishedStatus(groupName, article);
  if (published === undefined) {
    return article.title;
  }

  return `${article.title} (${published ? 'Published' : 'Draft'})`;
}

function resolvePublishedStatus(groupName: string, article: ArticleSummary): boolean | undefined {
  if (typeof article.isPublished === 'boolean') {
    return article.isPublished;
  }

  if (groupName === 'Published') {
    return true;
  }

  if (groupName === 'Drafts') {
    return false;
  }

  return undefined;
}

function normalizeDateForDisplay(value: string): string | undefined {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString().slice(0, 10);
}

function formatLayoutLabel(layout: LayoutSummary): string {
  const status = layout.isPublished ? 'Published' : 'Draft';
  return `${layout.name} (${status})`;
}

function formatLayoutDescription(layout: LayoutSummary): string | undefined {
  const parts: string[] = [];

  if (layout.isDefault) {
    parts.push('Default');
  }

  if (layout.version !== undefined) {
    parts.push(`Version ${layout.version}`);
  }

  if (layout.lastPublished) {
    const normalizedDate = normalizeDateForDisplay(layout.lastPublished);
    if (normalizedDate) {
      parts.push(normalizedDate);
    }
  }

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function isDirectoryEntry(entry: FileListEntry): boolean {
  if (typeof entry.mimeType === 'string' && entry.mimeType.length > 0) {
    return entry.mimeType.toLowerCase() === 'directory';
  }

  return entry.isDir;
}

