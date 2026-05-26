import * as vscode from 'vscode';
import { AuthManager } from './authManager';
import { SkyCmsCommandClient } from './apiClient/commands';
import { SkyCmsQueryClient } from './apiClient/queries';
import { SkyCmsFieldFileSystemProvider } from './fieldFileSystemProvider';
import { SkyCmsFileSystemProvider } from './fileSystemProvider';
import { SkyCmsNode, SkyCmsTreeProvider } from './treeProvider';
import { SiteManager, SkyCmsSiteProfile } from './siteManager';
import { ErrorHandler } from './errorHandler';
import { initializeLogging, logError, logInfo } from './log';
import { registerWebHostCommandDriver } from './webHostCommandDriver';
import { findSkyCmsContentSearchResults, type SkyCmsContentSearchResult } from './contentSearch';
import {
  getFieldReferenceFromFieldNode,
  isPreviewCapableNode,
  resolvePreviewNodeFromFieldReference,
  tryParseFieldReferenceFromUri,
} from './previewContext';
import {
  addRecentContentShortcut,
  clearInvalidShortcuts,
  getContentShortcutPicks,
  isShortcutEligibleNode,
  togglePinnedContentShortcut,
} from './contentShortcuts';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  initializeLogging(context);
  logInfo('Web-host activation started');

  const siteManager = new SiteManager(context);
  await siteManager.ensureInitialized(getConfiguredEditorUrl());

  let activeSite = await siteManager.getActiveSite();
  let hasTreeFilter = false;

  const getActiveEditorUrl = (): string => activeSite?.editorUrl ?? '';
  const getActiveTokenStorageKey = (): string | undefined =>
    activeSite ? siteManager.getTokenSecretKey(activeSite.id) : undefined;

  const updateViewContext = async (): Promise<void> => {
    const site = await siteManager.getActiveSite();
    await vscode.commands.executeCommand('setContext', 'skycms.hasSite', !!site);
    const token = site ? await context.secrets.get(siteManager.getTokenSecretKey(site.id)) : undefined;
    await vscode.commands.executeCommand('setContext', 'skycms.isSignedIn', !!token);
    await vscode.commands.executeCommand('setContext', 'skycms.hasTreeFilter', hasTreeFilter);
  };

  await updateViewContext();
  await clearInvalidShortcuts(context);

  const tokenProvider = async (): Promise<string | undefined> => {
    const tokenKey = getActiveTokenStorageKey();
    return tokenKey ? context.secrets.get(tokenKey) : undefined;
  };

  const queryClient = new SkyCmsQueryClient(getActiveEditorUrl, tokenProvider);
  const commandClient = new SkyCmsCommandClient(getActiveEditorUrl, tokenProvider);
  const authManager = new AuthManager(context, queryClient, commandClient, getActiveTokenStorageKey, siteManager);
  const provider = new SkyCmsTreeProvider(queryClient, tokenProvider, siteManager, authManager);
  const fieldFileSystemProvider = new SkyCmsFieldFileSystemProvider(queryClient, commandClient);
  const fileSystemProvider = new SkyCmsFileSystemProvider(queryClient, commandClient);
  const treeView = vscode.window.createTreeView('skycmsExplorer', { treeDataProvider: provider });
  logInfo('SkyCMS web-host tree view created');

  const ensureSiteConfigured = (): void => {
    if (getActiveEditorUrl()) {
      return;
    }

    throw new Error('No SkyCMS site is configured. Run "SkyCMS: Add Site" first.');
  };

  context.subscriptions.push(
    treeView,
    vscode.workspace.registerFileSystemProvider('skycms', fieldFileSystemProvider, {isCaseSensitive: true}),
    vscode.workspace.registerFileSystemProvider('skycms-blob', fileSystemProvider, {isCaseSensitive: true}),
    authManager.onAuthStateChanged(async () => {
      await updateViewContext();
      activeSite = await siteManager.getActiveSite();
      provider.refresh();
      fileSystemProvider.refresh();
    }),
    vscode.window.registerUriHandler({ handleUri: (uri) => { void authManager.handleAuthCallback(uri); } }),
    vscode.commands.registerCommand('skycms.refresh', () => {
      provider.refresh();
    }),
    vscode.commands.registerCommand('skycms.signIn', async () => {
      try {
        ensureSiteConfigured();
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
        await updateViewContext();
        provider.refresh();
        fileSystemProvider.refresh();
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
        await updateViewContext();
        provider.refresh();
        fileSystemProvider.refresh();

        await authManager.validateToken();
        vscode.window.showInformationMessage(`Switched to SkyCMS site "${activeSite.name}".`);
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

        await context.secrets.delete(siteManager.getTokenSecretKey(selected.id));
        await siteManager.removeSite(selected.id);
        activeSite = await siteManager.getActiveSite();
        await updateViewContext();
        provider.refresh();
        fileSystemProvider.refresh();
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

        if (action?.value === 'add') {
          await vscode.commands.executeCommand('skycms.addSite');
        } else if (action?.value === 'switch') {
          await vscode.commands.executeCommand('skycms.switchSite');
        } else if (action?.value === 'remove') {
          await vscode.commands.executeCommand('skycms.removeSite');
        }
      } catch (error) {
        showError('Could not manage SkyCMS sites.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.openEditorSite', async () => {
      try {
        ensureSiteConfigured();
        await vscode.env.openExternal(vscode.Uri.parse(getActiveEditorUrl()));
      } catch (error) {
        showError('Could not open SkyCMS editor URL.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.openPublicSite', async () => {
      try {
        const site = await siteManager.getActiveSite();
        if (!site?.publicUrl) {
          vscode.window.showInformationMessage('Public URL is not available. Sign in again to retrieve it.');
          return;
        }

        await vscode.env.openExternal(vscode.Uri.parse(site.publicUrl));
      } catch (error) {
        showError('Could not open public URL.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.openDocs', async () => {
      await vscode.env.openExternal(vscode.Uri.parse('https://docs.sky-cms.com/'));
    }),
    vscode.commands.registerCommand('skycms.showRootMenu', async () => {
      try {
        const items: Array<vscode.QuickPickItem & { cmd: string }> = [
          { label: '$(globe) Open Public Site', description: 'View the live public website', cmd: 'skycms.openPublicSite' },
          { label: '$(globe) Open Editor', description: 'Open the SkyCMS editor in a browser', cmd: 'skycms.openEditorSite' },
          { label: '$(preview) Preview Current Context', description: 'Preview selected content or active SkyCMS field tab', cmd: 'skycms.previewCurrent' },
          { label: '$(search) Search Content', description: 'Find layouts, templates, articles, and files', cmd: 'skycms.searchContent' },
          { label: '$(history) Recent and Pinned', description: 'Quick access to recently opened or pinned content', cmd: 'skycms.openRecentContent' },
          { label: '$(filter) Filter Explorer', description: 'Narrow what appears in the tree', cmd: 'skycms.filterTree' },
          { label: '$(clear-all) Clear Explorer Filter', description: 'Show all tree items again', cmd: 'skycms.clearTreeFilter' },
          { label: '$(trash) Restore Deleted Article', description: 'Bring a deleted article back into the explorer workflow', cmd: 'skycms.restoreArticle' },
          { label: '$(comment-discussion) Ask SkyCMS', description: 'Start a chat with the SkyCMS assistant', cmd: 'skycms.askSkyCms' },
          { label: '$(book) Documentation', description: 'Open SkyCMS documentation', cmd: 'skycms.openDocs' },
        ];
        const picked = await vscode.window.showQuickPick(items, {
          title: 'SkyCMS Website Actions',
          placeHolder: 'Select an action',
        });

        if (picked) {
          await vscode.commands.executeCommand(picked.cmd);
        }
      } catch (error) {
        showError('Could not open site menu.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.openLayoutsDocs', async () => {
      await vscode.env.openExternal(vscode.Uri.parse('https://docs.sky-cms.com/layouts'));
    }),
    vscode.commands.registerCommand('skycms.openTemplatesDocs', async () => {
      await vscode.env.openExternal(vscode.Uri.parse('https://docs.sky-cms.com/templates'));
    }),
    vscode.commands.registerCommand('skycms.openArticlesDocs', async () => {
      await vscode.env.openExternal(vscode.Uri.parse('https://docs.sky-cms.com/articles'));
    }),
    vscode.commands.registerCommand('skycms.openBlogsDocs', async () => {
      await vscode.env.openExternal(vscode.Uri.parse('https://docs.sky-cms.com/blogs'));
    }),
    vscode.commands.registerCommand('skycms.openFilesDocs', async () => {
      await vscode.env.openExternal(vscode.Uri.parse('https://docs.sky-cms.com/files'));
    }),
    vscode.commands.registerCommand('skycms.askSkyCms', async () => {
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          query: '@skycms ',
          isPartialQuery: true,
        });
      } catch (error) {
        showError('Could not open SkyCMS chat.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.searchContent', async () => {
      try {
        ensureSiteConfigured();
        const scope = await vscode.window.showQuickPick(
          [
            { label: 'All Content', description: 'Search layouts, templates, articles, and files', value: 'all' as const },
            { label: 'Layouts', description: 'Search layout names and descriptions', value: 'layouts' as const },
            { label: 'Page Templates', description: 'Search template names and linked layouts', value: 'templates' as const },
            { label: 'Articles', description: 'Search article titles and blog posts', value: 'articles' as const },
            { label: 'Files', description: 'Search files and folders in /pub', value: 'files' as const },
          ],
          {
            title: 'Search SkyCMS Content',
            placeHolder: 'Choose a content scope to search',
          },
        );

        if (!scope) {
          return;
        }

        const query = await vscode.window.showInputBox({
          title: 'Search SkyCMS Content',
          prompt: `Search ${scope.label.toLowerCase()}`,
          ignoreFocusOut: true,
          validateInput: (value) => (value.trim().length === 0 ? 'Enter a search term.' : undefined),
        });

        if (!query?.trim()) {
          return;
        }

        const results = await findSkyCmsContentSearchResults(queryClient, {
          query,
          scope: scope.value,
          limit: 20,
        });

        if (results.length === 0) {
          vscode.window.showInformationMessage(`No SkyCMS content matched "${query.trim()}".`);
          return;
        }

        const picked = await vscode.window.showQuickPick(
          results.map((result) => ({
            label: result.label,
            description: result.description ?? (result.kind === 'folder' ? 'Folder' : result.kind === 'file' ? 'File' : 'Content'),
            result,
          })),
          {
            title: `Search results for "${query.trim()}"`,
            placeHolder: 'Select a result to open',
            matchOnDescription: true,
          },
        );

        if (!picked) {
          return;
        }

        const actionOptions = getSearchResultActionOptions(picked.result);
        const action = await vscode.window.showQuickPick(actionOptions, {
          title: `${picked.result.label}`,
          placeHolder: 'Choose what to do with this result',
        });

        if (!action) {
          return;
        }

        if (action.command === 'skycms.togglePinnedContent') {
          await vscode.commands.executeCommand(action.command, picked.result.node);
          return;
        }

        if (isShortcutEligibleNode(picked.result.node)) {
          await addRecentContentShortcut(context, picked.result.node, {
            label: picked.result.label,
            description: picked.result.description,
          });
        }

        await vscode.commands.executeCommand(action.command, picked.result.node);
      } catch (error) {
        showError('Could not search SkyCMS content.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.previewCurrent', async () => {
      try {
        ensureSiteConfigured();

        const selectedNode = treeView.selection?.[0];
        let previewNode: SkyCmsNode | undefined;

        if (isPreviewCapableNode(selectedNode)) {
          previewNode = selectedNode as SkyCmsNode;
        } else if (selectedNode && selectedNode.kind === 'field') {
          const fieldReference = getFieldReferenceFromFieldNode(selectedNode);
          if (fieldReference) {
            previewNode = await resolvePreviewNodeFromFieldReference(queryClient, fieldReference);
          }
        }

        if (!previewNode) {
          const activeUri = vscode.window.activeTextEditor?.document?.uri;
          const fieldReference = activeUri ? tryParseFieldReferenceFromUri(activeUri) : undefined;
          if (fieldReference) {
            previewNode = await resolvePreviewNodeFromFieldReference(queryClient, fieldReference);
          }
        }

        if (!previewNode) {
          vscode.window.showInformationMessage('Select a layout, template, article, or open a SkyCMS field tab to preview.');
          return;
        }

        await vscode.commands.executeCommand('skycms.preview', previewNode);
      } catch (error) {
        showError('Could not resolve preview target.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.openRecentContent', async () => {
      try {
        ensureSiteConfigured();
        const picks = getContentShortcutPicks(context);
        if (picks.length === 0) {
          vscode.window.showInformationMessage('No recent or pinned SkyCMS content yet. Use Search Content to add history.');
          return;
        }

        const selected = await vscode.window.showQuickPick(
          picks.map((item) => ({
            label: item.label,
            description: item.source === 'pinned' ? 'Pinned' : 'Recent',
            detail: item.description,
            item,
          })),
          {
            title: 'Recent and Pinned SkyCMS Content',
            placeHolder: 'Select content to open',
            matchOnDescription: true,
            matchOnDetail: true,
          },
        );

        if (!selected) {
          return;
        }

        const node = selected.item.node as unknown as SkyCmsNode;
        const command = getDefaultShortcutCommand(node);
        if (!command) {
          vscode.window.showWarningMessage('This shortcut can no longer be opened. Re-add it from search results.');
          return;
        }

        if (isShortcutEligibleNode(node)) {
          await addRecentContentShortcut(context, node, {
            label: selected.item.label,
            description: selected.item.description,
          });
        }

        await vscode.commands.executeCommand(command, node);
      } catch (error) {
        showError('Could not open recent content.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.togglePinnedContent', async (node: unknown) => {
      try {
        if (!isShortcutEligibleNode(node)) {
          vscode.window.showErrorMessage('Pinning is only available for layouts, templates, articles, and files.');
          return;
        }

        const isPinned = await togglePinnedContentShortcut(context, node, {
          label: String(node.label),
          description: typeof node.description === 'string' ? node.description : undefined,
        });

        vscode.window.showInformationMessage(
          isPinned
            ? `Pinned "${String(node.label)}" for quick access.`
            : `Unpinned "${String(node.label)}".`,
        );
      } catch (error) {
        showError('Could not update pinned content.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.filterTree', async () => {
      try {
        ensureSiteConfigured();
        const scope = await vscode.window.showQuickPick(
          [
            { label: 'All Explorer Content', value: 'all' as const },
            { label: 'Layouts Only', value: 'layouts' as const },
            { label: 'Page Templates Only', value: 'templates' as const },
            { label: 'Articles Only', value: 'articles' as const },
            { label: 'Files Only', value: 'files' as const },
          ],
          {
            title: 'Filter SkyCMS Explorer',
            placeHolder: 'Choose which area to filter',
          },
        );

        if (!scope) {
          return;
        }

        const query = await vscode.window.showInputBox({
          title: 'Filter SkyCMS Explorer',
          prompt: 'Show items containing...',
          ignoreFocusOut: true,
          validateInput: (value) => (value.trim().length === 0 ? 'Enter a filter value.' : undefined),
        });

        if (!query?.trim()) {
          return;
        }

        provider.setContentFilter(query, scope.value);
        hasTreeFilter = true;
        await vscode.commands.executeCommand('setContext', 'skycms.hasTreeFilter', true);
        vscode.window.showInformationMessage(`Explorer filter applied: "${query.trim()}" (${scope.label}).`);
      } catch (error) {
        showError('Could not filter SkyCMS explorer.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.clearTreeFilter', async () => {
      provider.clearContentFilter();
      hasTreeFilter = false;
      await vscode.commands.executeCommand('setContext', 'skycms.hasTreeFilter', false);
      vscode.window.showInformationMessage('Explorer filter cleared.');
    }),
  );

  registerWebHostCommandDriver(context, {
    queryClient,
    commandClient,
    provider,
    fileSystemProvider,
    getActiveEditorUrl,
    getActivePublicUrl: async () => {
      const site = await siteManager.getActiveSite();
      return site?.publicUrl;
    },
    ensureSiteConfigured,
    showError,
  });

  if (getActiveEditorUrl()) {
    try {
      await authManager.promptReauthIfNeeded();
    } catch (error) {
      showError('SkyCMS token validation failed.', error);
    }
  }

  provider.refresh();
}

export function deactivate(): void {
  // No-op.
}

function getConfiguredEditorUrl(): string {
  return vscode.workspace.getConfiguration('skycms').get<string>('editorUrl', '').trim();
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

async function pickSite(siteManager: SiteManager, title: string): Promise<SkyCmsSiteProfile | undefined> {
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

function showError(prefix: string, error: unknown): void {
  const errorInfo = ErrorHandler.classifyError(error);
  const message = ErrorHandler.formatMessage(prefix, errorInfo);

  logError(`${prefix} [${errorInfo.classification}]`, error);
  const suggestion = ErrorHandler.getSuggestion(errorInfo);

  if (suggestion) {
    vscode.window.showErrorMessage(`${message}\n\n${suggestion}`);
    return;
  }

  vscode.window.showErrorMessage(message);
}

function getSearchResultActionOptions(
  result: SkyCmsContentSearchResult,
): Array<vscode.QuickPickItem & { command: string }> {
  if (result.kind === 'file') {
    return [
      { label: 'Open', description: 'Open file in editor', command: 'skycms.openFile' },
      { label: 'Preview Draft', description: 'Open a browser preview', command: 'skycms.preview' },
      { label: 'Add to Chat', description: 'Open chat with this file context', command: 'skycms.addToChat' },
      { label: 'Pin / Unpin', description: 'Toggle quick access in recent and pinned list', command: 'skycms.togglePinnedContent' },
    ];
  }

  if (result.kind === 'folder') {
    return [
      { label: 'Open in File Manager', description: 'Open folder in SkyCMS file manager', command: 'skycms.openFileManager' },
      { label: 'Add to Chat', description: 'Open chat with this folder context', command: 'skycms.addToChat' },
      { label: 'Pin / Unpin', description: 'Toggle quick access in recent and pinned list', command: 'skycms.togglePinnedContent' },
    ];
  }

  if (result.kind === 'article' || result.kind === 'blog-stream') {
    return [
      { label: 'Preview Draft', description: 'Open live draft preview in browser', command: 'skycms.preview' },
      { label: 'Open on Public Site', description: 'Open public URL if published', command: 'skycms.openArticleOnPublicSite' },
      { label: 'Add to Chat', description: 'Open chat with this article context', command: 'skycms.addToChat' },
      { label: 'Pin / Unpin', description: 'Toggle quick access in recent and pinned list', command: 'skycms.togglePinnedContent' },
    ];
  }

  return [
    { label: 'Preview Draft', description: 'Open preview in browser', command: 'skycms.preview' },
    { label: 'Add to Chat', description: 'Open chat with this content context', command: 'skycms.addToChat' },
    { label: 'Pin / Unpin', description: 'Toggle quick access in recent and pinned list', command: 'skycms.togglePinnedContent' },
  ];
}

function getDefaultShortcutCommand(node: SkyCmsNode): string | undefined {
  switch (node.kind) {
    case 'file':
      return 'skycms.openFile';
    case 'folder':
      return 'skycms.openFileManager';
    case 'layout':
    case 'layout-version':
    case 'template':
    case 'article':
    case 'blog-stream':
      return 'skycms.preview';
    default:
      return undefined;
  }
}
