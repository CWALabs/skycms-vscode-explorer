import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

export function initializeLogging(context: vscode.ExtensionContext): void {
  if (!outputChannel) {
    if (typeof vscode.window.createOutputChannel === 'function') {
      outputChannel = vscode.window.createOutputChannel('SkyCMS Explorer');
      context.subscriptions.push(outputChannel);
    }
  }
}

export function logInfo(message: string): void {
  console.info(message);
  outputChannel?.appendLine(`${timestamp()} INFO ${message}`);
}

export function logWarn(message: string): void {
  console.warn(message);
  outputChannel?.appendLine(`${timestamp()} WARN ${message}`);
}

export function logError(message: string, error?: unknown): void {
  console.error(message, error);
  outputChannel?.appendLine(`${timestamp()} ERROR ${message}${formatError(error)}`);
}

function timestamp(): string {
  return new Date().toISOString();
}

function formatError(error: unknown): string {
  if (!error) {
    return '';
  }

  if (error instanceof Error) {
    return ` | ${error.name}: ${error.message}`;
  }

  return ` | ${String(error)}`;
}