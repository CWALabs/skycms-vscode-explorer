import { SkyCmsDragAndDropController, resolveDropDestination } from './dragAndDropController';

jest.mock('vscode', () => ({
  workspace: {
    fs: {
      stat: jest.fn(),
      readFile: jest.fn(),
      readDirectory: jest.fn(async () => [] as [string, number][]),
    },
  },
  window: {
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    withProgress: jest.fn(async (_options: unknown, task: any) =>
      task({ report: jest.fn() }, { isCancellationRequested: false, onCancellationRequested: jest.fn() }),
    ),
  },
  ProgressLocation: {
    Notification: 15,
  },
  FileType: {
    Unknown: 0,
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  },
  Uri: {
    joinPath: jest.fn((base: { path: string }, ...segments: string[]) => ({
      scheme: 'file',
      path: [base.path, ...segments].join('/'),
      toString: () => `file://${[base.path, ...segments].join('/')}`,
    })),
  },
}));

jest.mock('./apiClient/commands', () => ({
  SkyCmsCommandClient: jest.fn(),
}));

jest.mock('./treeProvider', () => ({
  SkyCmsNode: jest.fn(),
}));

const vscode = require('vscode');

function makeNode(kind: string, path?: string): any {
  return { kind, path };
}

function makeCommandClient() {
  return {
    uploadFile: jest.fn(async () => {}),
    createFolder: jest.fn(async () => {}),
  };
}

function makeDataTransfer(files: object[] | null) {
  return {
    get: jest.fn((mime: string) => {
      if (mime === 'files') {
        return files === null ? undefined : { value: files };
      }
      return undefined;
    }),
  };
}

function makeToken(cancelled = false) {
  return {
    isCancellationRequested: cancelled,
    onCancellationRequested: jest.fn(),
  };
}

function makeDataTransferFile(name: string, uri?: object, dataBytes = new Uint8Array([1, 2, 3])) {
  return {
    name,
    uri,
    data: jest.fn(async () => dataBytes),
  };
}

describe('resolveDropDestination', () => {
  it('returns / for undefined target', () => {
    expect(resolveDropDestination(undefined)).toBe('/');
  });

  it('returns / for files-category node', () => {
    expect(resolveDropDestination(makeNode('files-category'))).toBe('/');
  });

  it('returns folder path for folder node', () => {
    expect(resolveDropDestination(makeNode('folder', '/pub/images'))).toBe('/pub/images');
  });

  it('returns null for folder node with no path', () => {
    expect(resolveDropDestination(makeNode('folder'))).toBeNull();
  });

  it('returns parent folder when dropping on a file node', () => {
    expect(resolveDropDestination(makeNode('file', '/pub/images/logo.png'))).toBe('/pub/images');
  });

  it('returns / when dropping on a file at root level', () => {
    expect(resolveDropDestination(makeNode('file', '/logo.png'))).toBe('/');
  });

  it('returns null for file node with no path', () => {
    expect(resolveDropDestination(makeNode('file'))).toBeNull();
  });

  it('returns null for non-file node kinds (articles, layouts)', () => {
    expect(resolveDropDestination(makeNode('article'))).toBeNull();
    expect(resolveDropDestination(makeNode('layout'))).toBeNull();
    expect(resolveDropDestination(makeNode('root'))).toBeNull();
  });
});

