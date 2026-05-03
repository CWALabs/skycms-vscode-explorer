
import * as vscode from 'vscode';
import { SkyCmsQueryClient } from './apiClient/queries';
import { ArticleSummary, EntityType, FieldDescriptor, InteractionMode, LayoutSummary, TemplateSummary } from './types';

export class SkyCmsTreeProvider implements vscode.TreeDataProvider<SkyCmsNode> {
  private readonly queryClient: SkyCmsQueryClient;
  private readonly getToken: () => Promise<string | undefined>;
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<SkyCmsNode | undefined>();

  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  public constructor(queryClient: SkyCmsQueryClient, getToken: () => Promise<string | undefined>) {
    this.queryClient = queryClient;
    this.getToken = getToken;
  }

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTreeItem(element: SkyCmsNode): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: SkyCmsNode): Promise<SkyCmsNode[]> {
    const token = await this.getToken();

    if (!token) {
      return this.getUnauthenticatedNodes(element);
    }

    if (!element) {
      return [
        SkyCmsNode.category('Layouts', 'layouts'),
        SkyCmsNode.category('Page Templates', 'templates'),
        SkyCmsNode.category('Articles', 'articles'),
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
      case 'template':
        return element.template ? this.getTemplateFields(element.template) : [];
      case 'article-group':
        return element.groupName && element.articles
          ? this.getArticleGroupChildren(element.groupName, element.articles)
          : [];
      case 'article':
        return element.article ? this.getArticleFields(element.article) : [];
      default:
        return [];
    }
  }

  private getUnauthenticatedNodes(element?: SkyCmsNode): SkyCmsNode[] {
    if (element) {
      return [];
    }

    return [SkyCmsNode.signIn()];
  }

  private async getCategoryChildren(category: SkyCmsNode): Promise<SkyCmsNode[]> {
    if (category.category === 'layouts') {
      const layouts = await this.queryClient.getLayouts();
      return layouts.map((layout) => SkyCmsNode.layout(layout));
    }

    if (category.category === 'templates') {
      const templates = await this.queryClient.getTemplates();
      return templates.map((template) => SkyCmsNode.template(template));
    }

    const grouped = await this.queryClient.getArticles();
    const draftGroup = SkyCmsNode.articleGroup('Drafts', grouped.drafts);
    const publishedGroup = SkyCmsNode.articleGroup('Published', grouped.published);
    return [draftGroup, publishedGroup];
  }

  private getArticleGroupChildren(groupName: string, articles: ArticleSummary[]): SkyCmsNode[] {
    const sorted = [...articles].sort((a, b) => a.title.localeCompare(b.title));
    return sorted.map((article) => SkyCmsNode.article(groupName, article));
  }

  private getLayoutFields(layout: LayoutSummary): SkyCmsNode[] {
    return this.buildFieldNodes('layouts', String(layout.layoutNumber), [
      { key: 'layoutName', label: 'Layout Name', interactionMode: 'input' },
      { key: 'notes', label: 'Notes', interactionMode: 'doc' },
      { key: 'head', label: 'Head', interactionMode: 'doc' },
      { key: 'header', label: 'Header', interactionMode: 'doc' },
      { key: 'footer', label: 'Footer', interactionMode: 'doc' },
    ], layout.name);
  }

  private getTemplateFields(template: TemplateSummary): SkyCmsNode[] {
    return this.buildFieldNodes('templates', template.templateId, [
      { key: 'title', label: 'Title', interactionMode: 'input' },
      { key: 'content', label: 'Content', interactionMode: 'doc' },
      { key: 'description', label: 'Description', interactionMode: 'doc' },
    ], template.name);
  }

  private getArticleFields(article: ArticleSummary): SkyCmsNode[] {
    return this.buildFieldNodes('articles', String(article.articleNumber), [
      { key: 'published', label: 'Published', interactionMode: 'input' },
      { key: 'title', label: 'Title', interactionMode: 'input' },
      { key: 'bannerImage', label: 'Banner Image', interactionMode: 'input' },
      { key: 'category', label: 'Category', interactionMode: 'input' },
      { key: 'introduction', label: 'Introduction', interactionMode: 'doc' },
      { key: 'content', label: 'Content', interactionMode: 'doc' },
      { key: 'headerJavaScript', label: 'Header JS', interactionMode: 'doc' },
      { key: 'footerJavaScript', label: 'Footer JS', interactionMode: 'doc' },
    ], article.title);
  }

  private buildFieldNodes(
    entityType: EntityType,
    entityId: string,
    descriptors: FieldDescriptor[],
    entityLabel: string,
  ): SkyCmsNode[] {
    return descriptors.map((descriptor) => SkyCmsNode.field(entityType, entityId, descriptor, entityLabel));
  }

  private async getFilesCategoryChildren(): Promise<SkyCmsNode[]> {
    try {
      const entries = await this.queryClient.getFilesList('/pub');
      return entries.map((entry) =>
        entry.isDir
          ? SkyCmsNode.folder('/pub', entry.name)
          : SkyCmsNode.file('/pub', entry.name),
      );
    } catch {
      return [];
    }
  }

  private async getFolderChildren(parentPath: string): Promise<SkyCmsNode[]> {
    try {
      const entries = await this.queryClient.getFilesList(parentPath);
      return entries.map((entry) => {
        const childPath = parentPath.endsWith('/') ? `${parentPath}${entry.name}` : `${parentPath}/${entry.name}`;
        return entry.isDir ? SkyCmsNode.folder(childPath, entry.name) : SkyCmsNode.file(childPath, entry.name);
      });
    } catch {
      return [];
    }
  }
}

