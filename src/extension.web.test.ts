import { activate } from './extension.web';

jest.mock('vscode', () => ({
  workspace: {
    getConfiguration: jest.fn(() => ({ get: jest.fn(() => '') })),
    registerFileSystemProvider: jest.fn(() => ({ dispose: jest.fn() })),
    openTextDocument: jest.fn(async () => ({ uri: { scheme: 'skycms' } })),
    fs: {
      readFile: jest.fn(async () => new Uint8Array([1, 2, 3])),
    },
  },
  window: {
    createTreeView: jest.fn(() => ({ dispose: jest.fn() })),
    registerUriHandler: jest.fn(() => ({ dispose: jest.fn() })),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showInputBox: jest.fn(),
    showQuickPick: jest.fn(),
    showTextDocument: jest.fn(),
    showOpenDialog: jest.fn(),
    activeTextEditor: undefined,
  },
  commands: {
    registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
    executeCommand: jest.fn(async () => undefined),
  },
  env: {
    openExternal: jest.fn(async () => true),
  },
  languages: {
    setTextDocumentLanguage: jest.fn(async () => undefined),
  },
  Uri: {
    parse: jest.fn((value: string) => ({
      path: (() => {
        try {
          const parsed = new URL(value);
          return parsed.pathname;
        } catch {
          return value;
        }
      })(),
      toString: () => value,
    })),
    from: jest.fn((value: { scheme: string; path: string }) => ({
      scheme: value.scheme,
      path: value.path,
      toString: () => `${value.scheme}:${value.path}`,
    })),
  },
}));

const mockCommandClient = {
  setInputFieldValue: jest.fn(async () => undefined),
  publishArticle: jest.fn(async () => undefined),
  unpublishArticle: jest.fn(async () => undefined),
  createArticle: jest.fn(async () => ({ articleNumber: 12, title: 'A' })),
  createTemplate: jest.fn(async () => ({ templateId: 't1', title: 'T', layoutNumber: 1 })),
  publishLayoutVersion: jest.fn(async () => undefined),
  setDefaultLayoutVersion: jest.fn(async () => undefined),
  duplicateLayoutVersion: jest.fn(async () => ({ layoutNumber: 5, version: 2 })),
  deleteFile: jest.fn(async () => undefined),
  deleteFolder: jest.fn(async () => undefined),
  uploadFile: jest.fn(async () => undefined),
  createFolder: jest.fn(async () => undefined),
};

jest.mock('./apiClient/commands', () => ({
  SkyCmsCommandClient: jest.fn(() => mockCommandClient),
}));

const mockQueryClient = {
  getInputFieldValue: jest.fn(async () => 'old title'),
  getFileStat: jest.fn(async () => ({ size: 10, mtime: Date.now(), isDir: false, mimeType: 'text/plain' })),
};

jest.mock('./apiClient/queries', () => ({
  SkyCmsQueryClient: jest.fn(() => mockQueryClient),
}));

const mockTreeProvider = {
  refresh: jest.fn(),
  refreshNode: jest.fn(),
};

jest.mock('./treeProvider', () => ({
  SkyCmsTreeProvider: jest.fn(() => mockTreeProvider),
  SkyCmsNode: class {
    public kind: string;
    public versionsLoadedCount?: number;

    public constructor(kind: string) {
      this.kind = kind;
    }
  },
}));

const mockFileSystemProvider = {
  refresh: jest.fn(),
  pathToUri: jest.fn((path: string) => ({ scheme: 'skycms-blob', path })),
};

jest.mock('./fileSystemProvider', () => ({
  SkyCmsFileSystemProvider: jest.fn(() => mockFileSystemProvider),
}));

jest.mock('./fieldFileSystemProvider', () => ({
  SkyCmsFieldFileSystemProvider: jest.fn(() => ({
    notifyChanged: jest.fn(),
  })),
}));

const mockAuthManager = {
  handleAuthCallback: jest.fn(),
  onAuthStateChanged: jest.fn((listener: () => Promise<void> | void) => {
    void listener;
    return { dispose: jest.fn() };
  }),
  startBrowserSignIn: jest.fn(async () => true),
  signOut: jest.fn(async () => undefined),
  validateToken: jest.fn(async () => true),
  promptReauthIfNeeded: jest.fn(async () => undefined),
};

