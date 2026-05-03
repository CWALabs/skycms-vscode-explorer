
import * as vscode from 'vscode';
import { AuthManager } from './authManager';
import { SkyCmsCommandClient } from './apiClient/commands';
import { SkyCmsQueryClient } from './apiClient/queries';
import { SkyCmsNode, SkyCmsTreeProvider } from './treeProvider';
import { HttpError } from './apiClient/http';
import { SkyCmsDocumentProvider } from './documentProvider';
import { SkyCmsFileSystemProvider } from './fileSystemProvider';
import { buildFieldUri, getLanguageForField, parseFieldUri } from './uriUtils';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const editorUrl = getEditorUrl();

  if (!editorUrl) {
    vscode.window.showWarningMessage(
      'SkyCMS editor URL is not configured. Set skycms.editorUrl in VS Code settings before signing in.',
    );
  }

  let authManager: AuthManager;
  const tokenProvider = async (): Promise<string | undefined> => authManager.getToken();
  const queryClient = new SkyCmsQueryClient(editorUrl, tokenProvider);
  const commandClient = new SkyCmsCommandClient(editorUrl, tokenProvider);
  authManager = new AuthManager(context, queryClient, commandClient);
  const provider = new SkyCmsTreeProvider(queryClient, async () => authManager.getToken());
  const documentProvider = new SkyCmsDocumentProvider(queryClient);
  const fileSystemProvider = new SkyCmsFileSystemProvider(queryClient, commandClient);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('skycmsExplorer', provider),
    vscode.workspace.registerTextDocumentContentProvider('skycms', documentProvider),
    vscode.workspace.registerFileSystemProvider('skycms-blob', fileSystemProvider, {isCaseSensitive: true}),
    authManager.onAuthStateChanged(() => provider.refresh()),
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
        vscode.window.showInformationMessage('Signed out from SkyCMS.');
      } catch (error) {
        showError('SkyCMS sign-out failed.', error);
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

  if (editorUrl) {
    try {
      await authManager.validateToken();
    } catch (error) {
      showError('SkyCMS token validation failed.', error);
    }
  }

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

function getEditorUrl(): string {
  return vscode.workspace.getConfiguration('skycms').get<string>('editorUrl', '').trim();
}

function ensureEditorUrlConfigured(): void {
  if (getEditorUrl()) {
    return;
  }

  throw new Error('Missing skycms.editorUrl configuration value.');
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
