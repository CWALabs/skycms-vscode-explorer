export interface LayoutSummary {
  id?: string;
  layoutNumber: number;
  version: number;
  name: string;
  isDefault?: boolean;
  isPublished?: boolean;
  lastPublished?: string | null;
  published?: string | null;
  isEditable?: boolean;
  lastModified?: string | null;
}

export interface LayoutVersionSummary {
  id?: string;
  layoutNumber: number;
  version: number;
  name: string;
  isDefault?: boolean;
  isPublished?: boolean;
  lastPublished?: string | null;
  published?: string | null;
  isEditable?: boolean;
  lastModified?: string | null;
}

export interface TemplateSummary {
  templateId: string;
  name: string;
  layoutNumber?: number;
}

export interface ArticleSummary {
  articleNumber: number;
  title: string;
  urlPath?: string;
  articleType?: string | number | null;
  blogKey?: string;
  isPublished?: boolean;
  lastPublished?: string | null;
}



export interface BlogSummary {
  articleNumber: number;
  name: string;
  blogKey: string;
}

export interface ArticleVersionSummary {
  versionId: string;
  versionNumber: number;
  isEditable: boolean;
  isPublished: boolean;
  publishedDate?: string | null;
  updated: string;
}

export interface BlogPostSummary {
  id?: string;
  articleNumber: number;
  title: string;
  isPublished: boolean;
}

export type EntityType = 'layouts' | 'templates' | 'articles';
export type InteractionMode = 'doc' | 'input';

export interface FieldDescriptor {
  key: string;
  label: string;
  interactionMode: InteractionMode;
  tooltip?: string;
}
