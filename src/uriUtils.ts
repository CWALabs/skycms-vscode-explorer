import * as vscode from 'vscode';
import { EntityType } from './types';

export interface FieldReference {
  entityType: EntityType;
  entityId: string;
  fieldKey: string;
}

export function buildFieldUri(reference: FieldReference): vscode.Uri {
  return vscode.Uri.from({
    scheme: 'skycms',
    path: `/${reference.entityType}/${encodeURIComponent(reference.entityId)}/${encodeURIComponent(reference.fieldKey)}`,
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

  if (parts.length !== 3) {
    throw new Error(`Invalid SkyCMS field URI path: ${uri.path}`);
  }

  const [entityType, entityId, fieldKey] = parts;

  if (!isEntityType(entityType)) {
    throw new Error(`Unsupported SkyCMS entity type: ${entityType}`);
  }

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
      return 'plaintext';
    default:
      return 'html';
  }
}

function isEntityType(value: string): value is EntityType {
  return value === 'layouts' || value === 'templates' || value === 'articles';
}