describe('SkyCmsDragAndDropController', () => {
  let commandClient: ReturnType<typeof makeCommandClient>;
  let onDidUpload: jest.Mock;
  let controller: SkyCmsDragAndDropController;

  beforeEach(() => {
    commandClient = makeCommandClient();
    onDidUpload = jest.fn();
    controller = new SkyCmsDragAndDropController(commandClient as any, onDidUpload);
    jest.clearAllMocks();
    // Re-apply cleared mocks
    commandClient = makeCommandClient();
    onDidUpload = jest.fn();
    controller = new SkyCmsDragAndDropController(commandClient as any, onDidUpload);
  });

  it('declares correct mime types', () => {
    expect(controller.dropMimeTypes).toEqual(['files']);
    expect(controller.dragMimeTypes).toEqual([]);
  });

  it('does nothing when files item is not in the data transfer', async () => {
    const dt = makeDataTransfer(null);
    await controller.handleDrop(makeNode('folder', '/pub'), dt as any, makeToken() as any);
    expect(commandClient.uploadFile).not.toHaveBeenCalled();
    expect(onDidUpload).not.toHaveBeenCalled();
  });

  it('does nothing when files array is empty', async () => {
    const dt = makeDataTransfer([]);
    await controller.handleDrop(makeNode('folder', '/pub'), dt as any, makeToken() as any);
    expect(commandClient.uploadFile).not.toHaveBeenCalled();
    expect(onDidUpload).not.toHaveBeenCalled();
  });

  it('shows error for non-file node targets (e.g. article node)', async () => {
    const dt = makeDataTransfer([makeDataTransferFile('a.jpg')]);
    await controller.handleDrop(makeNode('article'), dt as any, makeToken() as any);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Files can only be dropped onto a folder in the Files section.',
    );
    expect(commandClient.uploadFile).not.toHaveBeenCalled();
  });

  describe('file drops', () => {
    it('uploads a file to a folder node', async () => {
      const fileUri = { scheme: 'file', path: '/local/logo.png' };
      vscode.workspace.fs.stat = jest.fn(async () => ({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 100 }));
      const droppedFile = makeDataTransferFile('logo.png', fileUri);
      const dt = makeDataTransfer([droppedFile]);

      await controller.handleDrop(makeNode('folder', '/pub/images'), dt as any, makeToken() as any);

      expect(commandClient.uploadFile).toHaveBeenCalledWith('/pub/images/logo.png', expect.any(Uint8Array));
      expect(onDidUpload).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Uploaded 1 file.');
    });

    it('uploads a file to the root when dropping on files-category', async () => {
      const fileUri = { scheme: 'file', path: '/local/doc.pdf' };
      vscode.workspace.fs.stat = jest.fn(async () => ({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 200 }));
      const droppedFile = makeDataTransferFile('doc.pdf', fileUri);
      const dt = makeDataTransfer([droppedFile]);

      await controller.handleDrop(makeNode('files-category'), dt as any, makeToken() as any);

      expect(commandClient.uploadFile).toHaveBeenCalledWith('/doc.pdf', expect.any(Uint8Array));
    });

    it('uploads a file to parent folder when dropping on a file node', async () => {
      const fileUri = { scheme: 'file', path: '/local/new.jpg' };
      vscode.workspace.fs.stat = jest.fn(async () => ({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 50 }));
      const droppedFile = makeDataTransferFile('new.jpg', fileUri);
      const dt = makeDataTransfer([droppedFile]);

      await controller.handleDrop(makeNode('file', '/pub/images/existing.jpg'), dt as any, makeToken() as any);

      expect(commandClient.uploadFile).toHaveBeenCalledWith('/pub/images/new.jpg', expect.any(Uint8Array));
    });

    it('uploads a file without URI using data() directly', async () => {
      const droppedFile = makeDataTransferFile('readme.txt', undefined, new Uint8Array([65, 66]));
      const dt = makeDataTransfer([droppedFile]);

      await controller.handleDrop(makeNode('folder', '/pub/docs'), dt as any, makeToken() as any);

      expect(droppedFile.data).toHaveBeenCalled();
      expect(commandClient.uploadFile).toHaveBeenCalledWith('/pub/docs/readme.txt', new Uint8Array([65, 66]));
    });

    it('falls back to file upload when stat throws for a URI-bearing entry', async () => {
      const fileUri = { scheme: 'file', path: '/local/photo.jpg' };
      vscode.workspace.fs.stat = jest.fn(async () => { throw new Error('stat failed'); });
      vscode.workspace.fs.readFile = jest.fn(async () => new Uint8Array([0xff, 0xd8]));
      const droppedFile = makeDataTransferFile('photo.jpg', fileUri, new Uint8Array([0xff, 0xd8]));
      const dt = makeDataTransfer([droppedFile]);

      await controller.handleDrop(makeNode('folder', '/pub/images'), dt as any, makeToken() as any);

      // When stat fails the stat result defaults to FileType.File so data() is used
      expect(commandClient.uploadFile).toHaveBeenCalledWith('/pub/images/photo.jpg', expect.any(Uint8Array));
    });

    it('uploads multiple files and reports total count', async () => {
      vscode.workspace.fs.stat = jest.fn(async () => ({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 10 }));
      const dt = makeDataTransfer([
        makeDataTransferFile('a.jpg', { path: '/local/a.jpg' }),
        makeDataTransferFile('b.jpg', { path: '/local/b.jpg' }),
        makeDataTransferFile('c.jpg', { path: '/local/c.jpg' }),
      ]);

      await controller.handleDrop(makeNode('folder', '/pub/images'), dt as any, makeToken() as any);

      expect(commandClient.uploadFile).toHaveBeenCalledTimes(3);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Uploaded 3 files.');
    });
  });

  describe('folder drops', () => {
    it('creates destination folder and uploads its contents recursively', async () => {
      const folderUri = { scheme: 'file', path: '/local/gallery' };
      vscode.workspace.fs.stat = jest.fn(async () => ({
        type: vscode.FileType.Directory,
        ctime: 0,
        mtime: 0,
        size: 0,
      }));
      vscode.workspace.fs.readDirectory = jest.fn(async () => [
        ['photo1.jpg', vscode.FileType.File],
        ['photo2.jpg', vscode.FileType.File],
      ]);
      vscode.workspace.fs.readFile = jest.fn(async () => new Uint8Array([0xff, 0xd8]));

      const droppedFolder = makeDataTransferFile('gallery', folderUri);
      const dt = makeDataTransfer([droppedFolder]);

      await controller.handleDrop(makeNode('folder', '/pub/images'), dt as any, makeToken() as any);

      expect(commandClient.createFolder).toHaveBeenCalledWith('/pub/images/gallery');
      expect(commandClient.uploadFile).toHaveBeenCalledWith('/pub/images/gallery/photo1.jpg', expect.any(Uint8Array));
      expect(commandClient.uploadFile).toHaveBeenCalledWith('/pub/images/gallery/photo2.jpg', expect.any(Uint8Array));
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Uploaded 2 files.');
    });

    it('recursively handles nested sub-folders', async () => {
      const folderUri = { scheme: 'file', path: '/local/assets' };

      // First stat call for the top-level drop → Directory
      // Subsequent stat calls inside uploadDirectoryRecursive are not made (readDirectory is used instead)
      vscode.workspace.fs.stat = jest.fn(async () => ({
        type: vscode.FileType.Directory,
        ctime: 0,
        mtime: 0,
        size: 0,
      }));

      const subFolderUri = { scheme: 'file', path: '/local/assets/css' };
      vscode.workspace.fs.readDirectory = jest
        .fn()
        .mockResolvedValueOnce([
          ['css', vscode.FileType.Directory],
          ['logo.png', vscode.FileType.File],
        ])
        .mockResolvedValueOnce([['main.css', vscode.FileType.File]]);
      vscode.workspace.fs.readFile = jest.fn(async () => new Uint8Array([1]));

      const droppedFolder = makeDataTransferFile('assets', folderUri);
      const dt = makeDataTransfer([droppedFolder]);

      await controller.handleDrop(makeNode('folder', '/pub'), dt as any, makeToken() as any);

      expect(commandClient.createFolder).toHaveBeenCalledWith('/pub/assets');
      expect(commandClient.createFolder).toHaveBeenCalledWith('/pub/assets/css');
      expect(commandClient.uploadFile).toHaveBeenCalledWith('/pub/assets/css/main.css', expect.any(Uint8Array));
      expect(commandClient.uploadFile).toHaveBeenCalledWith('/pub/assets/logo.png', expect.any(Uint8Array));
    });

    it('drops a folder onto the root (files-category)', async () => {
      const folderUri = { scheme: 'file', path: '/local/uploads' };
      vscode.workspace.fs.stat = jest.fn(async () => ({
        type: vscode.FileType.Directory,
        ctime: 0,
        mtime: 0,
        size: 0,
      }));
      vscode.workspace.fs.readDirectory = jest.fn(async () => [['data.bin', vscode.FileType.File]]);
      vscode.workspace.fs.readFile = jest.fn(async () => new Uint8Array([0]));

      const dt = makeDataTransfer([makeDataTransferFile('uploads', folderUri)]);
      await controller.handleDrop(makeNode('files-category'), dt as any, makeToken() as any);

      expect(commandClient.createFolder).toHaveBeenCalledWith('/uploads');
      expect(commandClient.uploadFile).toHaveBeenCalledWith('/uploads/data.bin', expect.any(Uint8Array));
    });
  });

  describe('error handling', () => {
    it('shows error message listing files that failed to upload', async () => {
      vscode.workspace.fs.stat = jest.fn(async () => ({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 10 }));
      const goodFile = makeDataTransferFile('ok.jpg', { path: '/local/ok.jpg' });
      const badFile = makeDataTransferFile('bad.jpg', { path: '/local/bad.jpg' });

      const badData = jest.fn(async () => { throw new Error('read error'); });
      goodFile.data = jest.fn(async () => new Uint8Array([1]));
      badFile.data = badData;

      commandClient.uploadFile = jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('upload failed'));

      vscode.workspace.fs.stat = jest.fn(async () => ({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 1 }));

      const dt = makeDataTransfer([goodFile, badFile]);
      await controller.handleDrop(makeNode('folder', '/pub'), dt as any, makeToken() as any);

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('bad.jpg'),
      );
    });

    it('still calls onDidUpload even when some files fail', async () => {
      vscode.workspace.fs.stat = jest.fn(async () => ({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 1 }));
      commandClient.uploadFile = jest.fn().mockRejectedValue(new Error('fail'));
      const dt = makeDataTransfer([makeDataTransferFile('x.jpg', { path: '/x.jpg' })]);

      await controller.handleDrop(makeNode('folder', '/pub'), dt as any, makeToken() as any);

      expect(onDidUpload).toHaveBeenCalled();
    });
  });

  describe('cancellation', () => {
    it('stops processing files when cancellation is requested', async () => {
      // withProgress mock that delivers a cancelled token
      (vscode.window.withProgress as jest.Mock).mockImplementationOnce(
        async (_opts: unknown, task: any) =>
          task({ report: jest.fn() }, { isCancellationRequested: true, onCancellationRequested: jest.fn() }),
      );

      vscode.workspace.fs.stat = jest.fn(async () => ({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 1 }));
      const dt = makeDataTransfer([
        makeDataTransferFile('a.jpg', { path: '/local/a.jpg' }),
        makeDataTransferFile('b.jpg', { path: '/local/b.jpg' }),
      ]);

      await controller.handleDrop(makeNode('folder', '/pub'), dt as any, makeToken() as any);

      expect(commandClient.uploadFile).not.toHaveBeenCalled();
    });
  });
});
