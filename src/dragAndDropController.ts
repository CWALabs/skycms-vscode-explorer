import * as vscode from 'vscode';
import { SkyCmsCommandClient } from './apiClient/commands';
import { SkyCmsNode } from './treeProvider';

/**
 * Implements VS Code's TreeDragAndDropController to support dropping files and
 * folders from the OS onto the SkyCMS Explorer tree.
 *
 * Dropping on a folder node uploads into that folder.
 * Dropping on a file node uploads into the file's parent folder.
 * Dropping on the Files root node uploads into /.
 *
 * Folder drops are handled recursively: each child file is uploaded individually
 * and the folder hierarchy is recreated in SkyCMS storage.
 */
export class SkyCmsDragAndDropController implements vscode.TreeDragAndDropController<SkyCmsNode> {
  public readonly dragMimeTypes: readonly string[] = [];
  public readonly dropMimeTypes: readonly string[] = ['files'];

  private readonly commandClient: SkyCmsCommandClient;
  private readonly onDidUpload: () => void;

  constructor(commandClient: SkyCmsCommandClient, onDidUpload: () => void) {
    this.commandClient = commandClient;
    this.onDidUpload = onDidUpload;
  }

  public async handleDrop(
    target: SkyCmsNode | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const destPath = resolveDropDestination(target);
    if (destPath === null) {
      vscode.window.showErrorMessage('Files can only be dropped onto a folder in the Files section.');
      return;
    }

    const filesItem = dataTransfer.get('files');
    if (!filesItem) {
      return;
    }

    const droppedFiles = filesItem.value as vscode.DataTransferFile[];
    if (!Array.isArray(droppedFiles) || droppedFiles.length === 0) {
      return;
    }

    let totalUploaded = 0;
    const failed: string[] = [];

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Uploading to SkyCMS',
        cancellable: true,
      },
      async (progress, token) => {
        for (const file of droppedFiles) {
          if (token.isCancellationRequested) {
            break;
          }

          try {
            const uri = file.uri;

            if (uri) {
              let stat: vscode.FileStat;
              try {
                stat = await vscode.workspace.fs.stat(uri);
              } catch {
                stat = { type: vscode.FileType.File, ctime: 0, mtime: 0, size: 0 };
              }

              if (stat.type === vscode.FileType.Directory) {
                progress.report({ message: `Uploading folder "${file.name}"…` });
                const folderDest = joinPath(destPath, file.name);
                const count = await this.uploadDirectoryRecursive(uri, folderDest, progress, token);
                totalUploaded += count;
                continue;
              }
            }

            progress.report({ message: `Uploading "${file.name}"…` });
            const data = await file.data();
            const fileDest = joinPath(destPath, file.name);
            await this.commandClient.uploadFile(fileDest, data);
            totalUploaded++;
          } catch {
            failed.push(file.name);
          }
        }
      },
    );

    this.onDidUpload();

    if (failed.length > 0) {
      vscode.window.showErrorMessage(`Upload failed for: ${failed.join(', ')}`);
    } else if (totalUploaded > 0) {
      vscode.window.showInformationMessage(
        `Uploaded ${totalUploaded} file${totalUploaded !== 1 ? 's' : ''}.`,
      );
    }
  }

  private async uploadDirectoryRecursive(
    localUri: vscode.Uri,
    destPath: string,
    progress: vscode.Progress<{ message?: string }>,
    token: vscode.CancellationToken,
  ): Promise<number> {
    await this.commandClient.createFolder(destPath);
    let count = 0;
    const entries = await vscode.workspace.fs.readDirectory(localUri);
    for (const [name, type] of entries) {
      if (token.isCancellationRequested) {
        break;
      }
      const childLocalUri = vscode.Uri.joinPath(localUri, name);
      const childDestPath = `${destPath}/${name}`;
      if (type === vscode.FileType.File) {
        progress.report({ message: `Uploading "${name}"…` });
        const data = await vscode.workspace.fs.readFile(childLocalUri);
        await this.commandClient.uploadFile(childDestPath, data);
        count++;
      } else if (type === vscode.FileType.Directory) {
        count += await this.uploadDirectoryRecursive(childLocalUri, childDestPath, progress, token);
      }
    }
    return count;
  }
}

export function resolveDropDestination(target: SkyCmsNode | undefined): string | null {
  if (!target || target.kind === 'files-category') {
    return '/';
  }
  if (target.kind === 'folder' && target.path) {
    return target.path;
  }
  if (target.kind === 'file' && target.path) {
    const lastSlash = target.path.lastIndexOf('/');
    return lastSlash > 0 ? target.path.substring(0, lastSlash) : '/';
  }
  return null;
}

function joinPath(parent: string, name: string): string {
  return parent === '/' ? `/${name}` : `${parent}/${name}`;
}
