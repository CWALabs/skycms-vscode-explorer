
import * as vscode from 'vscode';
import { AuthManager } from './authManager';
import { SkyCmsCommandClient } from './apiClient/commands';
import { SkyCmsQueryClient } from './apiClient/queries';
import { SkyCmsNode, SkyCmsTreeProvider } from './treeProvider';
import { HttpError } from './apiClient/http';
import { SkyCmsFieldFileSystemProvider } from './fieldFileSystemProvider';
import { SkyCmsFileSystemProvider, SKYCMS_PROTECTED_PATHS, SKYCMS_READ_ONLY_FILES } from './fileSystemProvider';
import { SkyCmsDragAndDropController } from './dragAndDropController';
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
import { SiteManager, SkyCmsSiteProfile } from './siteManager';
import {
  buildFieldUri,
  getExtensionForField,
  getLanguageForField,
  getLanguageForMimeType,
  getLanguageForPath,
  validateDocumentContent,
} from './uriUtils';
export { validateDocumentContent } from './uriUtils';
import { registerSkyCmsChatParticipant } from './chatParticipant';
import { initializeLogging, logInfo, logError } from './log';
import { ErrorHandler } from './errorHandler';

/** Discriminated union representing an item that has been Cut or Copied. */
interface NodeClipboard {
  node: SkyCmsNode;
  operation: 'cut' | 'copy';
}

