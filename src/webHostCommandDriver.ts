import * as vscode from 'vscode';
import { SkyCmsCommandClient } from './apiClient/commands';
import { SkyCmsQueryClient } from './apiClient/queries';
import { SkyCmsFileSystemProvider } from './fileSystemProvider';
import { SkyCmsNode, SkyCmsTreeProvider } from './treeProvider';
import { ArticleSummary, EntityType } from './types';
import {
  buildFieldUri,
  getLanguageForField,
  getLanguageForMimeType,
  getLanguageForPath,
} from './uriUtils';

export interface WebHostCommandDriverOptions {
  queryClient: SkyCmsQueryClient;
  commandClient: SkyCmsCommandClient;
  provider: SkyCmsTreeProvider;
  fileSystemProvider: SkyCmsFileSystemProvider;
  getActiveEditorUrl: () => string;
  getActivePublicUrl: () => Promise<string | undefined>;
  ensureSiteConfigured: () => void;
  showError: (prefix: string, error: unknown) => void;
}

export function registerWebHostCommandDriver(
  context: vscode.ExtensionContext,
  options: WebHostCommandDriverOptions,
): void {
  const {
    queryClient,
    commandClient,
    provider,
    fileSystemProvider,
    getActiveEditorUrl,
    getActivePublicUrl,
    ensureSiteConfigured,
    showError,
  } = options;

  context.subscriptions.push(
    vscode.commands.registerCommand('skycms.openField', async (node: unknown) => {
      try {
        ensureSiteConfigured();
        const fieldNode = assertFieldNode(node);

        if (fieldNode.isReadOnly || fieldNode.interactionMode === 'doc') {
          await openDocumentField(fieldNode);
          return;
        }

        await openInputField(fieldNode, queryClient, commandClient);
        provider.refresh();
      } catch (error) {
        showError('Could not open SkyCMS field.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.switchFieldLanguage', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.uri.scheme !== 'skycms') {
        vscode.window.showWarningMessage('Open a SkyCMS field tab first.');
        return;
      }

      const options: vscode.QuickPickItem[] = [
        { label: 'html', description: 'HTML' },
        { label: 'javascript', description: 'JavaScript' },
        { label: 'css', description: 'CSS' },
        { label: 'markdown', description: 'Markdown' },
        { label: 'plaintext', description: 'Plain Text' },
      ];

      const picked = await vscode.window.showQuickPick(options, {
        placeHolder: 'Select language mode for this field',
        title: 'Switch Field Language',
      });

      if (picked) {
        await vscode.languages.setTextDocumentLanguage(editor.document, picked.label);
      }
    }),
    vscode.commands.registerCommand('skycms.openFile', async (node: unknown) => {
      try {
        ensureSiteConfigured();
        const fileNode = assertFileNode(node);

        if (fileNode.isDir) {
          vscode.window.showErrorMessage('Cannot open a folder as a file.');
          return;
        }

        const uri = fileSystemProvider.pathToUri(fileNode.path!);
        const document = await vscode.workspace.openTextDocument(uri);
        const fileStat = await queryClient.getFileStat(fileNode.path!);
        const languageId = getLanguageForMimeType(fileStat.mimeType) ?? getLanguageForPath(fileNode.path!);
        if (languageId) {
          await vscode.languages.setTextDocumentLanguage(document, languageId);
        }

        await vscode.window.showTextDocument(document, { preview: false });
      } catch (error) {
        showError('Could not open file.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.preview', async (node: unknown) => {
      try {
        ensureSiteConfigured();
        const previewNode = assertPreviewNode(node);
        const previewUrl = await buildPreviewUrl(previewNode, getActiveEditorUrl(), queryClient);
        const opened = await vscode.env.openExternal(vscode.Uri.parse(previewUrl));
        if (!opened) {
          throw new Error('Could not open browser preview URL.');
        }
      } catch (error) {
        showError('Could not open preview.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.publishArticle', async (node: unknown) => {
      try {
        ensureSiteConfigured();
        const articleNode = assertArticleNode(node);
        const confirmed = await vscode.window.showWarningMessage(
          `Publish "${articleNode.article!.title}"? It will become publicly visible immediately.`,
          { modal: true },
          'Publish',
        );

        if (confirmed !== 'Publish') {
          return;
        }

        await commandClient.publishArticle(articleNode.article!.articleNumber);
        provider.refresh();
        vscode.window.showInformationMessage(`"${articleNode.article!.title}" published.`);
      } catch (error) {
        showError('Could not publish article.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.unpublishArticle', async (node: unknown) => {
      try {
        ensureSiteConfigured();
        const articleNode = assertArticleNode(node);
        const confirmed = await vscode.window.showWarningMessage(
          `Unpublish "${articleNode.article!.title}"? It will be removed from public view.`,
          { modal: true },
          'Unpublish',
        );

        if (confirmed !== 'Unpublish') {
          return;
        }

        await commandClient.unpublishArticle(articleNode.article!.articleNumber);
        provider.refresh();
        vscode.window.showInformationMessage(`"${articleNode.article!.title}" moved back to drafts.`);
      } catch (error) {
        showError('Could not unpublish article.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.restoreArticle', async () => {
      try {
        ensureSiteConfigured();
        const articleNumberInput = await vscode.window.showInputBox({
          title: 'Restore Deleted Article',
          prompt: 'Enter the article number to restore.',
          ignoreFocusOut: true,
          validateInput: (value) => {
            const trimmed = value.trim();
            if (trimmed.length === 0) {
              return 'Article number is required.';
            }

            const parsed = Number(trimmed);
            return Number.isInteger(parsed) && parsed > 0 ? undefined : 'Enter a valid article number greater than 0.';
          },
        });

        if (articleNumberInput === undefined) {
          return;
        }

        const articleNumber = Number(articleNumberInput.trim());
        await commandClient.restoreArticle(articleNumber);
        provider.refresh();
        vscode.window.showInformationMessage(`Article #${articleNumber} restored.`);
      } catch (error) {
        showError('Could not restore article.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.newArticle', async () => {
      try {
        ensureSiteConfigured();
        const title = await vscode.window.showInputBox({
          title: 'New SkyCMS Article',
          prompt: 'Enter the title for the new article.',
          ignoreFocusOut: true,
          validateInput: (value) => (value.trim().length === 0 ? 'Title is required.' : undefined),
        });

        if (!title) {
          return;
        }

        await commandClient.createArticle(title.trim());
        provider.refresh();
        vscode.window.showInformationMessage(`Article "${title.trim()}" created.`);
      } catch (error) {
        showError('Could not create article.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.newTemplate', async () => {
      try {
        ensureSiteConfigured();
        const template = await commandClient.createTemplate();
        provider.refresh();
        vscode.window.showInformationMessage(`Template "${template.title}" created.`);
      } catch (error) {
        showError('Could not create template.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.publishLayoutVersion', async (node: unknown) => {
      try {
        ensureSiteConfigured();
        const target = resolveLayoutCommandTarget(node);
        const confirmed = await vscode.window.showWarningMessage(
          `Publish layout version ${target.version} of "${target.name}"?`,
          { modal: true },
          'Publish',
        );

        if (confirmed !== 'Publish') {
          return;
        }

        await commandClient.publishLayoutVersion(target.layoutNumber, target.version);
        provider.refresh();
        vscode.window.showInformationMessage(`Layout version ${target.version} published.`);
      } catch (error) {
        showError('Could not publish layout version.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.setDefaultLayoutVersion', async (node: unknown) => {
      try {
        ensureSiteConfigured();
        const target = resolveLayoutCommandTarget(node);
        const confirmed = await vscode.window.showWarningMessage(
          `Set version ${target.version} of "${target.name}" as the default layout?`,
          { modal: true },
          'Set Default',
        );

        if (confirmed !== 'Set Default') {
          return;
        }

        await commandClient.setDefaultLayoutVersion(target.layoutNumber, target.version);
        provider.refresh();
        vscode.window.showInformationMessage(`Layout version ${target.version} set as default.`);
      } catch (error) {
        showError('Could not set default layout version.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.duplicateLayoutVersion', async (node: unknown) => {
      try {
        ensureSiteConfigured();
        const target = resolveLayoutCommandTarget(node);
        const newVersion = await commandClient.duplicateLayoutVersion(target.layoutNumber);
        provider.refresh();
        vscode.window.showInformationMessage(
          `Layout version ${newVersion.version} created from "${target.name}".`,
        );
      } catch (error) {
        showError('Could not duplicate layout version.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.diffLayoutVersion', async (node: unknown) => {
      try {
        ensureSiteConfigured();
        const layoutVersionNode = assertLayoutVersionNode(node);
        const layout = layoutVersionNode.layout!;
        const version = layoutVersionNode.layoutVersion!;

        const choices = [
          { label: 'Notes', fieldKey: 'notes' },
          { label: 'Head', fieldKey: 'head' },
          { label: 'Header', fieldKey: 'header' },
          { label: 'Footer', fieldKey: 'footer' },
        ];

        const selected = await vscode.window.showQuickPick(choices, {
          title: `Compare version ${version.version} with editable`,
          placeHolder: 'Select layout field to compare',
        });

        if (!selected) {
          return;
        }

        const leftUri = buildFieldUri({
          entityType: 'layouts',
          entityId: String(layout.layoutNumber),
          version: version.version,
          fieldKey: selected.fieldKey,
          tabLabel: `Layout Version ${version.version} - ${selected.label}`,
        });

        const rightUri = buildFieldUri({
          entityType: 'layouts',
          entityId: String(layout.layoutNumber),
          fieldKey: selected.fieldKey,
          tabLabel: `Layout Editable - ${selected.label}`,
        });

        await vscode.commands.executeCommand(
          'vscode.diff',
          leftUri,
          rightUri,
          `Layout: ${selected.label} (v${version.version} vs editable)`,
          { preview: false },
        );
      } catch (error) {
        showError('Could not diff layout versions.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.loadMoreVersions', (node: unknown) => {
      const groupNode = node instanceof SkyCmsNode && node.kind === 'article-versions-group' ? node : null;
      if (!groupNode) {
        return;
      }

      groupNode.versionsLoadedCount = (groupNode.versionsLoadedCount ?? 10) + 10;
      provider.refreshNode(groupNode);
    }),
    vscode.commands.registerCommand('skycms.diffArticleVersion', async (node: unknown) => {
      try {
        ensureSiteConfigured();
        const articleVersionNode = node instanceof SkyCmsNode && node.kind === 'article-version' ? node : null;
        if (!articleVersionNode?.article || !articleVersionNode.articleVersion) {
          return;
        }

        const article = articleVersionNode.article;
        const version = articleVersionNode.articleVersion;
        const choices = [
          { label: 'Title', fieldKey: 'title' },
          { label: 'Introduction', fieldKey: 'introduction' },
          { label: 'Body', fieldKey: 'content' },
          { label: 'Head', fieldKey: 'headerJavaScript' },
          { label: 'Footer', fieldKey: 'footerJavaScript' },
        ];

        const selected = await vscode.window.showQuickPick(choices, {
          title: `Compare version ${version.versionNumber} with current draft`,
          placeHolder: 'Select article field to compare',
        });

        if (!selected) {
          return;
        }

        const leftUri = buildFieldUri({
          entityType: 'articles',
          entityId: String(article.articleNumber),
          articleVersionId: version.versionId,
          fieldKey: selected.fieldKey,
          tabLabel: `v${version.versionNumber} - ${selected.label}`,
        });

        const rightUri = buildFieldUri({
          entityType: 'articles',
          entityId: String(article.articleNumber),
          fieldKey: selected.fieldKey,
          tabLabel: `Draft - ${selected.label}`,
        });

        await vscode.commands.executeCommand(
          'vscode.diff',
          leftUri,
          rightUri,
          `${article.title}: ${selected.label} (v${version.versionNumber} vs draft)`,
          { preview: false },
        );
      } catch (error) {
        showError('Could not diff article versions.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.openArticleOnPublicSite', async (node: unknown) => {
      try {
        const articleNode = assertArticleNode(node);
        const article = articleNode.article;
        if (!article?.urlPath) {
          throw new Error('This article does not have a public URL path.');
        }

        const publicBase = await getActivePublicUrl();
        if (!publicBase) {
          throw new Error('No public site URL is configured for this site.');
        }

        const publicUrl = new URL(article.urlPath, publicBase.endsWith('/') ? publicBase : `${publicBase}/`);
        await vscode.env.openExternal(vscode.Uri.parse(publicUrl.toString()));
      } catch (error) {
        showError('Could not open article on public site.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.deleteFile', async (node: unknown) => {
      try {
        ensureSiteConfigured();
        const fileNode = assertFileNode(node);
        const confirmed = await vscode.window.showWarningMessage(
          `Delete "${fileNode.label}"? This cannot be undone.`,
          { modal: true },
          'Delete',
        );

        if (confirmed !== 'Delete') {
          return;
        }

        await commandClient.deleteFile(fileNode.path!);
        provider.refresh();
        fileSystemProvider.refresh();
        vscode.window.showInformationMessage(`"${fileNode.label}" deleted.`);
      } catch (error) {
        showError('Could not delete file.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.deleteFolder', async (node: unknown) => {
      try {
        ensureSiteConfigured();
        const folderNode = assertFileNode(node);
        const confirmed = await vscode.window.showWarningMessage(
          `Delete folder "${folderNode.label}" and all its contents? This cannot be undone.`,
          { modal: true },
          'Delete',
        );

        if (confirmed !== 'Delete') {
          return;
        }

        await commandClient.deleteFolder(folderNode.path!);
        provider.refresh();
        fileSystemProvider.refresh();
        vscode.window.showInformationMessage(`Folder "${folderNode.label}" deleted.`);
      } catch (error) {
        showError('Could not delete folder.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.uploadFile', async (node: unknown) => {
      try {
        ensureSiteConfigured();
        const folderNode = assertFileNode(node);
        const files = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          openLabel: 'Upload',
        });

        if (!files || files.length === 0) {
          return;
        }

        const localUri = files[0];
        const fileName = localUri.path.split('/').pop() ?? 'upload';
        const destPath = `${folderNode.path}/${fileName}`;
        const fileData = await vscode.workspace.fs.readFile(localUri);

        await commandClient.uploadFile(destPath, fileData);
        provider.refresh();
        fileSystemProvider.refresh();
        vscode.window.showInformationMessage(`"${fileName}" uploaded.`);
      } catch (error) {
        showError('Could not upload file.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.newFolder', async (node: unknown) => {
      try {
        ensureSiteConfigured();
        const parentNode = assertFileNode(node);
        const name = await vscode.window.showInputBox({
          title: 'New Folder',
          prompt: 'Enter the folder name.',
          ignoreFocusOut: true,
          validateInput: (value) => (value.trim().length === 0 ? 'Folder name is required.' : undefined),
        });

        if (!name) {
          return;
        }

        const newPath = `${parentNode.path}/${name.trim()}`;
        await commandClient.createFolder(newPath);
        provider.refresh();
        fileSystemProvider.refresh();
        vscode.window.showInformationMessage(`Folder "${name.trim()}" created.`);
      } catch (error) {
        showError('Could not create folder.', error);
      }
    }),
  );
}

export async function openInputField(
  node: SkyCmsNode,
  queryClient: SkyCmsQueryClient,
  commandClient: SkyCmsCommandClient,
): Promise<void> {
  const entityType = node.entityType!;
  const entityId = node.entityId!;
  const fieldKey = node.fieldKey!;

  const currentValue = await queryClient.getInputFieldValue(entityType, entityId, fieldKey);
  const input = await vscode.window.showInputBox({
    title: `${node.entityLabel ?? 'SkyCMS'} - ${node.label}`,
    value: currentValue,
    ignoreFocusOut: true,
    validateInput: (value) => validateInputValue(fieldKey, value),
  });

  if (input === undefined) {
    return;
  }

  const valueToPersist = toPersistedInputValue(fieldKey, input);
  await commandClient.setInputFieldValue(entityType, entityId, fieldKey, valueToPersist);
  vscode.window.showInformationMessage(`${node.label} updated.`);
}

export function validateInputValue(fieldKey: string, value: string): string | undefined {
  if (fieldKey === 'title' || fieldKey === 'layoutName') {
    if (value.trim().length === 0) {
      return 'This field is required and cannot be empty.';
    }
  }

  if (fieldKey.toLowerCase() === 'bannerimage') {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return undefined;
    }

    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return 'Use an http or https URL, or leave the field empty.';
      }
    } catch {
      return 'Use a valid http or https URL, or leave the field empty.';
    }
  }

  if (fieldKey === 'published') {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return undefined;
    }

    const timestamp = Date.parse(trimmed);
    if (Number.isNaN(timestamp)) {
      return 'Use an ISO 8601 datetime string or leave empty to clear the value.';
    }
  }

  return undefined;
}

export function toPersistedInputValue(fieldKey: string, value: string): string | null {
  if (fieldKey === 'published') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    return new Date(trimmed).toISOString();
  }

  return value;
}

export function resolveLayoutCommandTarget(node: unknown): { layoutNumber: number; version: number; name: string } {
  const typedNode = node as SkyCmsNode;

  if (typedNode?.kind === 'layout' && typedNode.layout) {
    return {
      layoutNumber: typedNode.layout.layoutNumber,
      version: typedNode.layout.version,
      name: typedNode.layout.name,
    };
  }

  if (typedNode?.kind === 'layout-version' && typedNode.layout && typedNode.layoutVersion) {
    return {
      layoutNumber: typedNode.layout.layoutNumber,
      version: typedNode.layoutVersion.version,
      name: typedNode.layout.name,
    };
  }

  throw new Error('Invalid SkyCMS layout node.');
}

export async function buildPreviewUrl(
  node: SkyCmsNode,
  editorBaseUrl: string,
  client: SkyCmsQueryClient,
): Promise<string> {
  const base = new URL(editorBaseUrl);
  const preview = new URL('/Home/Index', base);

  switch (node.kind) {
    case 'article': {
      const article = node.article;
      if (!article?.articleNumber) {
        throw new Error('This article is missing an article number. Refresh the tree and try again.');
      }

      const editableId = await client.getInputFieldValue('articles', String(article.articleNumber), 'id');
      if (!editableId) {
        throw new Error('Could not retrieve the editable article version for preview.');
      }

      preview.searchParams.set('previewType', 'editor');
      preview.searchParams.set('itemId', editableId);
      preview.searchParams.set('editorUrl', new URL(`/Editor/VisualEditor/${article.articleNumber}`, base).toString());
      return preview.toString();
    }

    case 'layout': {
      const layoutId = node.layout?.id;
      if (!layoutId) {
        throw new Error('This layout version is missing a preview ID. Refresh the tree and try again.');
      }

      preview.searchParams.set('previewType', 'layouts');
      preview.searchParams.set('itemId', layoutId);
      preview.searchParams.set('editorUrl', new URL('/Layouts/Index', base).toString());
      return preview.toString();
    }

    case 'layout-version': {
      const layoutId = node.layoutVersion?.id;
      if (!layoutId) {
        throw new Error('This layout version is missing a preview ID. Refresh the tree and try again.');
      }

      preview.searchParams.set('previewType', 'layouts');
      preview.searchParams.set('itemId', layoutId);
      preview.searchParams.set('editorUrl', new URL('/Layouts/Index', base).toString());
      return preview.toString();
    }

    case 'template': {
      preview.searchParams.set('previewType', 'templates');
      preview.searchParams.set('itemId', node.template!.templateId);
      preview.searchParams.set('editorUrl', new URL('/Templates/Index', base).toString());
      return preview.toString();
    }

    default:
      throw new Error('This node type does not support preview.');
  }
}

function assertFieldNode(node: unknown): SkyCmsNode {
  if (!node || typeof node !== 'object') {
    throw new Error('Invalid field node payload.');
  }

  const typedNode = node as SkyCmsNode;
  if (typedNode.kind !== 'field' || !typedNode.entityType || !typedNode.entityId || !typedNode.fieldKey) {
    throw new Error('Invalid SkyCMS field node.');
  }

  return typedNode;
}

function assertArticleNode(node: unknown): SkyCmsNode {
  if (!node || typeof node !== 'object') {
    throw new Error('Invalid article node payload.');
  }

  const typedNode = node as SkyCmsNode;
  if ((typedNode.kind !== 'article' && typedNode.kind !== 'blog-stream') || !typedNode.article) {
    throw new Error('Invalid SkyCMS article node.');
  }

  return typedNode;
}

function assertFileNode(node: unknown): SkyCmsNode {
  if (!node || typeof node !== 'object') {
    throw new Error('Invalid file node payload.');
  }

  const typedNode = node as SkyCmsNode;
  if ((typedNode.kind !== 'file' && typedNode.kind !== 'folder') || !typedNode.path) {
    throw new Error('Invalid SkyCMS file node.');
  }

  return typedNode;
}

function assertPreviewNode(node: unknown): SkyCmsNode {
  if (!node || typeof node !== 'object') {
    throw new Error('Invalid preview node payload.');
  }

  const typedNode = node as SkyCmsNode;

  if (typedNode.kind === 'article' && typedNode.article) {
    return typedNode;
  }

  if (typedNode.kind === 'blog-stream' && typedNode.article) {
    return typedNode;
  }

  if (typedNode.kind === 'layout' && typedNode.layout) {
    return typedNode;
  }

  if (typedNode.kind === 'layout-version' && typedNode.layout && typedNode.layoutVersion) {
    return typedNode;
  }

  if (typedNode.kind === 'template' && typedNode.template) {
    return typedNode;
  }

  throw new Error('This node type does not support preview.');
}

function assertLayoutVersionNode(node: unknown): SkyCmsNode {
  if (!node || typeof node !== 'object') {
    throw new Error('Invalid layout version node payload.');
  }

  const typedNode = node as SkyCmsNode;
  if (typedNode.kind !== 'layout-version' || !typedNode.layout || !typedNode.layoutVersion) {
    throw new Error('Invalid SkyCMS layout version node.');
  }

  return typedNode;
}

async function openDocumentField(node: SkyCmsNode): Promise<void> {
  const uri = buildFieldUri({
    entityType: node.entityType as EntityType,
    entityId: node.entityId!,
    version: node.layoutVersionNumber,
    articleVersionId: node.articleVersionId,
    fieldKey: node.fieldKey!,
    tabLabel: `${getDocumentTitlePart(node)} - ${String(node.label || node.fieldKey || 'Field')}`,
  });

  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.languages.setTextDocumentLanguage(document, getLanguageForField(node.fieldKey!));
  await vscode.window.showTextDocument(document, { preview: false });
}

function getDocumentTitlePart(node: SkyCmsNode): string {
  if (node.entityType === 'layouts') {
    return node.layoutVersionNumber !== undefined ? `Layout Version ${node.layoutVersionNumber}` : 'Layout';
  }

  if (node.entityType === 'templates') {
    return 'Template';
  }

  if (node.entityType === 'articles' && node.articleVersionId !== undefined) {
    const versionLabel = node.articleVersion ? `v${node.articleVersion.versionNumber}` : 'Version';
    return `${node.entityLabel || 'Article'} ${versionLabel}`;
  }

  return node.entityLabel || String(node.entityType || 'SkyCMS');
}