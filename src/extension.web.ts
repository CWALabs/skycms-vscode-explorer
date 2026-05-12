import * as vscode from 'vscode';

export async function activate(_context: vscode.ExtensionContext): Promise<void> {
  await vscode.commands.executeCommand('setContext', 'skycms.hasSite', false);
  await vscode.commands.executeCommand('setContext', 'skycms.isSignedIn', false);

  const message = 'SkyCMS Explorer web-host runtime is in progress. Use desktop VS Code or Codespaces today for full functionality.';
  void vscode.window.showInformationMessage(message, 'Learn More').then(async (choice) => {
    if (choice === 'Learn More') {
      await vscode.env.openExternal(vscode.Uri.parse('https://docs.sky-cms.com/for-developers/extending/vscode-extension/'));
    }
  });
}

export function deactivate(): void {
  // No-op for web-host scaffold.
}
