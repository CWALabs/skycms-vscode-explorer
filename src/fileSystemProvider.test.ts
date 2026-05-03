import { SkyCmsFileSystemProvider } from './fileSystemProvider';

jest.mock('vscode', () => ({
  EventEmitter: jest.fn(() => ({
    event: jest.fn(),
    fire: jest.fn(),
    dispose: jest.fn(),
  })),
  FileType: {
    File: 1,
    Directory: 2,
  },
  FileChangeType: {
    Changed: 1,
    Created: 2,
    Deleted: 3,
  },
  FileSystemError: {
    FileNotFound: jest.fn((uri) => Object.assign(new Error(`FileNotFound: ${uri}`), {code: 'FileNotFound'})),
    Unavailable: jest.fn((uri) => Object.assign(new Error(`Unavailable: ${uri}`), {code: 'Unavailable'})),
    NoPermissions: jest.fn((msg) => Object.assign(new Error(`NoPermissions: ${msg}`), {code: 'NoPermissions'})),
  },
  Uri: {
    from: jest.fn((opts: {scheme: string; path: string}) => ({
      scheme: opts.scheme,
      path: opts.path,
      toString: () => `${opts.scheme}:${opts.path}`,
    })),
  },
}));

const vscode = require('vscode');

function makeUri(path: string) {
  return {scheme: 'skycms-blob', path, toString: () => `skycms-blob:${path}`} as any;
}

function makeQueryClient(overrides: Record<string, jest.Mock> = {}) {
  return {
    getFileStat: jest.fn(async () => ({isDir: false, size: 100, mtime: 0})),
    getFilesList: jest.fn(async () => [
      {name: 'file.txt', isDir: false, size: 50},
      {name: 'subdir', isDir: true},
    ]),
    readFile: jest.fn(async () => new Uint8Array([104, 101, 108, 108, 111])),
    ...overrides,
  } as any;
}

function makeCommandClient(overrides: Record<string, jest.Mock> = {}) {
  return {
    uploadFile: jest.fn(async () => {}),
    createFolder: jest.fn(async () => {}),
    deleteFile: jest.fn(async () => {}),
    deleteFolder: jest.fn(async () => {}),
    moveFile: jest.fn(async () => {}),
    moveFolder: jest.fn(async () => {}),
    ...overrides,
  } as any;
}

