import * as vscode from 'vscode';
import { SkyCmsQueryClient } from './apiClient/queries';
import { SkyCmsCommandClient } from './apiClient/commands';
import { parseFieldUri, validateDocumentContent } from './uriUtils';

/**
 * VSCode FileSystemProvider for SkyCMS field documents.
 * Provides read/write access to entity field content under the `skycms://` scheme.
 * Replacing the previous TextDocumentContentProvider gives full editor parity:
 * richer context menus, proper save integration, and language-mode support.
 */
export class SkyCmsFieldFileSystemProvider implements vscode.FileSystemProvider {
  private readonly queryClient: SkyCmsQueryClient;
  private readonly commandClient: SkyCmsCommandClient;

  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]>;
  private readonly onDidChangeFileEmitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();

  public constructor(queryClient: SkyCmsQueryClient, commandClient: SkyCmsCommandClient) {
    this.queryClient = queryClient;
    this.commandClient = commandClient;
    this.onDidChangeFile = this.onDidChangeFileEmitter.event;
  }

  /**
   * Fire a change event for the given URI (e.g. after an external update).
   */
  public notifyChanged(uri: vscode.Uri): void {
    this.onDidChangeFileEmitter.fire([{type: vscode.FileChangeType.Changed, uri}]);
  }

  // ------- required but not meaningful for single-file field docs -------

  watch(_uri: vscode.Uri, _options: {recursive: boolean; excludes: string[]}): vscode.Disposable {
    return new vscode.Disposable(() => {/* no-op */});
  }

  stat(_uri: vscode.Uri): vscode.FileStat {
    return {
      type: vscode.FileType.File,
      ctime: 0,
      mtime: 0,
      size: 0,
    };
  }

  readDirectory(_uri: vscode.Uri): [string, vscode.FileType][] {
    throw vscode.FileSystemError.FileNotADirectory(_uri);
  }

  createDirectory(_uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(_uri);
  }

  delete(_uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(_uri);
  }

  rename(_oldUri: vscode.Uri, _newUri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(_oldUri);
  }

  // ------- content read/write -------

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const reference = parseFieldUri(uri);
    let content: string;
    if (reference.entityType === 'layouts' && reference.version !== undefined) {
      content = await this.queryClient.getLayoutVersionDocumentFieldContent(
        Number(reference.entityId),
        reference.version,
        reference.fieldKey,
      );
    } else if (reference.entityType === 'articles' && reference.articleVersionId !== undefined) {
      content = await this.queryClient.getArticleVersionFieldContent(
        Number(reference.entityId),
        reference.articleVersionId,
        reference.fieldKey,
      );
    } else {
      content = await this.queryClient.getDocumentFieldContent(
        reference.entityType,
        reference.entityId,
        reference.fieldKey,
      );
    }
    return new TextEncoder().encode(content);
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array, _options: {create: boolean; overwrite: boolean}): Promise<void> {
    const reference = parseFieldUri(uri);

    if (reference.entityType === 'layouts' && reference.version !== undefined) {
      throw vscode.FileSystemError.NoPermissions(uri);
    }

    if (reference.entityType === 'articles' && reference.articleVersionId !== undefined) {
      throw vscode.FileSystemError.NoPermissions(uri);
    }

    const text = new TextDecoder().decode(content);

    const validationError = validateDocumentContent(reference.fieldKey, text);
    if (validationError) {
      throw vscode.FileSystemError.Unavailable(`Validation failed: ${validationError}`);
    }

    await this.commandClient.setDocumentFieldContent(
      reference.entityType,
      reference.entityId,
      reference.fieldKey,
      text,
    );

    this.onDidChangeFileEmitter.fire([{type: vscode.FileChangeType.Changed, uri}]);
  }
}
