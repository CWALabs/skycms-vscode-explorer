
import * as vscode from 'vscode';
import { AuthManager } from './authManager';
import { SkyCmsCommandClient } from './apiClient/commands';
import { SkyCmsQueryClient } from './apiClient/queries';
import { SkyCmsNode, SkyCmsTreeProvider } from './treeProvider';
import { HttpError } from './apiClient/http';
import { SkyCmsDocumentProvider } from './documentProvider';
import { SkyCmsFileSystemProvider } from './fileSystemProvider';
import { SiteManager, SkyCmsSiteProfile } from './siteManager';
import { buildFieldUri, getLanguageForField, parseFieldUri } from './uriUtils';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const siteManager = new SiteManager(context);
  await siteManager.ensureInitialized(getConfiguredEditorUrl());

  let activeSite = await siteManager.getActiveSite();

  const updateViewContext = async (): Promise<void> => {
    const site = await siteManager.getActiveSite();
    await vscode.commands.executeCommand('setContext', 'skycms.hasSite', !!site);
    const token = site ? await context.secrets.get(siteManager.getTokenSecretKey(site.id)) : undefined;
    await vscode.commands.executeCommand('setContext', 'skycms.isSignedIn', !!token);
  };

  await updateViewContext();

  const getActiveEditorUrl = (): string => activeSite?.editorUrl ?? '';
  const getActiveTokenStorageKey = (): string | undefined =>
    activeSite ? siteManager.getTokenSecretKey(activeSite.id) : undefined;

  const ensureSiteConfigured = (): void => {
    if (getActiveEditorUrl()) {
      return;
    }

    throw new Error('No SkyCMS site is configured. Run "SkyCMS: Add Site" first.');
  };

  const ensureEditorUrlConfigured = ensureSiteConfigured;

  const siteStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 200);
  siteStatusItem.command = 'skycms.switchSite';

  const updateSiteStatusBar = (): void => {
    if (!activeSite) {
      siteStatusItem.text = '$(globe) SkyCMS: Add Site';
      siteStatusItem.tooltip = 'No SkyCMS site configured. Click to switch site or run SkyCMS: Add Site.';
      siteStatusItem.command = 'skycms.manageSites';
      siteStatusItem.show();
      return;
    }

    siteStatusItem.text = `$(globe) SkyCMS: ${activeSite.name}`;
    siteStatusItem.tooltip = `${activeSite.editorUrl}\nClick to switch site.`;
    siteStatusItem.command = 'skycms.switchSite';
    siteStatusItem.show();
  };

  updateSiteStatusBar();

  let authManager: AuthManager;
  const tokenProvider = async (): Promise<string | undefined> => authManager.getToken();
  const queryClient = new SkyCmsQueryClient(getActiveEditorUrl, tokenProvider);
  const commandClient = new SkyCmsCommandClient(getActiveEditorUrl, tokenProvider);
  authManager = new AuthManager(context, queryClient, commandClient, getActiveTokenStorageKey);
  const provider = new SkyCmsTreeProvider(queryClient, async () => authManager.getToken(), siteManager);
  const documentProvider = new SkyCmsDocumentProvider(queryClient);
  const fileSystemProvider = new SkyCmsFileSystemProvider(queryClient, commandClient);

  context.subscriptions.push(
    siteStatusItem,
    vscode.window.registerTreeDataProvider('skycmsExplorer', provider),
    vscode.workspace.registerTextDocumentContentProvider('skycms', documentProvider),
    vscode.workspace.registerFileSystemProvider('skycms-blob', fileSystemProvider, {isCaseSensitive: true}),
    authManager.onAuthStateChanged(async () => { await updateViewContext(); provider.refresh(); }),
    vscode.workspace.onWillSaveTextDocument((event) => {
      if (event.document.uri.scheme !== 'skycms') {
        return;
      }

      event.waitUntil(
        persistDocumentChanges(commandClient, event.document).then(() => []).catch((error) => {
          showError('SkyCMS save failed.', error);
          return [];
        }),
      );
    }),
    vscode.commands.registerCommand('skycms.signIn', async () => {
      try {
        ensureEditorUrlConfigured();
        await authManager.startBrowserSignIn();
      } catch (error) {
        showError('SkyCMS sign-in failed.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.signOut', async () => {
      try {
        await authManager.signOut();
        vscode.window.showInformationMessage(
          activeSite
            ? `Signed out from SkyCMS (${activeSite.name}).`
            : 'Signed out from SkyCMS.',
        );
      } catch (error) {
        showError('SkyCMS sign-out failed.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.addSite', async () => {
      try {
        const site = await promptForNewSite(siteManager);
        if (!site) {
          return;
        }

        activeSite = await siteManager.setActiveSite(site.id);
        updateSiteStatusBar();
        await updateViewContext();
        provider.refresh();
        fileSystemProvider.refresh();
        vscode.window.showInformationMessage(`SkyCMS site "${activeSite.name}" added and selected.`);
      } catch (error) {
        showError('Could not add SkyCMS site.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.switchSite', async () => {
      try {
        const selected = await pickSite(siteManager, 'Select a SkyCMS site');
        if (!selected) {
          return;
        }

        activeSite = await siteManager.setActiveSite(selected.id);
        updateSiteStatusBar();
        await updateViewContext();
        provider.refresh();
        fileSystemProvider.refresh();
        await authManager.validateToken();
        vscode.window.showInformationMessage(`Switched to SkyCMS site "${activeSite.name}"."`);
      } catch (error) {
        showError('Could not switch SkyCMS site.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.removeSite', async () => {
      try {
        const selected = await pickSite(siteManager, 'Select a SkyCMS site to remove');
        if (!selected) {
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          `Remove SkyCMS site "${selected.name}" (${selected.editorUrl})?`,
          { modal: true },
          'Remove',
        );

        if (confirm !== 'Remove') {
          return;
        }

        const tokenKey = siteManager.getTokenSecretKey(selected.id);
        await context.secrets.delete(tokenKey);
        await siteManager.removeSite(selected.id);
        activeSite = await siteManager.getActiveSite();
        updateSiteStatusBar();
        await updateViewContext();

        provider.refresh();
        fileSystemProvider.refresh();
        vscode.window.showInformationMessage(`Removed SkyCMS site "${selected.name}"."`);
      } catch (error) {
        showError('Could not remove SkyCMS site.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.manageSites', async () => {
      try {
        const action = await vscode.window.showQuickPick(
          [
            { label: 'Add Site', value: 'add' },
            { label: 'Switch Site', value: 'switch' },
            { label: 'Remove Site', value: 'remove' },
          ],
          {
            title: 'Manage SkyCMS Sites',
            ignoreFocusOut: true,
          },
        );

        switch (action?.value) {
          case 'add':
            await vscode.commands.executeCommand('skycms.addSite');
            break;
          case 'switch':
            await vscode.commands.executeCommand('skycms.switchSite');
            break;
          case 'remove':
            await vscode.commands.executeCommand('skycms.removeSite');
            break;
          default:
            break;
        }
      } catch (error) {
        showError('Could not manage SkyCMS sites.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.refresh', () => {
      provider.refresh();
    }),
    vscode.commands.registerCommand('skycms.openField', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();
        const fieldNode = assertFieldNode(node);

        if (fieldNode.interactionMode === 'input') {
          await openInputField(fieldNode, queryClient, commandClient);
          provider.refresh();
          return;
        }

        await openDocumentField(fieldNode);
      } catch (error) {
        showError('Could not open SkyCMS field.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.publishArticle', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();
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
        ensureEditorUrlConfigured();
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
    vscode.commands.registerCommand('skycms.newArticle', async () => {
      try {
        ensureEditorUrlConfigured();
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
    vscode.commands.registerCommand('skycms.preview', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();
        const previewNode = assertPreviewNode(node);
        const previewUrl = buildPreviewUrl(previewNode, getActiveEditorUrl());
        const opened = await vscode.env.openExternal(vscode.Uri.parse(previewUrl));

        if (!opened) {
          throw new Error('Could not open browser preview URL.');
        }
      } catch (error) {
        showError('Could not open preview.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.publishLayoutVersion', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();
        const layoutNode = assertLayoutNode(node);
        const confirmed = await vscode.window.showWarningMessage(
          `Publish layout version ${layoutNode.layout!.version} of "${layoutNode.layout!.name}"?`,
          { modal: true },
          'Publish',
        );

        if (confirmed !== 'Publish') {
          return;
        }

        await commandClient.publishLayoutVersion(layoutNode.layout!.layoutNumber, layoutNode.layout!.version);
        provider.refresh();
        vscode.window.showInformationMessage(`Layout version ${layoutNode.layout!.version} published.`);
      } catch (error) {
        showError('Could not publish layout version.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.setDefaultLayoutVersion', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();
        const layoutNode = assertLayoutNode(node);
        const confirmed = await vscode.window.showWarningMessage(
          `Set version ${layoutNode.layout!.version} of "${layoutNode.layout!.name}" as the default layout?`,
          { modal: true },
          'Set Default',
        );

        if (confirmed !== 'Set Default') {
          return;
        }

        await commandClient.setDefaultLayoutVersion(layoutNode.layout!.layoutNumber, layoutNode.layout!.version);
        provider.refresh();
        vscode.window.showInformationMessage(`Layout version ${layoutNode.layout!.version} set as default.`);
      } catch (error) {
        showError('Could not set default layout version.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.duplicateLayoutVersion', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();
        const layoutNode = assertLayoutNode(node);
        const newVersion = await commandClient.duplicateLayoutVersion(layoutNode.layout!.layoutNumber);
        provider.refresh();
        vscode.window.showInformationMessage(
          `Layout version ${newVersion.version} created from "${layoutNode.layout!.name}".`,
        );
      } catch (error) {
        showError('Could not duplicate layout version.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.openFile', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();
        const fileNode = assertFileNode(node);

        if (fileNode.isDir) {
          vscode.window.showErrorMessage('Cannot open a folder as a file.');
          return;
        }

        const uri = fileSystemProvider.pathToUri(fileNode.path!);
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { preview: false });
      } catch (error) {
        showError('Could not open file.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.deleteFile', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();
        const fileNode = assertFileNode(node);
        const confirmed = await vscode.window.showWarningMessage(
          `Delete "${fileNode.label}"? This cannot be undone.`,
          {modal: true},
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
        ensureEditorUrlConfigured();
        const folderNode = assertFileNode(node);
        const confirmed = await vscode.window.showWarningMessage(
          `Delete folder "${folderNode.label}" and all its contents? This cannot be undone.`,
          {modal: true},
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
        ensureEditorUrlConfigured();
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
        ensureEditorUrlConfigured();
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

  if (getActiveEditorUrl()) {
    try {
      await authManager.validateToken();
    } catch (error) {
      showError('SkyCMS token validation failed.', error);
    }
  }

  updateSiteStatusBar();
  provider.refresh();
}

export function assertFieldNode(node: unknown): SkyCmsNode {
  if (!node || typeof node !== 'object') {
    throw new Error('Invalid field node payload.');
  }

  const typedNode = node as SkyCmsNode;

  if (typedNode.kind !== 'field' || !typedNode.entityType || !typedNode.entityId || !typedNode.fieldKey) {
    throw new Error('Invalid SkyCMS field node.');
  }

  return typedNode;
}

export function assertArticleNode(node: unknown): SkyCmsNode {
  if (!node || typeof node !== 'object') {
    throw new Error('Invalid article node payload.');
  }

  const typedNode = node as SkyCmsNode;

  if (typedNode.kind !== 'article' || !typedNode.article) {
    throw new Error('Invalid SkyCMS article node.');
  }

  return typedNode;
}

export function assertLayoutNode(node: unknown): SkyCmsNode {
  if (!node || typeof node !== 'object') {
    throw new Error('Invalid layout node payload.');
  }

  const typedNode = node as SkyCmsNode;

  if (typedNode.kind !== 'layout' || !typedNode.layout) {
    throw new Error('Invalid SkyCMS layout node.');
  }

  return typedNode;
}

export function assertTemplateNode(node: unknown): SkyCmsNode {
  if (!node || typeof node !== 'object') {
    throw new Error('Invalid template node payload.');
  }

  const typedNode = node as SkyCmsNode;

  if (typedNode.kind !== 'template' || !typedNode.template) {
    throw new Error('Invalid SkyCMS template node.');
  }

  return typedNode;
}

export function assertBlogPostNode(node: unknown): SkyCmsNode {
  if (!node || typeof node !== 'object') {
    throw new Error('Invalid blog post node payload.');
  }

  const typedNode = node as SkyCmsNode;

  if (typedNode.kind !== 'blog-post' || !typedNode.blogPost) {
    throw new Error('Invalid SkyCMS blog post node.');
  }

  return typedNode;
}

export function assertPreviewNode(node: unknown): SkyCmsNode {
  if (!node || typeof node !== 'object') {
    throw new Error('Invalid preview node payload.');
  }

  const typedNode = node as SkyCmsNode;

  if (typedNode.kind === 'article' && typedNode.article) {
    return typedNode;
  }

  if (typedNode.kind === 'blog-post' && typedNode.blogPost) {
    return typedNode;
  }

  if (typedNode.kind === 'blog' && typedNode.blog) {
    return typedNode;
  }

  if (typedNode.kind === 'layout' && typedNode.layout) {
    return typedNode;
  }

  if (typedNode.kind === 'template' && typedNode.template) {
    return typedNode;
  }

  throw new Error('This node type does not support preview.');
}

export function assertFileNode(node: unknown): SkyCmsNode {
  if (!node || typeof node !== 'object') {
    throw new Error('Invalid file node payload.');
  }

  const typedNode = node as SkyCmsNode;

  if ((typedNode.kind !== 'file' && typedNode.kind !== 'folder') || !typedNode.path) {
    throw new Error('Invalid SkyCMS file node.');
  }

  return typedNode;
}

async function openDocumentField(node: SkyCmsNode): Promise<void> {
  const uri = buildFieldUri({
    entityType: node.entityType!,
    entityId: node.entityId!,
    fieldKey: node.fieldKey!,
  });

  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.languages.setTextDocumentLanguage(document, getLanguageForField(node.fieldKey!));
  await vscode.window.showTextDocument(document, { preview: false });
}

async function openInputField(
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

async function persistDocumentChanges(
  commandClient: SkyCmsCommandClient,
  document: vscode.TextDocument,
): Promise<void> {
  const reference = parseFieldUri(document.uri);
  const content = document.getText();
  const validationError = validateDocumentContent(reference.fieldKey, content);

  if (validationError) {
    throw new Error(validationError);
  }

  await commandClient.setDocumentFieldContent(
    reference.entityType,
    reference.entityId,
    reference.fieldKey,
    content,
  );
}

function getConfiguredEditorUrl(): string {
  return vscode.workspace.getConfiguration('skycms').get<string>('editorUrl', '').trim();
}

function buildPreviewUrl(node: SkyCmsNode, editorBaseUrl: string): string {
  const base = new URL(editorBaseUrl);
  const preview = new URL('/Home/Index', base);

  switch (node.kind) {
    case 'article': {
      const article = node.article;
      if (!article?.id) {
        throw new Error('This article is missing a preview ID. Refresh the tree and try again.');
      }

      preview.searchParams.set('previewType', 'editor');
      preview.searchParams.set('itemId', article.id);
      preview.searchParams.set('editorUrl', new URL(`/Editor/VisualEditor/${article.articleNumber}`, base).toString());
      return preview.toString();
    }

    case 'blog-post': {
      const post = node.blogPost;
      if (!post?.id) {
        throw new Error('This blog post is missing a preview ID. Refresh the tree and try again.');
      }

      preview.searchParams.set('previewType', 'editor');
      preview.searchParams.set('itemId', post.id);
      preview.searchParams.set('editorUrl', new URL(`/Editor/VisualEditor/${post.articleNumber}`, base).toString());
      return preview.toString();
    }

    case 'blog': {
      const blogKey = node.blog?.blogKey;
      if (!blogKey) {
        throw new Error('This blog is missing a blog key. Refresh the tree and try again.');
      }

      return new URL(`/editor/blogs/${encodeURIComponent(blogKey)}/preview`, base).toString();
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

async function promptForNewSite(siteManager: SiteManager): Promise<SkyCmsSiteProfile | undefined> {
  const editorUrl = await vscode.window.showInputBox({
    title: 'Add SkyCMS Site',
    prompt: 'Enter the SkyCMS editor base URL (for example https://editor.example.com).',
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim().length === 0 ? 'Editor URL is required.' : undefined),
  });

  if (!editorUrl) {
    return undefined;
  }

  const suggestedName = (() => {
    try {
      return new URL(editorUrl).host;
    } catch {
      return '';
    }
  })();

  const displayName = await vscode.window.showInputBox({
    title: 'Site Name',
    prompt: 'Enter a display name for this site (optional).',
    value: suggestedName,
    ignoreFocusOut: true,
  });

  return siteManager.addSite(editorUrl, displayName?.trim());
}

async function pickSite(
  siteManager: SiteManager,
  title: string,
): Promise<SkyCmsSiteProfile | undefined> {
  const sites = await siteManager.getSites();
  if (sites.length === 0) {
    vscode.window.showWarningMessage('No SkyCMS sites are configured. Run "SkyCMS: Add Site" first.');
    return undefined;
  }

  const selected = await vscode.window.showQuickPick(
    sites.map((site) => ({
      label: site.name,
      description: site.editorUrl,
      detail: site.isDefault ? 'Default site' : undefined,
      site,
    })),
    {
      title,
      ignoreFocusOut: true,
    },
  );

  return selected?.site;
}

export function showError(prefix: string, error: unknown): void {
  if (error instanceof HttpError) {
    vscode.window.showErrorMessage(`${prefix} HTTP ${error.status}.`);
    return;
  }

  if (error instanceof Error) {
    vscode.window.showErrorMessage(`${prefix} ${error.message}`);
    return;
  }

  vscode.window.showErrorMessage(prefix);
}