// ---------------------------------------------------------------------------
// stat
// ---------------------------------------------------------------------------
describe('SkyCmsFileSystemProvider.stat', () => {
  test('returns FileStat for a file', async () => {
    const qc = makeQueryClient({
      getFileStat: jest.fn(async () => ({isDir: false, size: 200, mtime: 1000})),
    });
    const provider = new SkyCmsFileSystemProvider(qc, makeCommandClient());

    const result = await provider.stat(makeUri('/pub/file.txt'));

    expect(result.type).toBe(vscode.FileType.File);
    expect(result.size).toBe(200);
    expect(result.mtime).toBe(1000);
  });

  test('returns FileStat for a directory', async () => {
    const qc = makeQueryClient({
      getFileStat: jest.fn(async () => ({isDir: true, size: 0, mtime: 0})),
    });
    const provider = new SkyCmsFileSystemProvider(qc, makeCommandClient());

    const result = await provider.stat(makeUri('/pub'));

    expect(result.type).toBe(vscode.FileType.Directory);
  });

  test('throws FileNotFound when stat fails', async () => {
    const qc = makeQueryClient({
      getFileStat: jest.fn(async () => { throw new Error('not found'); }),
    });
    const provider = new SkyCmsFileSystemProvider(qc, makeCommandClient());

    await expect(provider.stat(makeUri('/pub/missing.txt'))).rejects.toThrow();
    expect(vscode.FileSystemError.FileNotFound).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// readDirectory
// ---------------------------------------------------------------------------
describe('SkyCmsFileSystemProvider.readDirectory', () => {
  test('returns file and directory entries', async () => {
    const provider = new SkyCmsFileSystemProvider(makeQueryClient(), makeCommandClient());

    const entries = await provider.readDirectory(makeUri('/pub'));

    expect(entries).toContainEqual(['file.txt', vscode.FileType.File]);
    expect(entries).toContainEqual(['subdir', vscode.FileType.Directory]);
  });

  test('uses cache on second call', async () => {
    const qc = makeQueryClient();
    const provider = new SkyCmsFileSystemProvider(qc, makeCommandClient());

    await provider.readDirectory(makeUri('/pub'));
    await provider.readDirectory(makeUri('/pub'));

    expect(qc.getFilesList).toHaveBeenCalledTimes(1);
  });

  test('refresh clears cache', async () => {
    const qc = makeQueryClient();
    const provider = new SkyCmsFileSystemProvider(qc, makeCommandClient());

    await provider.readDirectory(makeUri('/pub'));
    provider.refresh();
    await provider.readDirectory(makeUri('/pub'));

    expect(qc.getFilesList).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// readFile
// ---------------------------------------------------------------------------
describe('SkyCmsFileSystemProvider.readFile', () => {
  test('returns Uint8Array content', async () => {
    const expected = new Uint8Array([104, 101, 108, 108, 111]);
    const qc = makeQueryClient({
      readFile: jest.fn(async () => expected),
    });
    const provider = new SkyCmsFileSystemProvider(qc, makeCommandClient());

    const result = await provider.readFile(makeUri('/pub/file.txt'));

    expect(result).toEqual(expected);
  });

  test('decodes base64 string to Uint8Array', async () => {
    const qc = makeQueryClient({
      readFile: jest.fn(async () => 'aGVsbG8='), // "hello" in base64
    });
    const provider = new SkyCmsFileSystemProvider(qc, makeCommandClient());

    const result = await provider.readFile(makeUri('/pub/file.txt'));

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result[0]).toBe(104); // 'h'
  });
});

// ---------------------------------------------------------------------------
// writeFile
// ---------------------------------------------------------------------------
describe('SkyCmsFileSystemProvider.writeFile', () => {
  test('calls uploadFile and fires Changed event', async () => {
    const cc = makeCommandClient();
    const provider = new SkyCmsFileSystemProvider(makeQueryClient(), cc);
    const emitter = (provider as any).onDidChangeFileEmitter;

    const uri = makeUri('/pub/file.txt');
    await provider.writeFile(uri, new Uint8Array([1, 2, 3]), {create: true, overwrite: true});

    expect(cc.uploadFile).toHaveBeenCalledWith('/pub/file.txt', expect.any(Uint8Array));
    expect(emitter.fire).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createDirectory
// ---------------------------------------------------------------------------
describe('SkyCmsFileSystemProvider.createDirectory', () => {
  test('calls createFolder and fires Created event', async () => {
    const cc = makeCommandClient();
    const provider = new SkyCmsFileSystemProvider(makeQueryClient(), cc);
    const emitter = (provider as any).onDidChangeFileEmitter;

    await provider.createDirectory(makeUri('/pub/newdir'));

    expect(cc.createFolder).toHaveBeenCalledWith('/pub/newdir');
    expect(emitter.fire).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------
describe('SkyCmsFileSystemProvider.delete', () => {
  test('calls deleteFile for a file', async () => {
    const cc = makeCommandClient();
    const qc = makeQueryClient({
      getFileStat: jest.fn(async () => ({isDir: false, size: 100, mtime: 0})),
    });
    const provider = new SkyCmsFileSystemProvider(qc, cc);

    await provider.delete(makeUri('/pub/file.txt'), {recursive: false});

    expect(cc.deleteFile).toHaveBeenCalledWith('/pub/file.txt');
    expect(cc.deleteFolder).not.toHaveBeenCalled();
  });

  test('calls deleteFolder for a directory', async () => {
    const cc = makeCommandClient();
    const qc = makeQueryClient({
      getFileStat: jest.fn(async () => ({isDir: true, size: 0, mtime: 0})),
    });
    const provider = new SkyCmsFileSystemProvider(qc, cc);

    await provider.delete(makeUri('/pub/images'), {recursive: true});

    expect(cc.deleteFolder).toHaveBeenCalledWith('/pub/images');
    expect(cc.deleteFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// rename
// ---------------------------------------------------------------------------
describe('SkyCmsFileSystemProvider.rename', () => {
  test('calls moveFile for a file and fires Deleted + Created events', async () => {
    const cc = makeCommandClient();
    const qc = makeQueryClient({
      getFileStat: jest.fn(async () => ({isDir: false, size: 100, mtime: 0})),
    });
    const provider = new SkyCmsFileSystemProvider(qc, cc);
    const emitter = (provider as any).onDidChangeFileEmitter;

    const oldUri = makeUri('/pub/old.txt');
    const newUri = makeUri('/pub/new.txt');
    await provider.rename(oldUri, newUri, {overwrite: false});

    expect(cc.moveFile).toHaveBeenCalledWith('/pub/old.txt', '/pub/new.txt');
    expect(cc.moveFolder).not.toHaveBeenCalled();
    const fireArg = emitter.fire.mock.calls[0][0] as any[];
    expect(fireArg.some((e: any) => e.type === vscode.FileChangeType.Deleted)).toBe(true);
    expect(fireArg.some((e: any) => e.type === vscode.FileChangeType.Created)).toBe(true);
  });

  test('calls moveFolder for a directory', async () => {
    const cc = makeCommandClient();
    const qc = makeQueryClient({
      getFileStat: jest.fn(async () => ({isDir: true, size: 0, mtime: 0})),
    });
    const provider = new SkyCmsFileSystemProvider(qc, cc);

    await provider.rename(makeUri('/pub/old-dir'), makeUri('/pub/new-dir'), {overwrite: false});

    expect(cc.moveFolder).toHaveBeenCalledWith('/pub/old-dir', '/pub/new-dir');
    expect(cc.moveFile).not.toHaveBeenCalled();
  });

  test('invalidates caches for both parent directories', async () => {
    const cc = makeCommandClient();
    const qc = makeQueryClient({
      getFileStat: jest.fn(async () => ({isDir: false, size: 100, mtime: 0})),
    });
    const provider = new SkyCmsFileSystemProvider(qc, cc);

    // Prime the cache for both parent folders
    await provider.readDirectory(makeUri('/pub/a'));
    await provider.readDirectory(makeUri('/pub/b'));
    expect(qc.getFilesList).toHaveBeenCalledTimes(2);

    // Rename from /pub/a/file.txt to /pub/b/file.txt
    await provider.rename(makeUri('/pub/a/file.txt'), makeUri('/pub/b/file.txt'), {overwrite: false});

    // Both parent caches should be invalidated
    await provider.readDirectory(makeUri('/pub/a'));
    await provider.readDirectory(makeUri('/pub/b'));
    expect(qc.getFilesList).toHaveBeenCalledTimes(4);
  });
});
