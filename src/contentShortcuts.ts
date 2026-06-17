import * as vscode from 'vscode';
import { SkyCmsNode } from './treeProvider';

const RECENT_CONTENT_KEY = 'skycms.recentContent';
const PINNED_CONTENT_KEY = 'skycms.pinnedContent';
const MAX_RECENT_ITEMS = 20;
const MAX_PINNED_ITEMS = 30;

export interface SkyCmsContentShortcut {
  id: string;
  kind: string;
  label: string;
  description?: string;
  node: Record<string, unknown>;
  updatedAt: number;
}

export interface SkyCmsContentShortcutPick extends SkyCmsContentShortcut {
  source: 'pinned' | 'recent';
}

export function isShortcutEligibleNode(node: unknown): node is SkyCmsNode {
  const typedNode = node as SkyCmsNode | undefined;
  if (!typedNode || typeof typedNode !== 'object') {
    return false;
  }

  switch (typedNode.kind) {
    case 'file':
    case 'folder':
      return !!typedNode.path;
    case 'layout':
      return !!typedNode.layout;
    case 'layout-version':
      return !!typedNode.layout && !!typedNode.layoutVersion;
    case 'template':
      return !!typedNode.template;
    case 'article':
    case 'blog-stream':
      return !!typedNode.article;
    default:
      return false;
  }
}

export async function addRecentContentShortcut(
  context: vscode.ExtensionContext,
  node: SkyCmsNode,
  options?: { label?: string; description?: string },
): Promise<void> {
  const entry = createShortcut(node, options);
  const existing = readShortcuts(context, RECENT_CONTENT_KEY);
  const merged = [entry, ...existing.filter((item) => item.id !== entry.id)].slice(0, MAX_RECENT_ITEMS);
  await context.globalState.update(RECENT_CONTENT_KEY, merged);
}

export async function togglePinnedContentShortcut(
  context: vscode.ExtensionContext,
  node: SkyCmsNode,
  options?: { label?: string; description?: string },
): Promise<boolean> {
  const entry = createShortcut(node, options);
  const existing = readShortcuts(context, PINNED_CONTENT_KEY);
  const alreadyPinned = existing.some((item) => item.id === entry.id);

  if (alreadyPinned) {
    const next = existing.filter((item) => item.id !== entry.id);
    await context.globalState.update(PINNED_CONTENT_KEY, next);
    return false;
  }

  const next = [entry, ...existing].slice(0, MAX_PINNED_ITEMS);
  await context.globalState.update(PINNED_CONTENT_KEY, next);
  return true;
}

export async function clearInvalidShortcuts(context: vscode.ExtensionContext): Promise<void> {
  const pinned = readShortcuts(context, PINNED_CONTENT_KEY);
  const recent = readShortcuts(context, RECENT_CONTENT_KEY);

  const validPinned = pinned.filter((item) => isShortcutEligibleNode(item.node));
  const validRecent = recent.filter((item) => isShortcutEligibleNode(item.node));

  if (validPinned.length !== pinned.length) {
    await context.globalState.update(PINNED_CONTENT_KEY, validPinned);
  }

  if (validRecent.length !== recent.length) {
    await context.globalState.update(RECENT_CONTENT_KEY, validRecent);
  }
}

export function getPinnedContentShortcuts(context: vscode.ExtensionContext): SkyCmsContentShortcut[] {
  return readShortcuts(context, PINNED_CONTENT_KEY);
}

export function getRecentContentShortcuts(context: vscode.ExtensionContext): SkyCmsContentShortcut[] {
  return readShortcuts(context, RECENT_CONTENT_KEY);
}

export function getContentShortcutPicks(context: vscode.ExtensionContext): SkyCmsContentShortcutPick[] {
  const pinned = getPinnedContentShortcuts(context).map((item) => ({ ...item, source: 'pinned' as const }));
  const pinnedIds = new Set(pinned.map((item) => item.id));
  const recent = getRecentContentShortcuts(context)
    .filter((item) => !pinnedIds.has(item.id))
    .map((item) => ({ ...item, source: 'recent' as const }));

  return [...pinned, ...recent];
}

function readShortcuts(context: vscode.ExtensionContext, key: string): SkyCmsContentShortcut[] {
  const value = context.globalState.get<unknown>(key, []);
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is SkyCmsContentShortcut => isShortcutRecord(item));
}

function isShortcutRecord(value: unknown): value is SkyCmsContentShortcut {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SkyCmsContentShortcut>;
  return typeof candidate.id === 'string'
    && typeof candidate.kind === 'string'
    && typeof candidate.label === 'string'
    && typeof candidate.updatedAt === 'number'
    && !!candidate.node
    && typeof candidate.node === 'object';
}

function createShortcut(
  node: SkyCmsNode,
  options?: { label?: string; description?: string },
): SkyCmsContentShortcut {
  return {
    id: buildShortcutId(node),
    kind: node.kind,
    label: options?.label ?? String(node.label),
    description: options?.description,
    node: toPlainNode(node),
    updatedAt: Date.now(),
  };
}

function toPlainNode(node: SkyCmsNode): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    kind: node.kind,
    label: node.label,
    description: node.description,
    path: node.path,
    isDir: node.isDir,
    article: node.article,
    layout: node.layout,
    layoutVersion: node.layoutVersion,
    template: node.template,
  };

  return JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
}

function buildShortcutId(node: SkyCmsNode): string {
  switch (node.kind) {
    case 'file':
    case 'folder':
      return `${node.kind}:${node.path}`;
    case 'layout':
      return `layout:${node.layout?.layoutNumber}`;
    case 'layout-version':
      return `layout-version:${node.layout?.layoutNumber}:${node.layoutVersion?.version}`;
    case 'template':
      return `template:${node.template?.templateId}`;
    case 'article':
    case 'blog-stream':
      return `${node.kind}:${node.article?.articleNumber}`;
    default:
      return `${node.kind}:${String(node.label)}`;
  }
}
