import { SkyCmsQueryClient } from './apiClient/queries';
import { SkyCmsNode } from './treeProvider';
import { FieldReference, parseFieldUri } from './uriUtils';

export function isPreviewCapableNode(node: unknown): boolean {
  const typedNode = node as SkyCmsNode | undefined;
  if (!typedNode || typeof typedNode !== 'object') {
    return false;
  }

  return (
    (typedNode.kind === 'article' && !!typedNode.article)
    || (typedNode.kind === 'blog-stream' && !!typedNode.article)
    || (typedNode.kind === 'layout' && !!typedNode.layout)
    || (typedNode.kind === 'layout-version' && !!typedNode.layout && !!typedNode.layoutVersion)
    || (typedNode.kind === 'template' && !!typedNode.template)
  );
}

export function getFieldReferenceFromFieldNode(node: SkyCmsNode): FieldReference | undefined {
  if (node.kind !== 'field' || !node.entityType || !node.entityId || !node.fieldKey) {
    return undefined;
  }

  return {
    entityType: node.entityType,
    entityId: node.entityId,
    version: node.layoutVersionNumber,
    articleVersionId: node.articleVersionId,
    fieldKey: node.fieldKey,
  };
}

export async function resolvePreviewNodeFromFieldReference(
  queryClient: SkyCmsQueryClient,
  reference: FieldReference,
): Promise<SkyCmsNode | undefined> {
  if (reference.entityType === 'layouts') {
    const targetNumber = Number(reference.entityId);
    if (Number.isNaN(targetNumber)) {
      return undefined;
    }

    const layouts = await queryClient.getLayouts();
    const layout = layouts.find((item) => item.layoutNumber === targetNumber);
    return layout ? SkyCmsNode.layout(layout) : undefined;
  }

  if (reference.entityType === 'templates') {
    const templates = await queryClient.getTemplates();
    const template = templates.find((item) => item.templateId === reference.entityId);
    return template ? SkyCmsNode.template(template) : undefined;
  }

  const targetArticleNumber = Number(reference.entityId);
  if (Number.isNaN(targetArticleNumber)) {
    return undefined;
  }

  const articles = await queryClient.getArticles();
  const article = articles.find((item) => item.articleNumber === targetArticleNumber);
  if (!article) {
    return undefined;
  }

  return normalizeArticleType(article.articleType) === 2
    ? SkyCmsNode.blogStream(article)
    : SkyCmsNode.article('', article);
}

export function tryParseFieldReferenceFromUri(uri: { scheme: string; path: string; authority?: string }): FieldReference | undefined {
  if (uri.scheme !== 'skycms') {
    return undefined;
  }

  try {
    return parseFieldUri(uri as any);
  } catch {
    return undefined;
  }
}

function normalizeArticleType(articleType: string | number | null | undefined): number | undefined {
  if (articleType === null || articleType === undefined || articleType === '') {
    return undefined;
  }

  const value = Number(articleType);
  return Number.isNaN(value) ? undefined : value;
}