export class SkyCmsNode extends vscode.TreeItem {
  public kind: 'sign-in' | 'category' | 'files-category' | 'folder' | 'file' | 'layout' | 'template' | 'article-group' | 'article' | 'field';
  public category?: EntityType;
  public layout?: LayoutSummary;
  public template?: TemplateSummary;
  public article?: ArticleSummary;
  public groupName?: string;
  public articles?: ArticleSummary[];
  public entityType?: EntityType;
  public entityId?: string;
  public fieldKey?: string;
  public interactionMode?: InteractionMode;
  public entityLabel?: string;
  public path?: string;
  public isDir?: boolean;

  private constructor(
    label: string,
    kind: SkyCmsNode['kind'],
    collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(label, collapsibleState);
    this.kind = kind;
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

  public static category(label: string, category: EntityType): SkyCmsNode {
    const node = new SkyCmsNode(label, 'category', vscode.TreeItemCollapsibleState.Collapsed);
    node.category = category;
    node.contextValue = `${category}Category`;
    return node;
  }

  public static filesCategory(): SkyCmsNode {
    const node = new SkyCmsNode('Files', 'files-category', vscode.TreeItemCollapsibleState.Collapsed);
    node.contextValue = 'filesCategoryNode';
    return node;
  }

  public static folder(parentPath: string, name: string): SkyCmsNode {
    const path = parentPath.endsWith('/') ? `${parentPath}${name}` : `${parentPath}/${name}`;
    const node = new SkyCmsNode(name, 'folder', vscode.TreeItemCollapsibleState.Collapsed);
    node.path = path;
    node.isDir = true;
    node.contextValue = 'folderNode';
    return node;
  }

  public static file(parentPath: string, name: string): SkyCmsNode {
    const path = parentPath.endsWith('/') ? `${parentPath}${name}` : `${parentPath}/${name}`;
    const node = new SkyCmsNode(name, 'file', vscode.TreeItemCollapsibleState.None);
    node.path = path;
    node.isDir = false;
    node.contextValue = 'fileNode';
    node.command = {
      command: 'skycms.openFile',
      title: 'Open SkyCMS file',
      arguments: [node],
    };
    return node;
  }

  public static layout(layout: LayoutSummary): SkyCmsNode {
    const node = new SkyCmsNode(layout.name, 'layout', vscode.TreeItemCollapsibleState.Collapsed);
    node.layout = layout;
    node.contextValue = 'layoutNode';
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
    const node = new SkyCmsNode(article.title, 'article', vscode.TreeItemCollapsibleState.Collapsed);
    node.groupName = groupName;
    node.article = article;
    node.description = formatArticleType(article.articleType);
    node.contextValue = 'articleNode';
    return node;
  }

  public static field(
    entityType: EntityType,
    entityId: string,
    descriptor: FieldDescriptor,
    entityLabel: string,
  ): SkyCmsNode {
    const node = new SkyCmsNode(descriptor.label, 'field', vscode.TreeItemCollapsibleState.None);
    node.entityType = entityType;
    node.entityId = entityId;
    node.fieldKey = descriptor.key;
    node.interactionMode = descriptor.interactionMode;
    node.entityLabel = entityLabel;
    node.tooltip = `${entityLabel} - ${descriptor.label}`;
    node.contextValue = `${entityType}FieldNode`;
    node.command = {
      command: 'skycms.openField',
      title: 'Open SkyCMS field',
      arguments: [node],
    };
    return node;
  }
}

function formatArticleType(articleType: string | number | null | undefined): string | undefined {
  if (articleType === null || articleType === undefined || articleType === '') {
    return undefined;
  }

  return String(articleType);
}
