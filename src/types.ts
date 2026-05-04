export interface LayoutSummary {
  id?: string;
  layoutNumber: number;
  version: number;
  name: string;
  isDefault?: boolean;
}

export interface TemplateSummary {
  templateId: string;
  name: string;
  layoutNumber?: number;
}

export interface ArticleSummary {
  id?: string;
  articleNumber: number;
  title: string;
  articleType?: string | number | null;
}

export interface ArticleGroups {
  drafts: ArticleSummary[];
  published: ArticleSummary[];
}

export interface BlogSummary {
  articleNumber: number;
  name: string;
  blogKey: string;
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
}