/** Tracks a node that has been Cut or Copied, waiting to be placed on next Paste. */
let nodeClipboard: NodeClipboard | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  initializeLogging(context);
  logInfo('Extension activation started');
  const siteManager = new SiteManager(context);
  await siteManager.ensureInitialized(getConfiguredEditorUrl());

  let activeSite = await siteManager.getActiveSite();
  let hasTreeFilter = false;

  const updateViewContext = async (): Promise<void> => {
    const site = await siteManager.getActiveSite();
    await vscode.commands.executeCommand('setContext', 'skycms.hasSite', !!site);
    const token = site ? await context.secrets.get(siteManager.getTokenSecretKey(site.id)) : undefined;
    await vscode.commands.executeCommand('setContext', 'skycms.isSignedIn', !!token);
    await vscode.commands.executeCommand('setContext', 'skycms.hasTreeFilter', hasTreeFilter);
  };

  await updateViewContext();
  await clearInvalidShortcuts(context);

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
  let activeBusyOperations = 0;
  let busyMessage = '';

  const updateSiteStatusBar = (): void => {
    if (activeBusyOperations > 0) {
      const siteName = activeSite?.websiteTitle || activeSite?.name || 'No Site';
      const suffix = busyMessage ? ` (${busyMessage})` : '';
      siteStatusItem.text = `$(sync~spin) SkyCMS: ${siteName}${suffix}`;
      siteStatusItem.tooltip = 'SkyCMS Explorer is waiting for the editor to respond.';
      siteStatusItem.command = 'skycms.manageSites';
      siteStatusItem.show();
      return;
    }

    if (!activeSite) {
      siteStatusItem.text = '$(globe) SkyCMS: Add Site';
      siteStatusItem.tooltip = 'No SkyCMS site configured. Click to switch site or run SkyCMS: Add Site.';
      siteStatusItem.command = 'skycms.manageSites';
      siteStatusItem.show();
      return;
    }

    siteStatusItem.text = `$(globe) SkyCMS: ${activeSite.websiteTitle || activeSite.name}`;
    siteStatusItem.tooltip = `${activeSite.editorUrl}\nClick to switch site.`;
    siteStatusItem.command = 'skycms.switchSite';
    siteStatusItem.show();
  };

  updateSiteStatusBar();

  const withBusyIndicator = async <T>(message: string, action: () => Promise<T>): Promise<T> => {
    activeBusyOperations += 1;
    busyMessage = message;
    updateSiteStatusBar();

    try {
      return await action();
    } finally {
      activeBusyOperations = Math.max(0, activeBusyOperations - 1);
      if (activeBusyOperations === 0) {
        busyMessage = '';
      }
      updateSiteStatusBar();
    }
  };

  let authManager: AuthManager;
  const tokenProvider = async (): Promise<string | undefined> => authManager.getToken();
  const queryClient = new SkyCmsQueryClient(getActiveEditorUrl, tokenProvider);
  const commandClient = new SkyCmsCommandClient(getActiveEditorUrl, tokenProvider);
  authManager = new AuthManager(context, queryClient, commandClient, getActiveTokenStorageKey, siteManager);
  const provider = new SkyCmsTreeProvider(queryClient, async () => authManager.getToken(), siteManager, authManager);
  const fieldFileSystemProvider = new SkyCmsFieldFileSystemProvider(queryClient, commandClient);
  const fileSystemProvider = new SkyCmsFileSystemProvider(queryClient, commandClient);
  const dragAndDropController = new SkyCmsDragAndDropController(commandClient, () => {
    provider.refresh();
    fileSystemProvider.refresh();
  });
  const treeView = vscode.window.createTreeView('skycmsExplorer', {
    treeDataProvider: provider,
    dragAndDropController,
  });
  logInfo('SkyCMS tree view created');

  registerSkyCmsChatParticipant(context, () => activeSite);

  const openFieldFromSelection = async (selection: readonly unknown[]): Promise<void> => {
    const selected = selection[0] as SkyCmsNode | undefined;
    if (!selected || selected.kind !== 'field' || selected.interactionMode !== 'doc') {
      return;
    }

    try {
      await openDocumentField(selected, activeSite?.name);
    } catch (error) {
      showError('Could not open SkyCMS field.', error);
    }
  };

  context.subscriptions.push(
    siteStatusItem,
    treeView,
    treeView.onDidChangeSelection((event) => {
      void openFieldFromSelection(event.selection);
    }),
    vscode.workspace.registerFileSystemProvider('skycms', fieldFileSystemProvider, {isCaseSensitive: true}),
    vscode.workspace.registerFileSystemProvider('skycms-blob', fileSystemProvider, {isCaseSensitive: true}),
    vscode.window.registerUriHandler({ handleUri: (uri) => { void authManager.handleAuthCallback(uri); } }),
    authManager.onAuthStateChanged(async () => { await updateViewContext(); provider.refresh(); }),
    vscode.commands.registerCommand('skycms.signIn', async () => {
      try {
        ensureEditorUrlConfigured();
        await withBusyIndicator('Signing in', () => authManager.startBrowserSignIn());
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
        // Immediately start sign-in so the user doesn't have to click a second button.
        await vscode.commands.executeCommand('skycms.signIn');
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
        await withBusyIndicator('Connecting', () => authManager.validateToken());
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
      vscode.commands.registerCommand('skycms.openEditorSite', async () => {
        try {
          ensureEditorUrlConfigured();
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
        ensureEditorUrlConfigured();

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

        const results = await withBusyIndicator('Searching content', () =>
          findSkyCmsContentSearchResults(queryClient, {
            query,
            scope: scope.value,
            limit: 20,
          }),
        );

        if (results.length === 0) {
          vscode.window.showInformationMessage(`No SkyCMS content matched "${query.trim()}".`);
          return;
        }

        const picked = await vscode.window.showQuickPick(
          results.map((result) => ({
            label: result.label,
            description:
              result.description ??
              (result.kind === 'folder'
                ? 'Folder'
                : result.kind === 'file'
                  ? 'File'
                  : result.kind === 'layout'
                    ? 'Layout'
                    : result.kind === 'template'
                      ? 'Template'
                      : 'Content'),
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

        const result = picked.result;
        const actionOptions = getSearchResultActionOptions(result);
        const action = await vscode.window.showQuickPick(actionOptions, {
          title: `${result.label}`,
          placeHolder: 'Choose what to do with this result',
        });

        if (!action) {
          return;
        }

        if (action.command === 'skycms.togglePinnedContent') {
          await vscode.commands.executeCommand(action.command, result.node);
          return;
        }

        if (isShortcutEligibleNode(result.node)) {
          await addRecentContentShortcut(context, result.node, {
            label: result.label,
            description: result.description,
          });
        }

        await vscode.commands.executeCommand(action.command, result.node);
      } catch (error) {
        showError('Could not search SkyCMS content.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.openRecentContent', async () => {
      try {
        ensureEditorUrlConfigured();
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
        ensureEditorUrlConfigured();

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
          prompt: `Show items containing...`,
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
    vscode.commands.registerCommand('skycms.openField', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();
        const fieldNode = assertFieldNode(node);

        if (fieldNode.isReadOnly) {
          await openDocumentField(fieldNode, activeSite?.name);
          return;
        }

        if (fieldNode.interactionMode === 'input') {
          await openInputField(fieldNode, queryClient, commandClient);
          provider.refresh();
          return;
        }

        await openDocumentField(fieldNode, activeSite?.name);
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

        await withBusyIndicator('Publishing article', () =>
          commandClient.publishArticle(articleNode.article!.articleNumber),
        );
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

        await withBusyIndicator('Unpublishing article', () =>
          commandClient.unpublishArticle(articleNode.article!.articleNumber),
        );
        provider.refresh();
        vscode.window.showInformationMessage(`"${articleNode.article!.title}" moved back to drafts.`);
      } catch (error) {
        showError('Could not unpublish article.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.restoreArticle', async () => {
      try {
        ensureEditorUrlConfigured();
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
        await withBusyIndicator('Restoring article', () => commandClient.restoreArticle(articleNumber));
        provider.refresh();
        vscode.window.showInformationMessage(`Article #${articleNumber} restored.`);
      } catch (error) {
        showError('Could not restore article.', error);
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

        await withBusyIndicator('Creating article', () => commandClient.createArticle(title.trim()));
        provider.refresh();
        vscode.window.showInformationMessage(`Article "${title.trim()}" created.`);
      } catch (error) {
        showError('Could not create article.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.newTemplate', async () => {
      try {
        ensureEditorUrlConfigured();
        const template = await withBusyIndicator('Creating template', () => commandClient.createTemplate());
        provider.refresh();
        vscode.window.showInformationMessage(`Template "${template.title}" created.`);
      } catch (error) {
        showError('Could not create template.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.preview', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();
        const previewNode = assertPreviewNode(node);
        const previewUrl = await withBusyIndicator('Preparing preview', () =>
          buildPreviewUrl(previewNode, getActiveEditorUrl(), queryClient),
        );
        const opened = await vscode.env.openExternal(vscode.Uri.parse(previewUrl));

        if (!opened) {
          throw new Error('Could not open browser preview URL.');
        }
      } catch (error) {
        showError('Could not open preview.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.previewCurrent', async () => {
      try {
        ensureEditorUrlConfigured();

        const selectedNode = treeView.selection?.[0];
        let previewNode: SkyCmsNode | undefined;

        if (isPreviewCapableNode(selectedNode)) {
          previewNode = selectedNode as SkyCmsNode;
        } else if (selectedNode && selectedNode.kind === 'field') {
          const fieldReference = getFieldReferenceFromFieldNode(selectedNode);
          if (fieldReference) {
            previewNode = await withBusyIndicator('Resolving preview target', () =>
              resolvePreviewNodeFromFieldReference(queryClient, fieldReference),
            );
          }
        }

        if (!previewNode) {
          const activeUri = vscode.window.activeTextEditor?.document?.uri;
          const fieldReference = activeUri ? tryParseFieldReferenceFromUri(activeUri) : undefined;
          if (fieldReference) {
            previewNode = await withBusyIndicator('Resolving preview target', () =>
              resolvePreviewNodeFromFieldReference(queryClient, fieldReference),
            );
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
    vscode.commands.registerCommand('skycms.openArticleOnPublicSite', async (node: unknown) => {
      try {
        const articleNode = assertArticleNode(node);
        const article = articleNode.article;
        if (!article?.urlPath) {
          throw new Error('This article does not have a public URL path.');
        }

        const publicBase = activeSite?.publicUrl;
        if (!publicBase) {
          throw new Error('No public site URL is configured for this site.');
        }

        const publicUrl = new URL(article.urlPath, publicBase.endsWith('/') ? publicBase : publicBase + '/');
        await vscode.env.openExternal(vscode.Uri.parse(publicUrl.toString()));
      } catch (error) {
        showError('Could not open article on public site.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.publishLayoutVersion', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();
        const target = resolveLayoutCommandTarget(node);
        const confirmed = await vscode.window.showWarningMessage(
          `Publish layout version ${target.version} of "${target.name}"?`,
          { modal: true },
          'Publish',
        );

        if (confirmed !== 'Publish') {
          return;
        }

        await withBusyIndicator('Publishing layout version', () =>
          commandClient.publishLayoutVersion(target.layoutNumber, target.version),
        );
        provider.refresh();
        vscode.window.showInformationMessage(`Layout version ${target.version} published.`);
      } catch (error) {
        showError('Could not publish layout version.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.setDefaultLayoutVersion', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();
        const target = resolveLayoutCommandTarget(node);
        const confirmed = await vscode.window.showWarningMessage(
          `Set version ${target.version} of "${target.name}" as the default layout?`,
          { modal: true },
          'Set Default',
        );

        if (confirmed !== 'Set Default') {
          return;
        }

        await withBusyIndicator('Setting default layout version', () =>
          commandClient.setDefaultLayoutVersion(target.layoutNumber, target.version),
        );
        provider.refresh();
        vscode.window.showInformationMessage(`Layout version ${target.version} set as default.`);
      } catch (error) {
        showError('Could not set default layout version.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.duplicateLayoutVersion', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();
        const target = resolveLayoutCommandTarget(node);
        const newVersion = await withBusyIndicator('Duplicating layout version', () =>
          commandClient.duplicateLayoutVersion(target.layoutNumber),
        );
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
        ensureEditorUrlConfigured();
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

        const extension = getExtensionForField(selected.fieldKey);
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
        ensureEditorUrlConfigured();
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
        const fileStat = await queryClient.getFileStat(fileNode.path!);
        logInfo(`Opening file: path=${fileNode.path}, mimeType=${fileStat.mimeType}`);
        const languageIdFromMime = getLanguageForMimeType(fileStat.mimeType);
        const languageIdFromPath = getLanguageForPath(fileNode.path!);
        const languageId = languageIdFromMime ?? languageIdFromPath;
        logInfo(`Language detection: mimeType="${fileStat.mimeType}" -> langFromMime=${languageIdFromMime}, path -> langFromPath=${languageIdFromPath}, selected=${languageId}`);
        if (languageId) {
          logInfo(`Setting text document language to: ${languageId}`);
          await vscode.languages.setTextDocumentLanguage(document, languageId);
        } else {
          logInfo(`No language identified for file: ${fileNode.path}`);
        }
        await vscode.window.showTextDocument(document, { preview: false });
      } catch (error) {
        showError('Could not open file.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.deleteFile', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();
        const fileNode = assertFileNode(node);

        if (SKYCMS_READ_ONLY_FILES.has(fileNode.path!)) {
          vscode.window.showErrorMessage(`"${fileNode.path}" is a SkyCMS system file and cannot be deleted.`);
          return;
        }

        const confirmed = await vscode.window.showWarningMessage(
          `Delete "${fileNode.label}"? This cannot be undone.`,
          {modal: true},
          'Delete',
        );

        if (confirmed !== 'Delete') {
          return;
        }

        await withBusyIndicator('Deleting file', () => commandClient.deleteFile(fileNode.path!));
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

        if (SKYCMS_PROTECTED_PATHS.has(folderNode.path!)) {
          vscode.window.showErrorMessage(`"${folderNode.path}" is required by SkyCMS and cannot be deleted.`);
          return;
        }

        const confirmed = await vscode.window.showWarningMessage(
          `Delete folder "${folderNode.label}" and all its contents? This cannot be undone.`,
          {modal: true},
          'Delete',
        );

        if (confirmed !== 'Delete') {
          return;
        }

        await withBusyIndicator('Deleting folder', () => commandClient.deleteFolder(folderNode.path!));
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
        const targetPath = resolveFolderTargetPath(node);

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
        const destPath = targetPath === '/' ? `/${fileName}` : `${targetPath}/${fileName}`;

        const fileData = await vscode.workspace.fs.readFile(localUri);
        await withBusyIndicator('Uploading file', () => commandClient.uploadFile(destPath, fileData));
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
        const targetPath = resolveFolderTargetPath(node);

        const name = await vscode.window.showInputBox({
          title: 'New Folder',
          prompt: 'Enter the folder name.',
          ignoreFocusOut: true,
          validateInput: (value) => (value.trim().length === 0 ? 'Folder name is required.' : undefined),
        });

        if (!name) {
          return;
        }

        const newPath = targetPath === '/' ? `/${name.trim()}` : `${targetPath}/${name.trim()}`;
        await withBusyIndicator('Creating folder', () => commandClient.createFolder(newPath));
        provider.refresh();
        fileSystemProvider.refresh();
        vscode.window.showInformationMessage(`Folder "${name.trim()}" created.`);
      } catch (error) {
        showError('Could not create folder.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.copyPublicPath', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();
        const fileNode = assertFileNode(node);
        const site = await siteManager.getActiveSite();
        if (!site?.publicUrl) {
          vscode.window.showWarningMessage('Public URL is not configured for this site. Try signing in again.');
          return;
        }
        const base = site.publicUrl.replace(/\/$/, '');
        const url = `${base}${fileNode.path}`;
        await vscode.env.clipboard.writeText(url);
        vscode.window.showInformationMessage(`Copied: ${url}`);
      } catch (error) {
        showError('Could not copy public URL.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.pasteFromClipboard', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();

        const targetNode = node as SkyCmsNode | undefined;
        let targetPath: string;
        if (!targetNode || targetNode.kind === 'files-category') {
          targetPath = '/';
        } else if (targetNode.kind === 'folder' && targetNode.path) {
          targetPath = targetNode.path;
        } else {
          vscode.window.showErrorMessage('Paste is only available on folders in the Files section.');
          return;
        }

        const clipboardText = (await vscode.env.clipboard.readText()).trim();

        // If a Cut or Copy operation is pending, perform a Move or Duplicate.
        if (nodeClipboard) {
          const { node: source, operation } = nodeClipboard;
          const sourceName = source.path?.split('/').pop() ?? String(source.label) ?? 'item';
          const destPath = targetPath === '/' ? `/${sourceName}` : `${targetPath}/${sourceName}`;

          if (operation === 'cut') {
            nodeClipboard = null;
            if (source.path === destPath) {
              vscode.window.showWarningMessage('Source and destination are the same. Nothing to move.');
              return;
            }
            if (source.kind === 'folder') {
              await withBusyIndicator(`Moving "${sourceName}"`, () => commandClient.moveFolder(source.path!, destPath));
            } else {
              await withBusyIndicator(`Moving "${sourceName}"`, () => commandClient.moveFile(source.path!, destPath));
            }
            provider.refresh();
            fileSystemProvider.refresh();
            vscode.window.showInformationMessage(`"${sourceName}" moved.`);
          } else {
            // Copy operation — duplicate file; folder copy not yet supported.
            if (source.kind === 'folder') {
              vscode.window.showWarningMessage('Folder copy is not yet supported. Use Cut to move a folder instead.');
              return;
            }
            if (source.path === destPath) {
              vscode.window.showWarningMessage('Source and destination are the same. Nothing to copy.');
              return;
            }
            await withBusyIndicator(`Copying "${sourceName}"`, async () => {
              const content = await vscode.workspace.fs.readFile(fileSystemProvider.pathToUri(source.path!));
              await commandClient.uploadFile(destPath, content);
            });
            provider.refresh();
            fileSystemProvider.refresh();
            vscode.window.showInformationMessage(`"${sourceName}" copied.`);
          }
          return;
        }

        // Strip surrounding quotes that Windows/macOS may add for paths with spaces.
        const localPath = clipboardText.replace(/^["']|["']$/g, '').trim();

        if (!localPath) {
          vscode.window.showWarningMessage('Clipboard is empty. Right-click a file or folder and choose "Copy Path" first.');
          return;
        }

        const localUri = vscode.Uri.file(localPath);
        let stat: vscode.FileStat;
        try {
          stat = await vscode.workspace.fs.stat(localUri);
        } catch {
          vscode.window.showErrorMessage(`Cannot read "${localPath}". Make sure you used "Copy Path" on a file or folder in the Explorer.`);
          return;
        }

        if (stat.type === vscode.FileType.File) {
          const fileName = localPath.replace(/\\/g, '/').split('/').pop() ?? 'upload';
          const destPath = targetPath === '/' ? `/${fileName}` : `${targetPath}/${fileName}`;
          await withBusyIndicator(`Uploading ${fileName}`, async () => {
            const data = await vscode.workspace.fs.readFile(localUri);
            await commandClient.uploadFile(destPath, data);
          });
          provider.refresh();
          fileSystemProvider.refresh();
          vscode.window.showInformationMessage(`"${fileName}" uploaded.`);
        } else if (stat.type === vscode.FileType.Directory) {
          const folderName = localPath.replace(/\\/g, '/').split('/').pop() ?? 'folder';
          const destBase = targetPath === '/' ? `/${folderName}` : `${targetPath}/${folderName}`;
          let fileCount = 0;
          await withBusyIndicator(`Uploading "${folderName}"`, async () => {
            fileCount = await uploadDirectoryRecursive(localUri, destBase, commandClient);
          });
          provider.refresh();
          fileSystemProvider.refresh();
          vscode.window.showInformationMessage(`"${folderName}" uploaded (${fileCount} file${fileCount !== 1 ? 's' : ''}).`);
        } else {
          vscode.window.showErrorMessage('The clipboard path is not a file or folder.');
        }
      } catch (error) {
        showError('Could not paste from clipboard.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.openFileManager', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();
        const typedNode = node as SkyCmsNode | undefined;
        const folderPath =
          !typedNode || typedNode.kind === 'files-category'
            ? '/pub'
            : typedNode.kind === 'folder' && typedNode.path
              ? typedNode.path
              : '/pub';
        const url = buildFileManagerUrl(getActiveEditorUrl(), folderPath);
        await vscode.env.openExternal(vscode.Uri.parse(url));
      } catch (error) {
        showError('Could not open file manager.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.openOnWeb', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();
        const fileNode = assertFileNode(node);
        const site = await siteManager.getActiveSite();
        if (!site?.publicUrl) {
          vscode.window.showWarningMessage('Public URL is not configured for this site. Try signing in again.');
          return;
        }
        const url = `${site.publicUrl.replace(/\/$/, '')}${fileNode.path}`;
        await vscode.env.openExternal(vscode.Uri.parse(url));
      } catch (error) {
        showError('Could not open file on web.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.rename', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();
        const typedNode = assertFileNode(node);
        const currentName = typedNode.path?.split('/').pop() ?? String(typedNode.label) ?? '';
        const newName = await vscode.window.showInputBox({
          title: typedNode.kind === 'folder' ? 'Rename Folder' : 'Rename File',
          value: currentName,
          valueSelection: [0, currentName.length],
          prompt: 'Enter the new name.',
          ignoreFocusOut: true,
          validateInput: (value) => {
            if (!value.trim()) { return 'Name is required.'; }
            if (value.includes('/')) { return 'Name cannot contain slashes.'; }
            return undefined;
          },
        });

        if (!newName || newName.trim() === currentName) {
          return;
        }

        const parentPath = typedNode.path!.substring(0, typedNode.path!.lastIndexOf('/')) || '/';
        const newPath = parentPath === '/' ? `/${newName.trim()}` : `${parentPath}/${newName.trim()}`;

        if (typedNode.kind === 'folder') {
          await withBusyIndicator('Renaming folder', () => commandClient.moveFolder(typedNode.path!, newPath));
        } else {
          await withBusyIndicator('Renaming file', () => commandClient.moveFile(typedNode.path!, newPath));
        }
        provider.refresh();
        fileSystemProvider.refresh();
        vscode.window.showInformationMessage(`Renamed to "${newName.trim()}".`);
      } catch (error) {
        showError('Could not rename.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.cut', async (node: unknown) => {
      try {
        const typedNode = assertFileNode(node);
        nodeClipboard = { node: typedNode, operation: 'cut' };
        vscode.window.showInformationMessage(
          `"${String(typedNode.label)}" cut. Navigate to the destination folder and use Paste.`,
        );
      } catch (error) {
        showError('Could not cut item.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.addToChat', async (node: unknown) => {
      try {
        const typedNode = node as SkyCmsNode | undefined;
        if (!typedNode) {
          return;
        }
        const query = buildAddToChatQuery(typedNode);
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          query,
          isPartialQuery: true,
        });
      } catch (error) {
        showError('Could not open chat.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.newFile', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();
        const typedNode = node as SkyCmsNode | undefined;
        const targetPath = resolveFolderTargetPath(typedNode);
        const filename = await vscode.window.showInputBox({
          prompt: 'Enter new file name',
          placeHolder: 'example.html',
          validateInput: (v) => (v.trim() ? null : 'File name cannot be empty.'),
        });
        if (!filename?.trim()) {
          return;
        }
        const destPath = targetPath === '/' ? `/${filename.trim()}` : `${targetPath}/${filename.trim()}`;
        await withBusyIndicator(`Creating "${filename.trim()}"`, () =>
          commandClient.uploadFile(destPath, new Uint8Array()),
        );
        provider.refresh();
        fileSystemProvider.refresh();
        vscode.window.showInformationMessage(`"${filename.trim()}" created.`);
      } catch (error) {
        showError('Could not create file.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.openToSide', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();
        const fileNode = assertFileNode(node);
        if (fileNode.isDir) {
          vscode.window.showErrorMessage('Cannot open a folder to the side.');
          return;
        }
        const uri = fileSystemProvider.pathToUri(fileNode.path!);
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Beside, preview: false });
      } catch (error) {
        showError('Could not open file to the side.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.copyCmsPath', async (node: unknown) => {
      try {
        const typedNode = assertFileNode(node);
        if (!typedNode.path) {
          vscode.window.showErrorMessage('This item has no CMS path.');
          return;
        }
        await vscode.env.clipboard.writeText(typedNode.path);
        vscode.window.showInformationMessage(`CMS path copied: ${typedNode.path}`);
      } catch (error) {
        showError('Could not copy CMS path.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.download', async (node: unknown) => {
      try {
        ensureEditorUrlConfigured();
        const fileNode = assertFileNode(node);
        if (fileNode.isDir) {
          vscode.window.showErrorMessage('Folder download is not supported. Download individual files instead.');
          return;
        }
        const fileName = fileNode.path!.split('/').pop() ?? 'download';
        const saveUri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(fileName),
          saveLabel: 'Download',
        });
        if (!saveUri) {
          return;
        }
        await withBusyIndicator(`Downloading "${fileName}"`, async () => {
          const content = await vscode.workspace.fs.readFile(fileSystemProvider.pathToUri(fileNode.path!));
          await vscode.workspace.fs.writeFile(saveUri, content);
        });
        vscode.window.showInformationMessage(`"${fileName}" downloaded.`);
      } catch (error) {
        showError('Could not download file.', error);
      }
    }),
    vscode.commands.registerCommand('skycms.copy', async (node: unknown) => {
      try {
        const typedNode = assertFileNode(node);
        nodeClipboard = { node: typedNode, operation: 'copy' };
        vscode.window.showInformationMessage(
          `"${String(typedNode.label)}" copied. Navigate to the destination folder and use Paste.`,
        );
      } catch (error) {
        showError('Could not copy item.', error);
      }
    }),
  );

  if (getActiveEditorUrl()) {
    try {
      await withBusyIndicator('Connecting', () => authManager.promptReauthIfNeeded());
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

  if ((typedNode.kind !== 'article' && typedNode.kind !== 'blog-stream') || !typedNode.article) {
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

export function assertPreviewNode(node: unknown): SkyCmsNode {
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

/**
 * Resolves the destination folder path for upload/new-folder operations.
 * Accepts folderNode, filesCategoryNode (→ '/'), or throws for anything else.
 */
function resolveFolderTargetPath(node: unknown): string {
  const typedNode = node as SkyCmsNode | undefined;
  if (!typedNode || typedNode.kind === 'files-category') {
    return '/';
  }
  if (typedNode.kind === 'folder' && typedNode.path) {
    return typedNode.path;
  }
  throw new Error('Invalid SkyCMS folder node.');
}

/**
 * Builds the elFinder file manager URL for a given folder path.
 * The hash fragment encodes the path in the format elFinder expects.
 */
function buildFileManagerUrl(editorUrl: string, folderPath: string): string {
  const target = encodeURIComponent(folderPath);
  // elFinder hash: 'elf_l1_' + base64 of path without leading slash
  const hash = `elf_l1_${btoa(folderPath.replace(/^\//, ''))}`;
  return `${editorUrl.replace(/\/$/, '')}/FileManager?target=${target}#${hash}`;
}

/**
 * Builds a pre-filled @skycms chat query text for a given tree node.
 */
function buildAddToChatQuery(node: SkyCmsNode): string {
  switch (node.kind) {
    case 'file':
      return `@skycms file at ${node.path}: `;
    case 'folder':
      return `@skycms folder at ${node.path}: `;
    case 'files-category':
      return `@skycms Files storage: `;
    case 'article':
    case 'blog-stream':
      return node.article
        ? `@skycms article "${node.article.title}" (#${node.article.articleNumber}): `
        : `@skycms article "${String(node.label)}": `;
    case 'layout':
      return node.layout
        ? `@skycms layout "${node.layout.name}": `
        : `@skycms layout "${String(node.label)}": `;
    case 'layout-version':
      return `@skycms layout version ${node.layoutVersion?.version ?? String(node.label)}: `;
    case 'template':
      return node.template
        ? `@skycms page template "${node.template.name}": `
        : `@skycms template "${String(node.label)}": `;
    case 'article-version':
      return node.article
        ? `@skycms version ${node.articleVersion?.versionNumber} of article "${node.article.title}": `
        : `@skycms article version ${String(node.label)}: `;
    case 'category':
      return `@skycms ${node.category} section: `;
    case 'root':
      return `@skycms site "${String(node.label)}": `;
    default:
      return '@skycms ';
  }
}

async function uploadDirectoryRecursive(
  localUri: vscode.Uri,
  destPath: string,
  commandClient: SkyCmsCommandClient,
): Promise<number> {
  await commandClient.createFolder(destPath);
  let count = 0;
  const entries = await vscode.workspace.fs.readDirectory(localUri);
  for (const [name, type] of entries) {
    const childLocalUri = vscode.Uri.joinPath(localUri, name);
    const childDestPath = `${destPath}/${name}`;
    if (type === vscode.FileType.File) {
      const data = await vscode.workspace.fs.readFile(childLocalUri);
      await commandClient.uploadFile(childDestPath, data);
      count++;
    } else if (type === vscode.FileType.Directory) {
      count += await uploadDirectoryRecursive(childLocalUri, childDestPath, commandClient);
    }
  }
  return count;
}

async function openDocumentField(node: SkyCmsNode, siteName?: string): Promise<void> {
  const titlePart = getDocumentTitlePart(node);
  const propertyPart = String(node.label || node.fieldKey || 'Field');
  const extension = getExtensionForField(node.fieldKey || 'content');
  const tabLabel = `${titlePart} - ${propertyPart}`;

  const uri = buildFieldUri({
    entityType: node.entityType!,
    entityId: node.entityId!,
    version: node.layoutVersionNumber,
    articleVersionId: node.articleVersionId,
    fieldKey: node.fieldKey!,
    tabLabel,
  });

  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.languages.setTextDocumentLanguage(document, getLanguageForField(node.fieldKey!));
  await vscode.window.showTextDocument(document, { preview: false });
}

export function getDocumentTitlePart(node: SkyCmsNode): string {
  if (node.entityType === 'layouts') {
    return node.layoutVersionNumber !== undefined
      ? `Layout Version ${node.layoutVersionNumber}`
      : 'Layout';
  }

  if (node.entityType === 'articles' && node.articleVersionId !== undefined) {
    const versionLabel = node.articleVersion
      ? `v${node.articleVersion.versionNumber}`
      : 'Version';
    return `${node.entityLabel || 'Article'} ${versionLabel}`;
  }

  return node.entityLabel || String(node.entityType || 'SkyCMS');
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

function getConfiguredEditorUrl(): string {
  return vscode.workspace.getConfiguration('skycms').get<string>('editorUrl', '').trim();
}

async function buildPreviewUrl(node: SkyCmsNode, editorBaseUrl: string, client: SkyCmsQueryClient): Promise<string> {
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

function resolveLayoutCommandTarget(node: unknown): { layoutNumber: number; version: number; name: string } {
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

function getSearchResultActionOptions(
  result: SkyCmsContentSearchResult,
): Array<vscode.QuickPickItem & { command: string }> {
  if (result.kind === 'file') {
    return [
      { label: 'Open', description: 'Open file in editor', command: 'skycms.openFile' },
      { label: 'Open to the Side', description: 'Open file in split editor', command: 'skycms.openToSide' },
      { label: 'Download', description: 'Download file locally', command: 'skycms.download' },
      { label: 'Copy CMS Path', description: 'Copy the CMS storage path', command: 'skycms.copyCmsPath' },
      { label: 'Pin / Unpin', description: 'Toggle quick access in recent and pinned list', command: 'skycms.togglePinnedContent' },
    ];
  }

  if (result.kind === 'folder') {
    return [
      { label: 'Open in File Manager', description: 'Open folder in SkyCMS file manager', command: 'skycms.openFileManager' },
      { label: 'Copy CMS Path', description: 'Copy the CMS storage path', command: 'skycms.copyCmsPath' },
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
  const errorInfo = ErrorHandler.classifyError(error);
  const message = ErrorHandler.formatMessage(prefix, errorInfo);
  
  logError(`${prefix} [${errorInfo.classification}]`, error);

  // Show the main error message
  const suggestion = ErrorHandler.getSuggestion(errorInfo);
  if (suggestion) {
    vscode.window.showErrorMessage(`${message}\n\n${suggestion}`);
  } else {
    vscode.window.showErrorMessage(message);
  }
}

/**
 * Show an error message with a detail button for additional information.
 * Useful for errors that may have helpful technical context.
 */
export async function showErrorWithDetail(prefix: string, error: unknown): Promise<void> {
  const errorInfo = ErrorHandler.classifyError(error);
  const message = ErrorHandler.formatMessage(prefix, errorInfo, false);
  
  logError(`${prefix} [${errorInfo.classification}]`, error);

  const choice = await vscode.window.showErrorMessage(
    message,
    { modal: false },
    'Show Details',
  );

  if (choice === 'Show Details') {
    const details = [
      `Error: ${errorInfo.title}`,
      `Classification: ${errorInfo.classification}`,
      ...(errorInfo.details ? [`Details: ${errorInfo.details}`] : []),
      ...(errorInfo.suggestion ? [`Suggestion: ${errorInfo.suggestion}`] : []),
    ].join('\n');

    const fullMessage = `${message}\n\n${details}`;
    await vscode.window.showErrorMessage(fullMessage, { modal: true });
  }
}