jest.mock('./authManager', () => ({
  AuthManager: jest.fn(() => mockAuthManager),
}));

jest.mock('./siteManager', () => ({
  SiteManager: jest.fn(() => ({
    ensureInitialized: jest.fn(async () => undefined),
    getActiveSite: jest.fn(async () => ({
      id: 'site-1',
      name: 'Default Site',
      editorUrl: 'https://editor.example.com',
      publicUrl: 'https://public.example.com',
    })),
    getTokenSecretKey: jest.fn(() => 'token.site-1'),
    addSite: jest.fn(async () => ({ id: 'site-2', name: 'Second Site', editorUrl: 'https://editor2.example.com' })),
    setActiveSite: jest.fn(async () => ({ id: 'site-1', name: 'Default Site', editorUrl: 'https://editor.example.com' })),
    removeSite: jest.fn(async () => undefined),
    getSites: jest.fn(async () => [{ id: 'site-1', name: 'Default Site', editorUrl: 'https://editor.example.com' }]),
  })),
}));

const vscode = require('vscode');

function makeContext() {
  return {
    secrets: {
      get: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
      store: jest.fn(async () => undefined),
    },
    globalState: {
      get: jest.fn(),
      update: jest.fn(async () => undefined),
    },
    subscriptions: [] as Array<{ dispose(): void }>,
  };
}

function getCommandHandler(commandId: string): (...args: unknown[]) => unknown {
  const call = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(([id]: [string]) => id === commandId);
  if (!call) {
    throw new Error(`Command not registered: ${commandId}`);
  }

  return call[1] as (...args: unknown[]) => unknown;
}

describe('extension.web activation integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('registers web filesystem providers and editing commands', async () => {
    await activate(makeContext() as never);

    expect(vscode.workspace.registerFileSystemProvider).toHaveBeenCalledWith(
      'skycms',
      expect.anything(),
      { isCaseSensitive: true },
    );
    expect(vscode.workspace.registerFileSystemProvider).toHaveBeenCalledWith(
      'skycms-blob',
      expect.anything(),
      { isCaseSensitive: true },
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith('skycms.openField', expect.any(Function));
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith('skycms.publishArticle', expect.any(Function));
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith('skycms.uploadFile', expect.any(Function));
  });

  test('openField input command dispatches value update', async () => {
    const context = makeContext();
    await activate(context as never);

    (vscode.window.showInputBox as jest.Mock).mockResolvedValue('Updated title');

    const handler = getCommandHandler('skycms.openField');
    await handler({
      kind: 'field',
      label: 'Title',
      interactionMode: 'input',
      entityType: 'articles',
      entityId: '42',
      fieldKey: 'title',
      entityLabel: 'Article',
      isReadOnly: false,
    });

    expect(mockQueryClient.getInputFieldValue).toHaveBeenCalledWith('articles', '42', 'title');
    expect(mockCommandClient.setInputFieldValue).toHaveBeenCalledWith('articles', '42', 'title', 'Updated title');
    expect(mockTreeProvider.refresh).toHaveBeenCalled();
  });

  test('publishArticle command dispatches to command client', async () => {
    await activate(makeContext() as never);

    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Publish');

    const handler = getCommandHandler('skycms.publishArticle');
    await handler({
      kind: 'article',
      article: {
        articleNumber: 88,
        title: 'Published piece',
      },
    });

    expect(mockCommandClient.publishArticle).toHaveBeenCalledWith(88);
    expect(mockTreeProvider.refresh).toHaveBeenCalled();
  });

  test('uploadFile command reads local bytes and uploads destination path', async () => {
    await activate(makeContext() as never);

    (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([{ path: '/tmp/image.png' }]);

    const handler = getCommandHandler('skycms.uploadFile');
    await handler({
      kind: 'folder',
      label: 'images',
      path: '/pub/images',
      isDir: true,
    });

    expect(vscode.workspace.fs.readFile).toHaveBeenCalledWith({ path: '/tmp/image.png' });
    expect(mockCommandClient.uploadFile).toHaveBeenCalledWith('/pub/images/image.png', expect.any(Uint8Array));
    expect(mockFileSystemProvider.refresh).toHaveBeenCalled();
  });
});