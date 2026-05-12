import * as vscode from 'vscode';
import { SkyCmsCommandClient } from './apiClient/commands';
import { SkyCmsQueryClient } from './apiClient/queries';
import { HttpError } from './apiClient/http';
import { SiteManager } from './siteManager';

export class AuthManager {
  private readonly context: vscode.ExtensionContext;
  private readonly queryClient: SkyCmsQueryClient;
  private readonly commandClient: SkyCmsCommandClient;
  private readonly getTokenStorageKey: () => string | undefined;
  private readonly siteManager: SiteManager;
  private readonly authStateChangedEmitter = new vscode.EventEmitter<void>();

  public readonly onAuthStateChanged = this.authStateChangedEmitter.event;

  public constructor(
    context: vscode.ExtensionContext,
    queryClient: SkyCmsQueryClient,
    commandClient: SkyCmsCommandClient,
    getTokenStorageKey: () => string | undefined,
    siteManager: SiteManager,
  ) {
    this.context = context;
    this.queryClient = queryClient;
    this.commandClient = commandClient;
    this.getTokenStorageKey = getTokenStorageKey;
    this.siteManager = siteManager;
  }

  public async getToken(): Promise<string | undefined> {
    const tokenKey = this.getTokenStorageKey();
    if (!tokenKey) {
      return undefined;
    }

    return this.context.secrets.get(tokenKey);
  }

  public async startBrowserSignIn(): Promise<boolean> {
    const start = await this.queryClient.startBrowserAuth();
    const state = start.state ?? '';

    const opened = await vscode.env.openExternal(vscode.Uri.parse(start.loginUrl));
    if (!opened) {
      vscode.window.showErrorMessage('Could not open external browser for SkyCMS sign-in.');
      return false;
    }

    // Poll for sign-in completion. The server records the one-time code once
    // the user logs in via the browser. The extension retrieves it here so the
    // browser never needs to redirect back to VS Code (no "Allow this site to
    // open VS Code?" OS dialog).
    const pollResult = await vscode.window.withProgress<{ code: string; websiteTitle?: string; publicUrl?: string } | null>(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'SkyCMS: Waiting for browser sign-in\u2026',
        cancellable: true,
      },
      async (_, cancellationToken) => {
        const pollIntervalMs = 2000;
        const maxAttempts = Math.ceil((5 * 60 * 1000) / pollIntervalMs); // 5 minutes

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (cancellationToken.isCancellationRequested) {
            return null;
          }

          try {
            const result = await this.queryClient.pollBrowserAuth(state);

            if (result.status === 'complete' && result.code) {
              return { code: result.code, websiteTitle: result.websiteTitle, publicUrl: result.publicUrl };
            }

            if (result.status === 'expired') {
              vscode.window.showErrorMessage('SkyCMS sign-in request expired. Please try again.');
              return null;
            }

            // status === 'pending': wait, then poll again.
          } catch {
            // Network error during poll — keep retrying until timeout.
          }

          // Wait for the next poll interval, but cancel immediately if requested.
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, pollIntervalMs);
            cancellationToken.onCancellationRequested(() => {
              clearTimeout(timer);
              resolve();
            });
          });
        }

        vscode.window.showErrorMessage('SkyCMS sign-in timed out. Please try again.');
        return null;
      },
    );

    if (!pollResult) {
      return false;
    }

    const { code, websiteTitle, publicUrl } = pollResult;
    const exchanged = await this.commandClient.completeBrowserAuth({ state, code });

    if (!exchanged.token) {
      vscode.window.showErrorMessage('SkyCMS sign-in did not return a token.');
      return false;
    }

    const tokenKey = this.getTokenStorageKey();
    if (!tokenKey) {
      throw new Error('No SkyCMS site is currently selected.');
    }

    await this.context.secrets.store(tokenKey, exchanged.token);

    // Persist site metadata so the tree node and status bar reflect the live title.
    const resolvedTitle = exchanged.websiteTitle ?? websiteTitle;
    const resolvedPublicUrl = exchanged.publicUrl ?? publicUrl;
    const activeSite = await this.siteManager.getActiveSite();
    if (activeSite) {
      await this.siteManager.updateSiteMetadata(activeSite.id, resolvedTitle, resolvedPublicUrl);
    }

    this.authStateChangedEmitter.fire();
    vscode.window.showInformationMessage('SkyCMS sign-in successful.');
    return true;
  }

  /**
   * Called by the VS Code URI handler when the browser navigates to
   * `vscode://cwalabs.skycms-explorer/auth/callback`.
   *
   * With the polling flow this callback is not the primary auth mechanism —
   * the extension polls the server instead. This handler is kept for
   * completeness but takes no action; the polling loop will complete
   * independently.
   */
  public handleAuthCallback(_uri: vscode.Uri): void {
    // No-op: auth completion is detected via polling in startBrowserSignIn.
  }

  public async signOut(): Promise<void> {
    try {
      await this.commandClient.logout();
    } catch {
      // Best-effort logout. Local token is always cleared.
    }

    const tokenKey = this.getTokenStorageKey();
    if (tokenKey) {
      await this.context.secrets.delete(tokenKey);
    }

    this.authStateChangedEmitter.fire();
  }

  public async validateToken(): Promise<boolean> {
    const token = await this.getToken();

    if (!token) {
      return false;
    }

    try {
      await this.queryClient.getMe();
      return true;
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        const tokenKey = this.getTokenStorageKey();
        if (tokenKey) {
          await this.context.secrets.delete(tokenKey);
        }

        this.authStateChangedEmitter.fire();
        return false;
      }

      throw error;
    }
  }

  /**
   * Checks whether the stored token is still valid. If it has expired (or is
   * absent), prompts the user to sign in again. Silent for non-auth errors.
   */
  public async promptReauthIfNeeded(): Promise<void> {
    let isValid: boolean;
    try {
      isValid = await this.validateToken();
    } catch {
      // Non-401 network error — don't nag the user at startup.
      return;
    }

    if (isValid) {
      return;
    }

    // Token is invalid — the tree will refresh automatically via authStateChangedEmitter
    // and show the "Log In to {site}" node directly in the explorer panel.
  }
}
