import * as vscode from 'vscode';
import { SkyCmsCommandClient } from './apiClient/commands';
import { SkyCmsQueryClient } from './apiClient/queries';
import { HttpError } from './apiClient/http';

export class AuthManager {
  private readonly context: vscode.ExtensionContext;
  private readonly queryClient: SkyCmsQueryClient;
  private readonly commandClient: SkyCmsCommandClient;
  private readonly getTokenStorageKey: () => string | undefined;
  private readonly authStateChangedEmitter = new vscode.EventEmitter<void>();

  public readonly onAuthStateChanged = this.authStateChangedEmitter.event;

  public constructor(
    context: vscode.ExtensionContext,
    queryClient: SkyCmsQueryClient,
    commandClient: SkyCmsCommandClient,
    getTokenStorageKey: () => string | undefined,
  ) {
    this.context = context;
    this.queryClient = queryClient;
    this.commandClient = commandClient;
    this.getTokenStorageKey = getTokenStorageKey;
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
    const opened = await vscode.env.openExternal(vscode.Uri.parse(start.loginUrl));

    if (!opened) {
      vscode.window.showErrorMessage('Could not open external browser for SkyCMS sign-in.');
      return false;
    }

    const code = await vscode.window.showInputBox({
      title: 'Complete SkyCMS sign-in',
      prompt: 'After signing in in your browser, paste the one-time verification code from SkyCMS.',
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim().length === 0 ? 'Verification code is required.' : undefined),
    });

    if (!code) {
      return false;
    }

    const exchanged = await this.commandClient.completeBrowserAuth({ state: start.state, code: code.trim() });

    if (!exchanged.token) {
      vscode.window.showErrorMessage('SkyCMS sign-in did not return a token.');
      return false;
    }

    const tokenKey = this.getTokenStorageKey();
    if (!tokenKey) {
      throw new Error('No SkyCMS site is currently selected.');
    }

    await this.context.secrets.store(tokenKey, exchanged.token);
    this.authStateChangedEmitter.fire();
    vscode.window.showInformationMessage('SkyCMS sign-in successful. You can close the browser tab.');
    return true;
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
}
