import * as vscode from 'vscode';
import { EntityType } from './types';

export interface FieldReference {
  entityType: EntityType;
  entityId: string;
  version?: number;
  articleVersionId?: string;
  fieldKey: string;
  tabLabel?: string;
}

export function buildFieldUri(reference: FieldReference): vscode.Uri {
  // Do NOT encodeURIComponent the tab label here — vscode.Uri.from encodes the
  // path itself, so pre-encoding would double-encode spaces (%20 → %2520).
  // Pass the label raw so VS Code encodes it once and displays it decoded.
  const tabLabelSegment = reference.tabLabel
    ? `/${reference.tabLabel}`
    : '';

  const versionSegment =
    reference.entityType === 'layouts' && reference.version !== undefined
      ? `/${reference.version}`
      : reference.entityType === 'articles' && reference.articleVersionId !== undefined
        ? `/${reference.articleVersionId}`
        : '';

  return vscode.Uri.from({
    scheme: 'skycms',
    path: `/${reference.entityType}/${encodeURIComponent(reference.entityId)}${versionSegment}/${encodeURIComponent(reference.fieldKey)}${tabLabelSegment}`,
  });
}

export function parseFieldUri(uri: vscode.Uri): FieldReference {
  if (uri.scheme !== 'skycms') {
    throw new Error(`Unsupported URI scheme: ${uri.scheme}`);
  }

  const parts = [
    ...(uri.authority ? [uri.authority] : []),
    ...uri.path.split('/').filter(Boolean),
  ].map(decodeURIComponent);

  if (parts.length < 3) {
    throw new Error(`Invalid SkyCMS field URI path: ${uri.path}`);
  }

  const [entityType] = parts;

  if (!isEntityType(entityType)) {
    throw new Error(`Unsupported SkyCMS entity type: ${entityType}`);
  }

  if (entityType === 'layouts' && parts.length >= 4 && /^\d+$/.test(parts[2])) {
    const version = Number(parts[2]);
    const fieldKey = parts[3];
    return {
      entityType,
      entityId: parts[1],
      version,
      fieldKey,
    };
  }

  if (entityType === 'articles' && parts.length >= 4 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parts[2])) {
    return {
      entityType,
      entityId: parts[1],
      articleVersionId: parts[2],
      fieldKey: parts[3],
    };
  }

  const entityId = parts[1];
  const fieldKey = parts[2];

  return {
    entityType,
    entityId,
    fieldKey,
  };
}

export function getLanguageForField(fieldKey: string): string {
  switch (fieldKey) {
    case 'introduction':
    case 'description':
    case 'notes':
      return 'plaintext';
    case 'headerJavaScript':
    case 'footerJavaScript':
      return 'javascript';
    default:
      return 'html';
  }
}

export function getExtensionForField(fieldKey: string): string {
  switch (getLanguageForField(fieldKey)) {
    case 'javascript':
      return '.js';
    case 'plaintext':
      return '.txt';
    default:
      return '.html';
  }
}

export function getLanguageForPath(path: string): string | undefined {
  const lowerPath = path.toLowerCase();

  if (lowerPath.endsWith('.html') || lowerPath.endsWith('.htm')) {
    return 'html';
  }

  if (lowerPath.endsWith('.css')) {
    return 'css';
  }

  if (lowerPath.endsWith('.js') || lowerPath.endsWith('.mjs') || lowerPath.endsWith('.cjs')) {
    return 'javascript';
  }

  if (lowerPath.endsWith('.ts') || lowerPath.endsWith('.tsx')) {
    return 'typescript';
  }

  if (lowerPath.endsWith('.json')) {
    return 'json';
  }

  if (lowerPath.endsWith('.md')) {
    return 'markdown';
  }

  if (lowerPath.endsWith('.xml')) {
    return 'xml';
  }

  if (lowerPath.endsWith('.txt')) {
    return 'plaintext';
  }

  return undefined;
}

export function getLanguageForMimeType(mimeType: string | undefined): string | undefined {
  if (!mimeType) {
    return undefined;
  }

  const normalized = mimeType.toLowerCase().split(';')[0].trim();

  if (normalized === 'text/html') {
    return 'html';
  }

  if (normalized === 'text/css') {
    return 'css';
  }

  if (normalized === 'text/javascript' || normalized === 'application/javascript') {
    return 'javascript';
  }

  if (normalized === 'application/typescript' || normalized === 'text/typescript') {
    return 'typescript';
  }

  if (normalized === 'application/json' || normalized === 'text/json') {
    return 'json';
  }

  if (normalized === 'application/xml' || normalized === 'text/xml') {
    return 'xml';
  }

  if (normalized.startsWith('text/')) {
    return 'plaintext';
  }

  return undefined;
}

function isEntityType(value: string): value is EntityType {
  return value === 'layouts' || value === 'templates' || value === 'articles';
}

/**
 * Validates the content of a document field before saving.
 * Returns an error message string if invalid, or undefined if valid.
 */
export function validateDocumentContent(fieldKey: string, content: string): string | undefined {
  if (fieldKey === 'headerJavaScript' || fieldKey === 'footerJavaScript') {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    try {
      // eslint-disable-next-line no-new-func
      new Function(trimmed);
      return undefined;
    } catch (e) {
      return `JavaScript syntax error: ${(e as SyntaxError).message}`;
    }
  }
  return undefined;
}
