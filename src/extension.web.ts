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

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  initializeLogging(context);
  logInfo('Web-host activation started');

  const siteManager = new SiteManager(context);
  await siteManager.ensureInitialized(getConfiguredEditorUrl());

  let activeSite = await siteManager.getActiveSite();

  const getActiveEditorUrl = (): string => activeSite?.editorUrl ?? '';
  const getActiveTokenStorageKey = (): string | undefined =>
    activeSite ? siteManager.getTokenSecretKey(activeSite.id) : undefined;

  const updateViewContext = async (): Promise<void> => {
    const site = await siteManager.getActiveSite();
    await vscode.commands.executeCommand('setContext', 'skycms.hasSite', !!site);
    const token = site ? await context.secrets.get(siteManager.getTokenSecretKey(site.id)) : undefined;
    await vscode.commands.executeCommand('setContext', 'skycms.isSignedIn', !!token);
  };

  await updateViewContext();

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
