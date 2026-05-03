import * as vscode from 'vscode';
import { SkyCmsQueryClient } from './apiClient/queries';
import { SkyCmsCommandClient } from './apiClient/commands';

/**
 * File system entry metadata.
 */
interface FileEntry {
  name: string;
  isDir: boolean;
  size?: number;
  mtime?: number;
  mimeType?: string;
}

/**
 * VSCode FileSystemProvider for SkyCMS BLOB storage.
 * Provides a virtual filesystem mounted as `skycms-blob://` scheme.
 */
export class SkyCmsFileSystemProvider implements vscode.FileSystemProvider {
  private readonly queryClient: SkyCmsQueryClient;
  private readonly commandClient: SkyCmsCommandClient;
  private folderCache = new Map<string, FileEntry[]>();
  private cacheTTL = 10 * 1000; // 10 seconds
  private cacheTimestamps = new Map<string, number>();

  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]>;
  private onDidChangeFileEmitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();

  constructor(queryClient: SkyCmsQueryClient, commandClient: SkyCmsCommandClient) {
    this.queryClient = queryClient;
    this.commandClient = commandClient;
    this.onDidChangeFile = this.onDidChangeFileEmitter.event;
  }

  /**
   * Invalidate cache and emit change event.
   */
  public refresh(): void {
    this.folderCache.clear();
    this.cacheTimestamps.clear();
    this.onDidChangeFileEmitter.fire([]);
  }

  /**
   * Get metadata (stat) for a file or folder.
   */
  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const path = this.uriToPath(uri);

    try {
      const stat = await this.queryClient.getFileStat(path);

      return {
        type: stat.isDir ? vscode.FileType.Directory : vscode.FileType.File,
        ctime: 0,
        mtime: stat.mtime || 0,
        size: stat.size || 0,
      };
    } catch (error) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
  }

  /**
   * List files and folders in a directory.
   */
  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const path = this.uriToPath(uri);

    // Check cache
    const now = Date.now();
    const cached = this.folderCache.get(path);
    const timestamp = this.cacheTimestamps.get(path) || 0;
    if (cached && now - timestamp < this.cacheTTL) {
      return cached.map((e) => [e.name, e.isDir ? vscode.FileType.Directory : vscode.FileType.File]);
    }

    try {
      const entries = await this.queryClient.getFilesList(path);
      this.folderCache.set(path, entries);
      this.cacheTimestamps.set(path, now);

      return entries.map((e) => [e.name, e.isDir ? vscode.FileType.Directory : vscode.FileType.File]);
    } catch (error) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
  }

  /**
   * Read file content. Returns Uint8Array.
   */
  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const path = this.uriToPath(uri);

    try {
      const content = await this.queryClient.readFile(path);

      // If content is a string (base64), decode it
      if (typeof content === 'string') {
        return new Uint8Array(Buffer.from(content, 'base64'));
      }

      // Otherwise it's already Uint8Array
      return content;
    } catch (error) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
  }

  /**
   * Write file content. Creates or overwrites the file at the given URI.
   */
  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: {create: boolean; overwrite: boolean},
  ): Promise<void> {
    const path = this.uriToPath(uri);

    try {
      await this.commandClient.uploadFile(path, content);
      // Invalidate the parent folder cache so the tree reflects the change
      const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
      this.folderCache.delete(parentPath);
      this.cacheTimestamps.delete(parentPath);
      this.onDidChangeFileEmitter.fire([{type: vscode.FileChangeType.Changed, uri}]);
    } catch (error) {
      throw vscode.FileSystemError.Unavailable(uri);
    }
  }

  /**
   * Create a directory at the given URI.
   */
  async createDirectory(uri: vscode.Uri): Promise<void> {
    const path = this.uriToPath(uri);

    try {
      await this.commandClient.createFolder(path);
      const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
      this.folderCache.delete(parentPath);
      this.cacheTimestamps.delete(parentPath);
      this.onDidChangeFileEmitter.fire([{type: vscode.FileChangeType.Created, uri}]);
    } catch (error) {
      throw vscode.FileSystemError.Unavailable(uri);
    }
  }

  /**
   * Delete a file or directory at the given URI.
   */
  async delete(uri: vscode.Uri, options: {recursive: boolean}): Promise<void> {
    const path = this.uriToPath(uri);

    try {
      // stat first to determine if it's a file or directory
      const stat = await this.queryClient.getFileStat(path);

      if (stat.isDir) {
        await this.commandClient.deleteFolder(path);
      } else {
        await this.commandClient.deleteFile(path);
      }

      const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
      this.folderCache.delete(parentPath);
      this.cacheTimestamps.delete(parentPath);
      this.onDidChangeFileEmitter.fire([{type: vscode.FileChangeType.Deleted, uri}]);
    } catch (error) {
      if (error instanceof vscode.FileSystemError) {
        throw error;
      }
      throw vscode.FileSystemError.FileNotFound(uri);
    }
  }

  /**
   * Rename file or directory by moving it to the new URI path.
   */
  async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: {overwrite: boolean}): Promise<void> {
    const sourcePath = this.uriToPath(oldUri);
    const destPath = this.uriToPath(newUri);

    try {
      const stat = await this.queryClient.getFileStat(sourcePath);

      if (stat.isDir) {
        await this.commandClient.moveFolder(sourcePath, destPath);
      } else {
        await this.commandClient.moveFile(sourcePath, destPath);
      }

      // Invalidate caches for both parent directories
      const sourceParent = sourcePath.substring(0, sourcePath.lastIndexOf('/')) || '/';
      const destParent = destPath.substring(0, destPath.lastIndexOf('/')) || '/';
      this.folderCache.delete(sourceParent);
      this.cacheTimestamps.delete(sourceParent);
      this.folderCache.delete(destParent);
      this.cacheTimestamps.delete(destParent);

      this.onDidChangeFileEmitter.fire([
        {type: vscode.FileChangeType.Deleted, uri: oldUri},
        {type: vscode.FileChangeType.Created, uri: newUri},
      ]);
    } catch (error) {
      if (error instanceof vscode.FileSystemError) {
        throw error;
      }
      throw vscode.FileSystemError.Unavailable(oldUri);
    }
  }

  /**
   * Watch for file changes. Minimal implementation.
   */
  watch(
    uri: vscode.Uri,
    options: {recursive: boolean; excludes: string[]},
  ): vscode.Disposable {
    // Minimal implementation: return empty disposable
    return {dispose: () => {}};
  }

  /**
   * Convert VSCode URI to file path.
   * URI format: skycms-blob:/path/to/file
   * Returns: /path/to/file
   */
  private uriToPath(uri: vscode.Uri): string {
    // uri.path includes leading slash, e.g., "/pub/file.txt"
    return uri.path;
  }

  /**
   * Convert file path to VSCode URI.
   * Path format: /path/to/file
   * Returns: skycms-blob:/path/to/file
   */
  public pathToUri(path: string): vscode.Uri {
    return vscode.Uri.from({
      scheme: 'skycms-blob',
      path: path,
    });
  }
}
