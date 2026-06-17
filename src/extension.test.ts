import {
  activate,
  assertFieldNode,
  assertArticleNode,
  assertLayoutNode,
  assertFileNode,
  getDocumentTitlePart,
  showError,
  toPersistedInputValue,
  validateDocumentContent,
  validateInputValue,
} from './extension';
import { HttpError } from './apiClient/http';

jest.mock('vscode', () => ({
  workspace: {
    getConfiguration: jest.fn(),
    registerTextDocumentContentProvider: jest.fn(() => ({ dispose: jest.fn() })),
    registerFileSystemProvider: jest.fn(() => ({ dispose: jest.fn() })),
    openTextDocument: jest.fn(),
    onWillSaveTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
    fs: {
      readFile: jest.fn(async () => new Uint8Array([104, 101, 108, 108, 111])),
      writeFile: jest.fn(async () => {}),
      stat: jest.fn(async () => ({ type: 1 /* File */, ctime: 0, mtime: 0, size: 100 })),
      readDirectory: jest.fn(async () => [] as [string, number][]),
    },
  },
  window: {
    createTreeView: jest.fn(() => ({
      onDidChangeSelection: jest.fn(() => ({ dispose: jest.fn() })),
      dispose: jest.fn(),
    })),
    createStatusBarItem: jest.fn(() => ({
      text: '',
      tooltip: '',
      command: undefined,
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
    })),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showInputBox: jest.fn(),
    showQuickPick: jest.fn(),
    showTextDocument: jest.fn(),
    showOpenDialog: jest.fn(),
    showSaveDialog: jest.fn(),
    registerUriHandler: jest.fn(() => ({ dispose: jest.fn() })),
    withProgress: jest.fn(async (_options: unknown, task: any) =>
      task({ report: jest.fn() }, { isCancellationRequested: false, onCancellationRequested: jest.fn() }),
    ),
  },
  commands: {
    registerCommand: jest.fn(),
    executeCommand: jest.fn(async () => undefined),
  },
  chat: {
    createChatParticipant: jest.fn(() => ({
      followupProvider: undefined,
      dispose: jest.fn(),
    })),
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ViewColumn: {
    Active: -1,
    Beside: -2,
    One: 1,
    Two: 2,
    Three: 3,
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
  Uri: {
    from: jest.fn((value: { scheme: string; path: string }) => ({
      scheme: value.scheme,
      path: value.path,
      authority: '',
      toString: () => `${value.scheme}:${value.path}`,
    })),
    parse: jest.fn((value: string) => ({
      toString: () => value,
    })),
    with: jest.fn((opts) => ({
      scheme: opts.scheme,
      path: opts.path,
    })),
    file: jest.fn((path: string) => ({ scheme: 'file', path, toString: () => `file://${path}` })),
    joinPath: jest.fn((base: { path: string }, ...segments: string[]) => ({
      scheme: 'file',
      path: [base.path, ...segments].join('/'),
      toString: () => `file://${[base.path, ...segments].join('/')}`,
    })),
  },
  env: {
    openExternal: jest.fn(async () => true),
    clipboard: {
      readText: jest.fn(async () => ''),
      writeText: jest.fn(async () => {}),
    },
  },
  FileType: {
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
    Unknown: 0,
  },
  languages: {
    setTextDocumentLanguage: jest.fn(),
  },
  FileSystemError: {
    FileNotFound: jest.fn((uri) => new Error(`File not found: ${uri}`)),
  },
}));

const mockAuthManagerInstance = {
  getToken: jest.fn(async () => undefined as string | undefined),
  startBrowserSignIn: jest.fn(async () => true),
  signOut: jest.fn(async () => {}),
  validateToken: jest.fn(async () => true),
  promptReauthIfNeeded: jest.fn(async () => undefined),
  onAuthStateChanged: jest.fn(() => ({ dispose: jest.fn() })),
};
jest.mock('./authManager', () => ({
  AuthManager: jest.fn(() => mockAuthManagerInstance),
}));

const mockProviderInstance = {
  refresh: jest.fn(),
  getTreeItem: jest.fn(),
  getChildren: jest.fn(async () => []),
};
jest.mock('./treeProvider', () => ({
  SkyCmsTreeProvider: jest.fn(() => mockProviderInstance),
  SkyCmsNode: class {
    public kind: string;

    public constructor(kind: string) {
      this.kind = kind;
    }
  },
}));

const mockDocumentProviderInstance = {
  provideTextDocumentContent: jest.fn(async () => ''),
};
jest.mock('./documentProvider', () => ({
  SkyCmsDocumentProvider: jest.fn(() => mockDocumentProviderInstance),
}));

const mockFieldFileSystemProviderInstance = {
  stat: jest.fn(),
  readFile: jest.fn(async () => new TextEncoder().encode('')),
  writeFile: jest.fn(async () => {}),
  readDirectory: jest.fn(),
  createDirectory: jest.fn(),
  delete: jest.fn(),
  rename: jest.fn(),
  watch: jest.fn(() => ({ dispose: jest.fn() })),
  notifyChanged: jest.fn(),
  onDidChangeFile: jest.fn(),
};
jest.mock('./fieldFileSystemProvider', () => ({
  SkyCmsFieldFileSystemProvider: jest.fn(() => mockFieldFileSystemProviderInstance),
}));

const mockFileSystemProviderInstance = {
  stat: jest.fn(),
  readDirectory: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  createDirectory: jest.fn(),
  delete: jest.fn(),
  rename: jest.fn(),
  watch: jest.fn(),
  pathToUri: jest.fn(),
  onDidChangeFile: { event: jest.fn() },
  refresh: jest.fn(),
};
jest.mock('./fileSystemProvider', () => ({
  SkyCmsFileSystemProvider: jest.fn(() => mockFileSystemProviderInstance),
  SKYCMS_PROTECTED_PATHS: new Set([
    '/pub',
    '/pub/article',
    '/pub/lib',
    '/pub/lib/ckeditor',
    '/',
  ]),
  SKYCMS_READ_ONLY_FILES: new Set([
    '/pub/lib/ckeditor/ckeditor5-content.css',
  ]),
}));

jest.mock('./apiClient/queries', () => ({
  SkyCmsQueryClient: jest.fn(() => ({
    startBrowserAuth: jest.fn(),
    getMe: jest.fn(),
    getLayouts: jest.fn(),
    getTemplates: jest.fn(),
    getArticles: jest.fn(),
    getDocumentFieldContent: jest.fn(),
    getInputFieldValue: jest.fn(),
    getFilesList: jest.fn(),
    getFileStat: jest.fn(async () => ({ size: 0, mtime: Date.now(), isDir: false, mimeType: 'text/plain' })),
  })),
}));

const mockCommandClientMethods = {
  completeBrowserAuth: jest.fn(),
  logout: jest.fn(),
  setDocumentFieldContent: jest.fn(async () => {}),
  setInputFieldValue: jest.fn(async () => {}),
  publishArticle: jest.fn(async () => {}),
  unpublishArticle: jest.fn(async () => {}),
  restoreArticle: jest.fn(async () => {}),
  createArticle: jest.fn(async () => ({ articleNumber: 42, title: 'New Article' })),
  createTemplate: jest.fn(async () => ({ templateId: 't-1', title: 'New Template 5', layoutNumber: 1 })),
  publishLayoutVersion: jest.fn(async () => {}),
  setDefaultLayoutVersion: jest.fn(async () => {}),
  duplicateLayoutVersion: jest.fn(async () => ({ layoutNumber: 1, version: 2 })),
  deleteFile: jest.fn(async () => {}),
  deleteFolder: jest.fn(async () => {}),
  createFolder: jest.fn(async () => {}),
  uploadFile: jest.fn(async () => {}),
  moveFile: jest.fn(async () => {}),
  moveFolder: jest.fn(async () => {}),
};

jest.mock('./apiClient/commands', () => ({
  SkyCmsCommandClient: jest.fn(() => mockCommandClientMethods),
}));

const mockSiteManagerInstance = {
  ensureInitialized: jest.fn(async () => {}),
  getActiveSite: jest.fn(async () => ({ id: 'site-1', name: 'Default', editorUrl: 'https://editor.example.com', publicUrl: undefined as string | undefined })),
  getTokenSecretKey: jest.fn(() => 'skycms.bearerToken.site-1'),
  getSites: jest.fn(async () => [{ id: 'site-1', name: 'Default', editorUrl: 'https://editor.example.com' }]),
  addSite: jest.fn(async () => ({ id: 'site-2', name: 'Second', editorUrl: 'https://editor2.example.com' })),
  setActiveSite: jest.fn(async () => ({ id: 'site-1', name: 'Default', editorUrl: 'https://editor.example.com' })),
  removeSite: jest.fn(async () => ({ id: 'site-1', name: 'Default', editorUrl: 'https://editor.example.com' })),
};

jest.mock('./siteManager', () => ({
  SiteManager: jest.fn(() => mockSiteManagerInstance),
}));

const vscode = require('vscode');

// Helpers to capture registered callbacks after activate()
function getCommandHandler(commandId: string): (...args: unknown[]) => unknown {
  const call = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
    ([id]: [string]) => id === commandId,
  );
  if (!call) throw new Error(`Command not registered: ${commandId}`);
  return call[1] as (...args: unknown[]) => unknown;
}


function makeContext() {
  return {
    secrets: { get: jest.fn(async () => undefined), store: jest.fn(), delete: jest.fn() },
    globalState: { get: jest.fn(), update: jest.fn(async () => {}) },
    subscriptions: [] as { dispose(): void }[],
  };
}

// ---------------------------------------------------------------------------
// validateInputValue
// ---------------------------------------------------------------------------
describe('validateInputValue', () => {
  test('allows any value for optional fields', () => {
    expect(validateInputValue('category', 'any text')).toBeUndefined();
    expect(validateInputValue('category', '')).toBeUndefined();
  });

  test('validates bannerImage as an http or https URL', () => {
    expect(validateInputValue('bannerImage', 'https://example.com/banner.jpg')).toBeUndefined();

    const result = validateInputValue('bannerImage', 'not-a-url');
    expect(result).toBeDefined();
    expect(result).toContain('URL');
  });

  test('returns error for empty title', () => {
    const result = validateInputValue('title', '');
    expect(result).toBeDefined();
    expect(result).toContain('required');
  });

  test('returns error for whitespace-only title', () => {
    const result = validateInputValue('title', '   ');
    expect(result).toBeDefined();
    expect(result).toContain('required');
  });

  test('allows non-empty title', () => {
    expect(validateInputValue('title', 'My Article')).toBeUndefined();
  });

  test('returns error for empty layoutName', () => {
    const result = validateInputValue('layoutName', '');
    expect(result).toBeDefined();
    expect(result).toContain('required');
  });

  test('allows non-empty layoutName', () => {
    expect(validateInputValue('layoutName', 'Default Layout')).toBeUndefined();
  });

  test('allows empty string for published (clears the value)', () => {
    expect(validateInputValue('published', '')).toBeUndefined();
    expect(validateInputValue('published', '   ')).toBeUndefined();
  });

  test('allows valid ISO 8601 dates for published', () => {
    expect(validateInputValue('published', '2026-01-01T00:00:00Z')).toBeUndefined();
    expect(validateInputValue('published', 'Jan 1 2026')).toBeUndefined();
  });

  test('returns error message for unparseable published value', () => {
    const result = validateInputValue('published', 'not-a-date');
    expect(result).toBeDefined();
    expect(result).toContain('ISO 8601');
  });
});

// ---------------------------------------------------------------------------
// getDocumentTitlePart
// ---------------------------------------------------------------------------
describe('getDocumentTitlePart', () => {
  test('returns generic Layout title for editable layout fields', () => {
    const title = getDocumentTitlePart({
      entityType: 'layouts',
      layoutVersionNumber: undefined,
      entityLabel: 'Some Long Layout Name',
    } as any);

    expect(title).toBe('Layout');
  });

  test('returns Layout Version N title for layout history fields', () => {
    const title = getDocumentTitlePart({
      entityType: 'layouts',
      layoutVersionNumber: 3,
      entityLabel: 'Some Long Layout Name',
    } as any);

    expect(title).toBe('Layout Version 3');
  });

  test('keeps entity label for non-layout fields', () => {
    const title = getDocumentTitlePart({
      entityType: 'articles',
      entityLabel: 'My Article',
    } as any);

    expect(title).toBe('My Article');
  });
});

// ---------------------------------------------------------------------------
// validateDocumentContent
// ---------------------------------------------------------------------------
describe('validateDocumentContent', () => {
  test('returns undefined for non-JS fields regardless of content', () => {
    expect(validateDocumentContent('content', '')).toBeUndefined();
    expect(validateDocumentContent('notes', 'any text')).toBeUndefined();
    expect(validateDocumentContent('introduction', '')).toBeUndefined();
  });

  test('validates HTML fields with basic tag matching', () => {
    expect(validateDocumentContent('head', '<div><span>Hi</span></div>')).toBeUndefined();
    expect(validateDocumentContent('footer', '<section><p>Footer</p></section>')).toBeUndefined();

    const result = validateDocumentContent('head', '<div><span>Hi</div>');
    expect(result).toBeDefined();
    expect(result).toContain('HTML syntax error');
  });

  test('returns undefined for empty JS fields (field is optional)', () => {
    expect(validateDocumentContent('headerJavaScript', '')).toBeUndefined();
    expect(validateDocumentContent('headerJavaScript', '   ')).toBeUndefined();
    expect(validateDocumentContent('footerJavaScript', '')).toBeUndefined();
  });

  test('returns undefined for valid JavaScript in headerJavaScript', () => {
    expect(validateDocumentContent('headerJavaScript', 'console.log("hello");')).toBeUndefined();
    expect(validateDocumentContent('headerJavaScript', 'var x = 1; function init() { return x; }')).toBeUndefined();
  });

  test('returns undefined for valid JavaScript in footerJavaScript', () => {
    expect(validateDocumentContent('footerJavaScript', 'window.onload = function() {};')).toBeUndefined();
  });

  test('returns error for invalid JavaScript in headerJavaScript', () => {
    const result = validateDocumentContent('headerJavaScript', 'function broken( {');
    expect(result).toBeDefined();
    expect(result).toContain('syntax error');
  });

  test('returns error for invalid JavaScript in footerJavaScript', () => {
    const result = validateDocumentContent('footerJavaScript', 'const x = ;');
    expect(result).toBeDefined();
    expect(result).toContain('syntax error');
  });
});

// ---------------------------------------------------------------------------
// toPersistedInputValue
// ---------------------------------------------------------------------------
describe('toPersistedInputValue', () => {
  test('returns null for empty published (clears the date)', () => {
    expect(toPersistedInputValue('published', '')).toBeNull();
    expect(toPersistedInputValue('published', '   ')).toBeNull();
  });

  test('converts valid published value to ISO string', () => {
    const result = toPersistedInputValue('published', '2026-06-15T12:00:00Z');
    expect(result).toBe(new Date('2026-06-15T12:00:00Z').toISOString());
  });

  test('returns the raw value unchanged for non-published fields', () => {
    expect(toPersistedInputValue('title', 'My Title')).toBe('My Title');
    expect(toPersistedInputValue('category', '')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// assertFieldNode
// ---------------------------------------------------------------------------
describe('assertFieldNode', () => {
  test('throws on null', () => {
    expect(() => assertFieldNode(null)).toThrow();
  });

  test('throws on non-object', () => {
    expect(() => assertFieldNode('string')).toThrow();
  });

  test('throws when kind is not field', () => {
    expect(() =>
      assertFieldNode({ kind: 'category', entityType: 'articles', entityId: '1', fieldKey: 'title' }),
    ).toThrow('Invalid SkyCMS field node.');
  });

  test('throws when required field properties are missing', () => {
    expect(() => assertFieldNode({ kind: 'field', entityType: 'articles', fieldKey: 'title' })).toThrow();
    expect(() => assertFieldNode({ kind: 'field', entityType: 'articles', entityId: '1' })).toThrow();
  });

  test('returns node when all required properties present', () => {
    const node = { kind: 'field', entityType: 'articles', entityId: '1', fieldKey: 'title', label: 'Title' };
    expect(assertFieldNode(node)).toBe(node);
  });
});

// ---------------------------------------------------------------------------
// showError
// ---------------------------------------------------------------------------
describe('showError', () => {
  beforeEach(() => jest.clearAllMocks());

  test('shows HTTP status for HttpError', () => {
    showError('Save failed.', new HttpError(403, 'Forbidden'));
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('do not have permission'),
    );
  });

  test('shows error message for generic Error', () => {
    showError('Something failed.', new Error('network timeout'));
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('network timeout'),
    );
  });

  test('shows prefix with message for unknown thrown value', () => {
    showError('Unknown error.', 42);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Unknown error.'),
    );
  });
});

// ---------------------------------------------------------------------------
// activate — registration smoke tests
// ---------------------------------------------------------------------------
describe('activate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
  });

  test('registers tree view', async () => {
    await activate(makeContext() as any);
    expect(vscode.window.createTreeView).toHaveBeenCalledWith(
      'skycmsExplorer',
      expect.objectContaining({ treeDataProvider: expect.anything() }),
    );
  });

  test('registers file system provider for skycms scheme', async () => {
    await activate(makeContext() as any);
    expect(vscode.workspace.registerFileSystemProvider).toHaveBeenCalledWith(
      'skycms',
      expect.anything(),
      expect.anything(),
    );
  });

  test('registers command handlers', async () => {
    await activate(makeContext() as any);
    const ids = (vscode.commands.registerCommand as jest.Mock).mock.calls.map(
      ([id]: [string]) => id,
    );
    expect(ids).toContain('skycms.signIn');
    expect(ids).toContain('skycms.signOut');
    expect(ids).toContain('skycms.addSite');
    expect(ids).toContain('skycms.switchSite');
    expect(ids).toContain('skycms.removeSite');
    expect(ids).toContain('skycms.manageSites');
    expect(ids).toContain('skycms.refresh');
    expect(ids).toContain('skycms.openField');
    expect(ids).toContain('skycms.preview');
    expect(ids).toContain('skycms.previewCurrent');
    expect(ids).toContain('skycms.publishArticle');
    expect(ids).toContain('skycms.unpublishArticle');
    expect(ids).toContain('skycms.restoreArticle');
    expect(ids).toContain('skycms.newArticle');
    expect(ids).toContain('skycms.newTemplate');
    expect(ids).toContain('skycms.publishLayoutVersion');
    expect(ids).toContain('skycms.setDefaultLayoutVersion');
    expect(ids).toContain('skycms.duplicateLayoutVersion');
    expect(ids).toContain('skycms.diffLayoutVersion');
    expect(ids).toContain('skycms.openFile');
    expect(ids).toContain('skycms.deleteFile');
    expect(ids).toContain('skycms.deleteFolder');
    expect(ids).toContain('skycms.uploadFile');
    expect(ids).toContain('skycms.newFolder');
    expect(ids).toContain('skycms.openDocs');
    expect(ids).toContain('skycms.switchFieldLanguage');
    expect(ids).toContain('skycms.openEditorSite');
    expect(ids).toContain('skycms.askSkyCms');
    expect(ids).toContain('skycms.searchContent');
    expect(ids).toContain('skycms.openRecentContent');
    expect(ids).toContain('skycms.togglePinnedContent');
    expect(ids).toContain('skycms.filterTree');
    expect(ids).toContain('skycms.clearTreeFilter');
  });

  test('registers the SkyCMS chat participant', async () => {
    await activate(makeContext() as any);
    expect(vscode.chat.createChatParticipant).toHaveBeenCalledWith(
      'skycms-explorer.skycms',
      expect.any(Function),
    );
  });

  test('does not warn when an active site is available', async () => {
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => '') });
    await activate(makeContext() as any);
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('No SkyCMS site is configured yet'),
    );
  });
});

// ---------------------------------------------------------------------------
// activate — signOut command handler
// ---------------------------------------------------------------------------
describe('skycms.signOut command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  test('shows information message on success', async () => {
    mockAuthManagerInstance.signOut.mockResolvedValue(undefined);

    const handler = getCommandHandler('skycms.signOut');
    await handler();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Signed out'),
    );
  });
});

// ---------------------------------------------------------------------------
// skycms.askSkyCms command
// ---------------------------------------------------------------------------
describe('skycms.askSkyCms command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  test('opens chat with a seeded @skycms query', async () => {
    const handler = getCommandHandler('skycms.askSkyCms');
    await handler();

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.chat.open', {
      query: '@skycms ',
      isPartialQuery: true,
    });
  });
});

// ---------------------------------------------------------------------------
// SkyCmsFieldFileSystemProvider handles field saves (replaces onWillSaveTextDocument)
// ---------------------------------------------------------------------------
describe('SkyCmsFieldFileSystemProvider registration', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  test('registers field file system provider for skycms scheme', () => {
    expect(vscode.workspace.registerFileSystemProvider).toHaveBeenCalledWith(
      'skycms',
      expect.anything(),
      expect.objectContaining({ isCaseSensitive: true }),
    );
  });

  test('does not register onWillSaveTextDocument for skycms scheme', () => {
    // Save is now handled by SkyCmsFieldFileSystemProvider.writeFile — no manual hook needed.
    const willSaveCalls = (vscode.workspace.onWillSaveTextDocument as jest.Mock).mock.calls;
    const skyomsCalls = willSaveCalls.filter(() => true); // all calls; there should be none for skycms
    expect(skyomsCalls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// assertArticleNode
// ---------------------------------------------------------------------------
describe('assertArticleNode', () => {
  test('throws on null', () => {
    expect(() => assertArticleNode(null)).toThrow();
  });

  test('throws on non-object', () => {
    expect(() => assertArticleNode('string')).toThrow();
  });

  test('throws when kind is not article', () => {
    expect(() => assertArticleNode({ kind: 'layout', layout: { layoutNumber: 1, version: 1, name: 'L' } })).toThrow(
      'Invalid SkyCMS article node.',
    );
  });

  test('throws when article payload is missing', () => {
    expect(() => assertArticleNode({ kind: 'article' })).toThrow('Invalid SkyCMS article node.');
  });

  test('returns node when valid', () => {
    const node = { kind: 'article', article: { articleNumber: 5, title: 'Hello' } };
    expect(assertArticleNode(node)).toBe(node);
  });

  test('returns node when valid blog stream', () => {
    const node = { kind: 'blog-stream', article: { articleNumber: 9, title: 'Tech Blog' } };
    expect(assertArticleNode(node)).toBe(node);
  });
});

// ---------------------------------------------------------------------------
// assertLayoutNode
// ---------------------------------------------------------------------------
describe('assertLayoutNode', () => {
  test('throws on null', () => {
    expect(() => assertLayoutNode(null)).toThrow();
  });

  test('throws when kind is not layout', () => {
    expect(() => assertLayoutNode({ kind: 'article', article: { articleNumber: 1, title: 'A' } })).toThrow(
      'Invalid SkyCMS layout node.',
    );
  });

  test('throws when layout payload is missing', () => {
    expect(() => assertLayoutNode({ kind: 'layout' })).toThrow('Invalid SkyCMS layout node.');
  });

  test('returns node when valid', () => {
    const node = { kind: 'layout', layout: { layoutNumber: 1, version: 1, name: 'Base' } };
    expect(assertLayoutNode(node)).toBe(node);
  });
});

// ---------------------------------------------------------------------------
// Phase 3 — skycms.publishArticle
// ---------------------------------------------------------------------------
describe('skycms.publishArticle command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeArticleNode = () => ({
    kind: 'article',
    article: { articleNumber: 10, title: 'My Post' },
  });

  test('shows confirm dialog before publishing', async () => {
    vscode.window.showWarningMessage.mockResolvedValue('Publish');
    const handler = getCommandHandler('skycms.publishArticle');
    await handler(makeArticleNode());
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('My Post'),
      expect.anything(),
      'Publish',
    );
  });

  test('calls commandClient.publishArticle on confirm', async () => {
    vscode.window.showWarningMessage.mockResolvedValue('Publish');
    const handler = getCommandHandler('skycms.publishArticle');
    await handler(makeArticleNode());
    expect(mockCommandClientMethods.publishArticle).toHaveBeenCalledWith(10);
  });

  test('calls commandClient.publishArticle for blog stream node', async () => {
    vscode.window.showWarningMessage.mockResolvedValue('Publish');
    const handler = getCommandHandler('skycms.publishArticle');
    await handler({ kind: 'blog-stream', article: { articleNumber: 11, title: 'Tech Blog' } });
    expect(mockCommandClientMethods.publishArticle).toHaveBeenCalledWith(11);
  });

  test('refreshes tree after publishing', async () => {
    vscode.window.showWarningMessage.mockResolvedValue('Publish');
    const handler = getCommandHandler('skycms.publishArticle');
    await handler(makeArticleNode());
    expect(mockProviderInstance.refresh).toHaveBeenCalled();
  });

  test('does not call publishArticle if user cancels', async () => {
    vscode.window.showWarningMessage.mockResolvedValue(undefined);
    const handler = getCommandHandler('skycms.publishArticle');
    await handler(makeArticleNode());
    expect(mockCommandClientMethods.publishArticle).not.toHaveBeenCalled();
  });

  test('shows error on invalid node', async () => {
    const handler = getCommandHandler('skycms.publishArticle');
    await handler(null);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Phase 3 — skycms.unpublishArticle
// ---------------------------------------------------------------------------
describe('skycms.unpublishArticle command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeArticleNode = () => ({
    kind: 'article',
    article: { articleNumber: 7, title: 'Draft Post' },
  });

  test('calls commandClient.unpublishArticle on confirm', async () => {
    vscode.window.showWarningMessage.mockResolvedValue('Unpublish');
    const handler = getCommandHandler('skycms.unpublishArticle');
    await handler(makeArticleNode());
    expect(mockCommandClientMethods.unpublishArticle).toHaveBeenCalledWith(7);
  });

  test('calls commandClient.unpublishArticle for blog stream node', async () => {
    vscode.window.showWarningMessage.mockResolvedValue('Unpublish');
    const handler = getCommandHandler('skycms.unpublishArticle');
    await handler({ kind: 'blog-stream', article: { articleNumber: 12, title: 'Tech Blog' } });
    expect(mockCommandClientMethods.unpublishArticle).toHaveBeenCalledWith(12);
  });

  test('does not call unpublishArticle if cancelled', async () => {
    vscode.window.showWarningMessage.mockResolvedValue(undefined);
    const handler = getCommandHandler('skycms.unpublishArticle');
    await handler(makeArticleNode());
    expect(mockCommandClientMethods.unpublishArticle).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Phase 3 — skycms.restoreArticle
// ---------------------------------------------------------------------------
describe('skycms.restoreArticle command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  test('prompts for article number and restores on confirm', async () => {
    vscode.window.showInputBox.mockResolvedValue('17');
    const handler = getCommandHandler('skycms.restoreArticle');

    await handler();

    expect(mockCommandClientMethods.restoreArticle).toHaveBeenCalledWith(17);
    expect(mockProviderInstance.refresh).toHaveBeenCalled();
  });

  test('does not call restoreArticle if user cancels', async () => {
    vscode.window.showInputBox.mockResolvedValue(undefined);
    const handler = getCommandHandler('skycms.restoreArticle');

    await handler();

    expect(mockCommandClientMethods.restoreArticle).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Phase 3 — skycms.newArticle
// ---------------------------------------------------------------------------
describe('skycms.newArticle command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  test('prompts for title and creates article', async () => {
    vscode.window.showInputBox.mockResolvedValue('My New Article');
    const handler = getCommandHandler('skycms.newArticle');
    await handler();
    expect(mockCommandClientMethods.createArticle).toHaveBeenCalledWith('My New Article');
    expect(mockProviderInstance.refresh).toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('My New Article'),
    );
  });

  test('does not call createArticle if user cancels input', async () => {
    vscode.window.showInputBox.mockResolvedValue(undefined);
    const handler = getCommandHandler('skycms.newArticle');
    await handler();
    expect(mockCommandClientMethods.createArticle).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// skycms.newTemplate
// ---------------------------------------------------------------------------
describe('skycms.newTemplate command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  test('creates template and refreshes tree', async () => {
    const handler = getCommandHandler('skycms.newTemplate');
    await handler();

    expect(mockCommandClientMethods.createTemplate).toHaveBeenCalled();
    expect(mockProviderInstance.refresh).toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('New Template 5'),
    );
  });
});

// ---------------------------------------------------------------------------
// Phase 3 — skycms.publishLayoutVersion
// ---------------------------------------------------------------------------
describe('skycms.publishLayoutVersion command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeLayoutNode = () => ({
    kind: 'layout',
    layout: { layoutNumber: 3, version: 2, name: 'Main Layout' },
  });

  test('calls commandClient.publishLayoutVersion on confirm', async () => {
    vscode.window.showWarningMessage.mockResolvedValue('Publish');
    const handler = getCommandHandler('skycms.publishLayoutVersion');
    await handler(makeLayoutNode());
    expect(mockCommandClientMethods.publishLayoutVersion).toHaveBeenCalledWith(3, 2);
  });

  test('does not publish if cancelled', async () => {
    vscode.window.showWarningMessage.mockResolvedValue(undefined);
    const handler = getCommandHandler('skycms.publishLayoutVersion');
    await handler(makeLayoutNode());
    expect(mockCommandClientMethods.publishLayoutVersion).not.toHaveBeenCalled();
  });

  test('publishes selected history version from layout-version node', async () => {
    vscode.window.showWarningMessage.mockResolvedValue('Publish');
    const handler = getCommandHandler('skycms.publishLayoutVersion');
    await handler({
      kind: 'layout-version',
      layout: { layoutNumber: 3, version: 2, name: 'Main Layout' },
      layoutVersion: { layoutNumber: 3, version: 1, name: 'Main Layout' },
    });
    expect(mockCommandClientMethods.publishLayoutVersion).toHaveBeenCalledWith(3, 1);
  });
});

// ---------------------------------------------------------------------------
// Phase 4 — assertFileNode
// ---------------------------------------------------------------------------
describe('assertFileNode', () => {
  test('throws on null', () => {
    expect(() => assertFileNode(null)).toThrow();
  });

  test('throws on non-object', () => {
    expect(() => assertFileNode('string')).toThrow();
  });

  test('throws when kind is not file or folder', () => {
    expect(() => assertFileNode({ kind: 'article', article: { articleNumber: 1, title: 'A' } })).toThrow(
      'Invalid SkyCMS file node.',
    );
  });

  test('throws when path is missing', () => {
    expect(() => assertFileNode({ kind: 'file' })).toThrow('Invalid SkyCMS file node.');
  });

  test('returns node when valid file node', () => {
    const node = { kind: 'file', path: '/pub/file.txt', isDir: false };
    expect(assertFileNode(node)).toBe(node);
  });

  test('returns node when valid folder node', () => {
    const node = { kind: 'folder', path: '/pub/images', isDir: true };
    expect(assertFileNode(node)).toBe(node);
  });
});

// ---------------------------------------------------------------------------
// Phase 4 — skycms.openFile
// ---------------------------------------------------------------------------
describe('skycms.openFile command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeFileNode = () => ({
    kind: 'file',
    path: '/pub/document.txt',
    isDir: false,
  });

  test('shows error if node is a folder', async () => {
    const folderNode = { kind: 'folder', path: '/pub/images', isDir: true };
    const handler = getCommandHandler('skycms.openFile');
    await handler(folderNode);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Cannot open a folder'),
    );
  });

  test('opens file when valid file node is provided', async () => {
    vscode.workspace.openTextDocument.mockResolvedValue({ uri: { scheme: 'skycms-blob' } });
    vscode.window.showTextDocument.mockResolvedValue({} as any);
    const handler = getCommandHandler('skycms.openFile');
    await handler(makeFileNode());
    expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
    expect(vscode.window.showTextDocument).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Phase 5 — skycms.deleteFile
// ---------------------------------------------------------------------------
describe('skycms.deleteFile command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeFileNode = () => ({
    kind: 'file',
    label: 'document.txt',
    path: '/pub/document.txt',
    isDir: false,
  });

  test('calls deleteFile on confirm and refreshes', async () => {
    vscode.window.showWarningMessage.mockResolvedValue('Delete');
    const handler = getCommandHandler('skycms.deleteFile');
    await handler(makeFileNode());
    expect(mockCommandClientMethods.deleteFile).toHaveBeenCalledWith('/pub/document.txt');
    expect(mockProviderInstance.refresh).toHaveBeenCalled();
    expect(mockFileSystemProviderInstance.refresh).toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('deleted'));
  });

  test('does not delete when cancelled', async () => {
    vscode.window.showWarningMessage.mockResolvedValue(undefined);
    const handler = getCommandHandler('skycms.deleteFile');
    await handler(makeFileNode());
    expect(mockCommandClientMethods.deleteFile).not.toHaveBeenCalled();
  });

  test('shows error on invalid node', async () => {
    const handler = getCommandHandler('skycms.deleteFile');
    await handler(null);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Phase 5 — skycms.deleteFolder
// ---------------------------------------------------------------------------
describe('skycms.deleteFolder command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeFolderNode = () => ({
    kind: 'folder',
    label: 'images',
    path: '/pub/images',
    isDir: true,
  });

  test('calls deleteFolder on confirm and refreshes', async () => {
    vscode.window.showWarningMessage.mockResolvedValue('Delete');
    const handler = getCommandHandler('skycms.deleteFolder');
    await handler(makeFolderNode());
    expect(mockCommandClientMethods.deleteFolder).toHaveBeenCalledWith('/pub/images');
    expect(mockProviderInstance.refresh).toHaveBeenCalled();
    expect(mockFileSystemProviderInstance.refresh).toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('deleted'));
  });

  test('does not delete when cancelled', async () => {
    vscode.window.showWarningMessage.mockResolvedValue(undefined);
    const handler = getCommandHandler('skycms.deleteFolder');
    await handler(makeFolderNode());
    expect(mockCommandClientMethods.deleteFolder).not.toHaveBeenCalled();
  });

  test('shows error on invalid node', async () => {
    const handler = getCommandHandler('skycms.deleteFolder');
    await handler(null);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Phase 5 — skycms.uploadFile
// ---------------------------------------------------------------------------
describe('skycms.uploadFile command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeFolderNode = () => ({
    kind: 'folder',
    label: 'images',
    path: '/pub/images',
    isDir: true,
  });

  test('uploads selected file and refreshes', async () => {
    const fakeUri = { path: '/home/user/photo.jpg', scheme: 'file' };
    vscode.window.showOpenDialog.mockResolvedValue([fakeUri]);
    vscode.workspace.fs.readFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const handler = getCommandHandler('skycms.uploadFile');
    await handler(makeFolderNode());
    expect(mockCommandClientMethods.uploadFile).toHaveBeenCalledWith(
      '/pub/images/photo.jpg',
      expect.any(Uint8Array),
    );
    expect(mockProviderInstance.refresh).toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('uploaded'));
  });

  test('does nothing when dialog is cancelled', async () => {
    vscode.window.showOpenDialog.mockResolvedValue([]);
    const handler = getCommandHandler('skycms.uploadFile');
    await handler(makeFolderNode());
    expect(mockCommandClientMethods.uploadFile).not.toHaveBeenCalled();
  });

  test('treats null node as Files root', async () => {
    const fakeUri = { path: '/home/user/root.txt', scheme: 'file' };
    vscode.window.showOpenDialog.mockResolvedValue([fakeUri]);
    vscode.workspace.fs.readFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const handler = getCommandHandler('skycms.uploadFile');
    await handler(null);
    expect(mockCommandClientMethods.uploadFile).toHaveBeenCalledWith(
      '/root.txt',
      expect.any(Uint8Array),
    );
  });
});

// ---------------------------------------------------------------------------
// Phase 5 — skycms.newFolder
// ---------------------------------------------------------------------------
describe('skycms.newFolder command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeFolderNode = () => ({
    kind: 'folder',
    label: 'images',
    path: '/pub/images',
    isDir: true,
  });

  test('creates folder with entered name and refreshes', async () => {
    vscode.window.showInputBox.mockResolvedValue('thumbnails');
    const handler = getCommandHandler('skycms.newFolder');
    await handler(makeFolderNode());
    expect(mockCommandClientMethods.createFolder).toHaveBeenCalledWith('/pub/images/thumbnails');
    expect(mockProviderInstance.refresh).toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('created'));
  });

  test('does nothing when input is cancelled', async () => {
    vscode.window.showInputBox.mockResolvedValue(undefined);
    const handler = getCommandHandler('skycms.newFolder');
    await handler(makeFolderNode());
    expect(mockCommandClientMethods.createFolder).not.toHaveBeenCalled();
  });

  test('treats null node as Files root', async () => {
    vscode.window.showInputBox.mockResolvedValue('root-folder');
    const handler = getCommandHandler('skycms.newFolder');
    await handler(null);
    expect(mockCommandClientMethods.createFolder).toHaveBeenCalledWith('/root-folder');
  });
});

// ---------------------------------------------------------------------------
// Phase 3 — skycms.setDefaultLayoutVersion
// ---------------------------------------------------------------------------
describe('skycms.setDefaultLayoutVersion command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeLayoutNode = () => ({
    kind: 'layout',
    layout: { layoutNumber: 3, version: 2, name: 'Main Layout' },
  });

  test('calls setDefaultLayoutVersion on confirm', async () => {
    vscode.window.showWarningMessage.mockResolvedValue('Set Default');
    const handler = getCommandHandler('skycms.setDefaultLayoutVersion');
    await handler(makeLayoutNode());
    expect(mockCommandClientMethods.setDefaultLayoutVersion).toHaveBeenCalledWith(3, 2);
  });

  test('does not call setDefaultLayoutVersion if cancelled', async () => {
    vscode.window.showWarningMessage.mockResolvedValue(undefined);
    const handler = getCommandHandler('skycms.setDefaultLayoutVersion');
    await handler(makeLayoutNode());
    expect(mockCommandClientMethods.setDefaultLayoutVersion).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Phase 3 — skycms.duplicateLayoutVersion
// ---------------------------------------------------------------------------
describe('skycms.duplicateLayoutVersion command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeLayoutNode = () => ({
    kind: 'layout',
    layout: { layoutNumber: 3, version: 1, name: 'Main Layout' },
  });

  test('calls duplicateLayoutVersion and refreshes tree', async () => {
    const handler = getCommandHandler('skycms.duplicateLayoutVersion');
    await handler(makeLayoutNode());
    expect(mockCommandClientMethods.duplicateLayoutVersion).toHaveBeenCalledWith(3);
    expect(mockProviderInstance.refresh).toHaveBeenCalled();
  });

  test('shows success message with new version number', async () => {
    const handler = getCommandHandler('skycms.duplicateLayoutVersion');
    await handler(makeLayoutNode());
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('version 2'),
    );
  });

  test('shows error on invalid node', async () => {
    const handler = getCommandHandler('skycms.duplicateLayoutVersion');
    await handler(null);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Phase 3 — skycms.diffLayoutVersion
// ---------------------------------------------------------------------------
describe('skycms.diffLayoutVersion command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeLayoutVersionNode = () => ({
    kind: 'layout-version',
    layout: { layoutNumber: 3, version: 2, name: 'Main Layout' },
    layoutVersion: { version: 2, notes: 'Version 2 notes', head: '<div>Head</div>', header: '<div>Header</div>', footer: '<div>Footer</div>' },
  });

  test('opens a diff editor for the selected layout field', async () => {
    vscode.window.showQuickPick.mockResolvedValue({ label: 'Header', fieldKey: 'header' });
    const handler = getCommandHandler('skycms.diffLayoutVersion');

    await handler(makeLayoutVersionNode());

    const diffCall = (vscode.commands.executeCommand as jest.Mock).mock.calls.find(
      ([commandId]: [string]) => commandId === 'vscode.diff',
    );

    expect(diffCall).toBeDefined();
    expect(diffCall[3]).toBe('Layout: Header (v2 vs editable)');
    expect(diffCall[4]).toEqual({ preview: false });
    expect(String(diffCall[1].toString())).toContain('/layouts/3/2/header');
    expect(String(diffCall[2].toString())).toContain('/layouts/3/header');
  });

  test('does nothing when the field selection is cancelled', async () => {
    vscode.window.showQuickPick.mockResolvedValue(undefined);
    const handler = getCommandHandler('skycms.diffLayoutVersion');

    await handler(makeLayoutVersionNode());

    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('vscode.diff', expect.anything(), expect.anything(), expect.anything(), expect.anything());
  });
});

// ---------------------------------------------------------------------------
// Phase 3 — skycms.diffArticleVersion
// ---------------------------------------------------------------------------
describe('skycms.diffArticleVersion command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeArticleVersionNode = () => {
    const { SkyCmsNode } = require('./treeProvider');
    const node = new SkyCmsNode('article-version');
    node.article = { articleNumber: 42, title: 'Draft Article' };
    node.articleVersion = { versionNumber: 7, versionId: '11111111-1111-1111-1111-111111111111' };
    return node;
  };

  test('opens a diff editor for the selected article field', async () => {
    vscode.window.showQuickPick.mockResolvedValue({ label: 'Body', fieldKey: 'content' });
    const handler = getCommandHandler('skycms.diffArticleVersion');

    await handler(makeArticleVersionNode());

    const diffCall = (vscode.commands.executeCommand as jest.Mock).mock.calls.find(
      ([commandId]: [string]) => commandId === 'vscode.diff',
    );

    expect(diffCall).toBeDefined();
    expect(diffCall[3]).toBe('Draft Article: Body (v7 vs draft)');
    expect(diffCall[4]).toEqual({ preview: false });
    expect(String(diffCall[1].toString())).toContain('/articles/42/11111111-1111-1111-1111-111111111111/content');
    expect(String(diffCall[2].toString())).toContain('/articles/42/content');
  });

  test('does nothing when the field selection is cancelled', async () => {
    vscode.window.showQuickPick.mockResolvedValue(undefined);
    const handler = getCommandHandler('skycms.diffArticleVersion');

    await handler(makeArticleVersionNode());

    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('vscode.diff', expect.anything(), expect.anything(), expect.anything(), expect.anything());
  });
});

// ---------------------------------------------------------------------------
// Protected paths — skycms.deleteFolder
// ---------------------------------------------------------------------------
describe('skycms.deleteFolder — protected paths', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeProtectedNode = (path: string) => ({
    kind: 'folder',
    label: path.split('/').pop(),
    path,
    isDir: true,
  });

  test('blocks deletion of /pub and shows error', async () => {
    const handler = getCommandHandler('skycms.deleteFolder');
    await handler(makeProtectedNode('/pub'));
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('/pub'));
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    expect(mockCommandClientMethods.deleteFolder).not.toHaveBeenCalled();
  });

  test('blocks deletion of /pub/article and shows error', async () => {
    const handler = getCommandHandler('skycms.deleteFolder');
    await handler(makeProtectedNode('/pub/article'));
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('/pub/article'));
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    expect(mockCommandClientMethods.deleteFolder).not.toHaveBeenCalled();
  });

  test('allows deletion of non-protected folders', async () => {
    vscode.window.showWarningMessage.mockResolvedValue('Delete');
    const handler = getCommandHandler('skycms.deleteFolder');
    await handler(makeProtectedNode('/pub/images'));
    expect(mockCommandClientMethods.deleteFolder).toHaveBeenCalledWith('/pub/images');
  });
});

// ---------------------------------------------------------------------------
// skycms.pasteFromClipboard — single file
// ---------------------------------------------------------------------------
describe('skycms.pasteFromClipboard — single file', () => {
  const makeFolderNode = () => ({
    kind: 'folder',
    label: 'images',
    path: '/pub/images',
    isDir: true,
  });

  const makeFilesCategoryNode = () => ({
    kind: 'files-category',
    label: 'Files',
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
    vscode.Uri.file.mockImplementation((path: string) => ({ scheme: 'file', path, toString: () => `file://${path}` }));
    // Default: clipboard holds a file path
    vscode.env.clipboard.readText.mockResolvedValue('/home/user/photo.jpg');
    // Default: stat resolves as a regular file
    vscode.workspace.fs.stat.mockResolvedValue({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 100 });
    vscode.workspace.fs.readFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  test('uploads file to target folder and refreshes', async () => {
    const handler = getCommandHandler('skycms.pasteFromClipboard');
    await handler(makeFolderNode());
    expect(mockCommandClientMethods.uploadFile).toHaveBeenCalledWith(
      '/pub/images/photo.jpg',
      expect.any(Uint8Array),
    );
    expect(mockProviderInstance.refresh).toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('uploaded'));
  });

  test('uploads file to Files root (files-category) and refreshes', async () => {
    const handler = getCommandHandler('skycms.pasteFromClipboard');
    await handler(makeFilesCategoryNode());
    expect(mockCommandClientMethods.uploadFile).toHaveBeenCalledWith(
      '/photo.jpg',
      expect.any(Uint8Array),
    );
    expect(mockProviderInstance.refresh).toHaveBeenCalled();
  });

  test('strips surrounding quotes from clipboard path (Windows style)', async () => {
    vscode.env.clipboard.readText.mockResolvedValue('"C:\\Users\\user\\photo.jpg"');
    vscode.Uri.file.mockImplementation((path: string) => ({ scheme: 'file', path, toString: () => `file://${path}` }));
    const handler = getCommandHandler('skycms.pasteFromClipboard');
    await handler(makeFolderNode());
    // Should not error — the quotes were stripped and a valid URI was constructed
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalledWith(expect.stringContaining('Cannot read'));
    expect(mockCommandClientMethods.uploadFile).toHaveBeenCalled();
  });

  test('shows warning when clipboard is empty', async () => {
    vscode.env.clipboard.readText.mockResolvedValue('   ');
    const handler = getCommandHandler('skycms.pasteFromClipboard');
    await handler(makeFolderNode());
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('Copy Path'));
    expect(mockCommandClientMethods.uploadFile).not.toHaveBeenCalled();
  });

  test('shows error when local path cannot be statted', async () => {
    vscode.workspace.fs.stat.mockRejectedValue(new Error('File not found'));
    const handler = getCommandHandler('skycms.pasteFromClipboard');
    await handler(makeFolderNode());
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Cannot read'));
    expect(mockCommandClientMethods.uploadFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// skycms.pasteFromClipboard — folder (recursive upload)
// ---------------------------------------------------------------------------
describe('skycms.pasteFromClipboard — folder recursive upload', () => {
  const makeTargetFolderNode = () => ({
    kind: 'folder',
    label: 'assets',
    path: '/pub/assets',
    isDir: true,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);

    const srcBase = { scheme: 'file', path: '/home/user/myfolder', toString: () => 'file:///home/user/myfolder' };
    const srcChild = { scheme: 'file', path: '/home/user/myfolder/img.png', toString: () => 'file:///home/user/myfolder/img.png' };
    vscode.Uri.file.mockReturnValue(srcBase);
    vscode.Uri.joinPath.mockReturnValue(srcChild);

    vscode.env.clipboard.readText.mockResolvedValue('/home/user/myfolder');
    // First stat = Directory; subsequent stats for children handled by readDirectory
    vscode.workspace.fs.stat.mockResolvedValue({ type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 });
    // Directory contains one file
    vscode.workspace.fs.readDirectory.mockResolvedValue([['img.png', vscode.FileType.File]]);
    vscode.workspace.fs.readFile.mockResolvedValue(new Uint8Array([0xff, 0xd8]));
  });

  test('creates destination folder and uploads contained files', async () => {
    const handler = getCommandHandler('skycms.pasteFromClipboard');
    await handler(makeTargetFolderNode());

    expect(mockCommandClientMethods.createFolder).toHaveBeenCalledWith('/pub/assets/myfolder');
    expect(mockCommandClientMethods.uploadFile).toHaveBeenCalledWith(
      '/pub/assets/myfolder/img.png',
      expect.any(Uint8Array),
    );
    expect(mockProviderInstance.refresh).toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('1 file'));
  });

  test('reports plural file count when multiple files uploaded', async () => {
    const srcBase = { scheme: 'file', path: '/home/user/myfolder', toString: () => 'file:///home/user/myfolder' };
    vscode.Uri.file.mockReturnValue(srcBase);
    vscode.Uri.joinPath.mockReturnValue({ scheme: 'file', path: '/home/user/myfolder/x', toString: () => 'file:///home/user/myfolder/x' });
    vscode.workspace.fs.readDirectory.mockResolvedValue([
      ['a.txt', vscode.FileType.File],
      ['b.txt', vscode.FileType.File],
      ['c.txt', vscode.FileType.File],
    ]);
    vscode.workspace.fs.readFile.mockResolvedValue(new Uint8Array([1]));

    const handler = getCommandHandler('skycms.pasteFromClipboard');
    await handler(makeTargetFolderNode());

    expect(mockCommandClientMethods.uploadFile).toHaveBeenCalledTimes(3);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('3 files'));
  });
});

// ---------------------------------------------------------------------------
// skycms.deleteFile — read-only system file protection
// ---------------------------------------------------------------------------
describe('skycms.deleteFile — read-only system file protection', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeReadOnlyFileNode = (path: string) => ({
    kind: 'file',
    label: path.split('/').pop(),
    path,
    isDir: false,
  });

  test.each([
    ['/pub/lib/ckeditor/ckeditor5-content.css'],
  ])(
    'blocks deletion of %s and shows error',
    async (readOnlyPath) => {
      const handler = getCommandHandler('skycms.deleteFile');
      await handler(makeReadOnlyFileNode(readOnlyPath));
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining(readOnlyPath));
      expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
      expect(mockCommandClientMethods.deleteFile).not.toHaveBeenCalled();
    },
  );

  test('allows deleting non-system files', async () => {
    vscode.window.showWarningMessage.mockResolvedValue('Delete');
    const handler = getCommandHandler('skycms.deleteFile');
    await handler(makeReadOnlyFileNode('/pub/images/photo.jpg'));
    expect(mockCommandClientMethods.deleteFile).toHaveBeenCalledWith('/pub/images/photo.jpg');
  });
});

// ---------------------------------------------------------------------------
// skycms.deleteFolder — new protected folder paths
// ---------------------------------------------------------------------------
describe('skycms.deleteFolder — new protected folder paths', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeProtectedFolderNode = (path: string) => ({
    kind: 'folder',
    label: path.split('/').pop(),
    path,
    isDir: true,
  });

  test.each([
    ['/pub/lib'],
    ['/pub/lib/ckeditor'],
  ])(
    'blocks deletion of %s and shows error',
    async (protectedPath) => {
      const handler = getCommandHandler('skycms.deleteFolder');
      await handler(makeProtectedFolderNode(protectedPath));
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining(protectedPath));
      expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
      expect(mockCommandClientMethods.deleteFolder).not.toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------
// skycms.copyPublicPath command
// ---------------------------------------------------------------------------
describe('skycms.copyPublicPath command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    // Default: site has a publicUrl
    mockSiteManagerInstance.getActiveSite.mockResolvedValue({
      id: 'site-1',
      name: 'Default',
      editorUrl: 'https://editor.example.com',
      publicUrl: 'https://www.acme.com',
    });
    await activate(makeContext() as any);
  });

  const makeFileNode = () => ({
    kind: 'file',
    label: 'helloworld.txt',
    path: '/pub/helloworld.txt',
    isDir: false,
  });

  const makeFolderNode = () => ({
    kind: 'folder',
    label: 'images',
    path: '/pub/images',
    isDir: true,
  });

  test('copies the public URL for a file node', async () => {
    const handler = getCommandHandler('skycms.copyPublicPath');
    await handler(makeFileNode());
    expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('https://www.acme.com/pub/helloworld.txt');
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('https://www.acme.com/pub/helloworld.txt'),
    );
  });

  test('copies the public URL for a folder node', async () => {
    const handler = getCommandHandler('skycms.copyPublicPath');
    await handler(makeFolderNode());
    expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('https://www.acme.com/pub/images');
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('https://www.acme.com/pub/images'),
    );
  });

  test('strips trailing slash from publicUrl before joining', async () => {
    mockSiteManagerInstance.getActiveSite.mockResolvedValue({
      id: 'site-1',
      name: 'Default',
      editorUrl: 'https://editor.example.com',
      publicUrl: 'https://www.acme.com/',
    });
    const handler = getCommandHandler('skycms.copyPublicPath');
    await handler(makeFileNode());
    expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('https://www.acme.com/pub/helloworld.txt');
  });

  test('shows warning when publicUrl is not configured', async () => {
    mockSiteManagerInstance.getActiveSite.mockResolvedValue({
      id: 'site-1',
      name: 'Default',
      editorUrl: 'https://editor.example.com',
      publicUrl: undefined,
    });
    const handler = getCommandHandler('skycms.copyPublicPath');
    await handler(makeFileNode());
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('Public URL'));
    expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
  });

  test('shows error on invalid node', async () => {
    const handler = getCommandHandler('skycms.copyPublicPath');
    await handler(null);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// skycms.uploadFile — accepts filesCategoryNode
// ---------------------------------------------------------------------------
describe('skycms.uploadFile — filesCategoryNode', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeFilesCategoryNode = () => ({
    kind: 'files-category',
    label: 'Files',
  });

  test('uploads to root path / when node is filesCategoryNode', async () => {
    const fakeUri = { path: '/home/user/readme.txt', scheme: 'file' };
    vscode.window.showOpenDialog.mockResolvedValue([fakeUri]);
    vscode.workspace.fs.readFile.mockResolvedValue(new Uint8Array([0x68, 0x69]));
    const handler = getCommandHandler('skycms.uploadFile');
    await handler(makeFilesCategoryNode());
    expect(mockCommandClientMethods.uploadFile).toHaveBeenCalledWith('/readme.txt', expect.any(Uint8Array));
  });
});

// ---------------------------------------------------------------------------
// skycms.newFolder — accepts filesCategoryNode
// ---------------------------------------------------------------------------
describe('skycms.newFolder — filesCategoryNode', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeFilesCategoryNode = () => ({
    kind: 'files-category',
    label: 'Files',
  });

  test('creates folder at root when node is filesCategoryNode', async () => {
    vscode.window.showInputBox.mockResolvedValue('uploads');
    const handler = getCommandHandler('skycms.newFolder');
    await handler(makeFilesCategoryNode());
    expect(mockCommandClientMethods.createFolder).toHaveBeenCalledWith('/uploads');
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('created'));
  });
});

// ---------------------------------------------------------------------------
// skycms.openFileManager command
// ---------------------------------------------------------------------------
describe('skycms.openFileManager command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
    vscode.Uri.parse.mockImplementation((url: string) => ({ scheme: 'https', toString: () => url }));
  });

  const makeFilesCategoryNode = () => ({ kind: 'files-category', label: 'Files' });
  const makeFolderNode = () => ({ kind: 'folder', label: 'images', path: '/pub/images', isDir: true });

  test('opens file manager URL for filesCategoryNode (defaults to /pub)', async () => {
    const handler = getCommandHandler('skycms.openFileManager');
    await handler(makeFilesCategoryNode());
    expect(vscode.env.openExternal).toHaveBeenCalledWith(
      expect.objectContaining({ toString: expect.any(Function) }),
    );
    const calledUrl = (vscode.Uri.parse as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('https://editor.example.com/FileManager');
    expect(calledUrl).toContain('target=%2Fpub');
  });

  test('opens file manager URL for folderNode with correct path', async () => {
    const handler = getCommandHandler('skycms.openFileManager');
    await handler(makeFolderNode());
    const calledUrl = (vscode.Uri.parse as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('target=%2Fpub%2Fimages');
    expect(calledUrl).toContain('elf_l1_');
  });
});

// ---------------------------------------------------------------------------
// skycms.openOnWeb command
// ---------------------------------------------------------------------------
describe('skycms.openOnWeb command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    mockSiteManagerInstance.getActiveSite.mockResolvedValue({
      id: 'site-1',
      name: 'Default',
      editorUrl: 'https://editor.example.com',
      publicUrl: 'https://www.acme.com',
    });
    await activate(makeContext() as any);
    vscode.Uri.parse.mockImplementation((url: string) => ({ scheme: 'https', toString: () => url }));
  });

  const makeFileNode = () => ({
    kind: 'file',
    label: 'photo.jpg',
    path: '/pub/images/photo.jpg',
    isDir: false,
  });

  test('opens the public URL for the file node', async () => {
    const handler = getCommandHandler('skycms.openOnWeb');
    await handler(makeFileNode());
    const calledUrl = (vscode.Uri.parse as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toBe('https://www.acme.com/pub/images/photo.jpg');
    expect(vscode.env.openExternal).toHaveBeenCalled();
  });

  test('strips trailing slash from publicUrl', async () => {
    mockSiteManagerInstance.getActiveSite.mockResolvedValue({
      id: 'site-1', name: 'Default', editorUrl: 'https://editor.example.com', publicUrl: 'https://www.acme.com/',
    });
    const handler = getCommandHandler('skycms.openOnWeb');
    await handler(makeFileNode());
    const calledUrl = (vscode.Uri.parse as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toBe('https://www.acme.com/pub/images/photo.jpg');
  });

  test('shows warning when publicUrl is not configured', async () => {
    mockSiteManagerInstance.getActiveSite.mockResolvedValue({
      id: 'site-1', name: 'Default', editorUrl: 'https://editor.example.com', publicUrl: undefined,
    });
    const handler = getCommandHandler('skycms.openOnWeb');
    await handler(makeFileNode());
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('Public URL'));
    expect(vscode.env.openExternal).not.toHaveBeenCalled();
  });

  test('shows error on invalid node', async () => {
    const handler = getCommandHandler('skycms.openOnWeb');
    await handler(null);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    expect(vscode.env.openExternal).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// skycms.rename command
// ---------------------------------------------------------------------------
describe('skycms.rename command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeFileNode = () => ({
    kind: 'file',
    label: 'photo.jpg',
    path: '/pub/images/photo.jpg',
    isDir: false,
  });

  const makeFolderNode = () => ({
    kind: 'folder',
    label: 'images',
    path: '/pub/images',
    isDir: true,
  });

  test('renames a file and refreshes', async () => {
    vscode.window.showInputBox.mockResolvedValue('renamed.jpg');
    const handler = getCommandHandler('skycms.rename');
    await handler(makeFileNode());
    expect(mockCommandClientMethods.moveFile).toHaveBeenCalledWith(
      '/pub/images/photo.jpg',
      '/pub/images/renamed.jpg',
    );
    expect(mockProviderInstance.refresh).toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('renamed.jpg'));
  });

  test('renames a folder and refreshes', async () => {
    vscode.window.showInputBox.mockResolvedValue('photos');
    const handler = getCommandHandler('skycms.rename');
    await handler(makeFolderNode());
    expect(mockCommandClientMethods.moveFolder).toHaveBeenCalledWith('/pub/images', '/pub/photos');
    expect(mockProviderInstance.refresh).toHaveBeenCalled();
  });

  test('does nothing when input is cancelled', async () => {
    vscode.window.showInputBox.mockResolvedValue(undefined);
    const handler = getCommandHandler('skycms.rename');
    await handler(makeFileNode());
    expect(mockCommandClientMethods.moveFile).not.toHaveBeenCalled();
  });

  test('does nothing when new name is the same as current', async () => {
    vscode.window.showInputBox.mockResolvedValue('photo.jpg');
    const handler = getCommandHandler('skycms.rename');
    await handler(makeFileNode());
    expect(mockCommandClientMethods.moveFile).not.toHaveBeenCalled();
  });

  test('shows error on invalid node', async () => {
    const handler = getCommandHandler('skycms.rename');
    await handler(null);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    expect(mockCommandClientMethods.moveFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// skycms.cut command
// ---------------------------------------------------------------------------
describe('skycms.cut command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeFileNode = () => ({
    kind: 'file',
    label: 'photo.jpg',
    path: '/pub/images/photo.jpg',
    isDir: false,
  });

  test('shows info message after cutting a file', async () => {
    const handler = getCommandHandler('skycms.cut');
    await handler(makeFileNode());
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('cut'));
  });

  test('shows error on invalid node', async () => {
    const handler = getCommandHandler('skycms.cut');
    await handler(null);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// skycms.pasteFromClipboard — cut-move path
// ---------------------------------------------------------------------------
describe('skycms.pasteFromClipboard — cut-move', () => {
  const makeFileNode = () => ({
    kind: 'file',
    label: 'photo.jpg',
    path: '/pub/images/photo.jpg',
    isDir: false,
  });

  const makeFolderNode = () => ({
    kind: 'folder',
    label: 'images',
    path: '/pub/images',
    isDir: true,
  });

  const makeDestFolderNode = () => ({
    kind: 'folder',
    label: 'archive',
    path: '/pub/archive',
    isDir: true,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
    // Ensure clipboard doesn't trigger the normal upload path
    vscode.env.clipboard.readText.mockResolvedValue('');
  });

  test('moves a cut file to destination folder', async () => {
    // First cut the file
    const cutHandler = getCommandHandler('skycms.cut');
    await cutHandler(makeFileNode());

    // Then paste to destination
    const pasteHandler = getCommandHandler('skycms.pasteFromClipboard');
    await pasteHandler(makeDestFolderNode());

    expect(mockCommandClientMethods.moveFile).toHaveBeenCalledWith(
      '/pub/images/photo.jpg',
      '/pub/archive/photo.jpg',
    );
    expect(mockProviderInstance.refresh).toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('moved'));
  });

  test('moves a cut folder to destination folder', async () => {
    const cutHandler = getCommandHandler('skycms.cut');
    await cutHandler(makeFolderNode());

    const pasteHandler = getCommandHandler('skycms.pasteFromClipboard');
    await pasteHandler(makeDestFolderNode());

    expect(mockCommandClientMethods.moveFolder).toHaveBeenCalledWith(
      '/pub/images',
      '/pub/archive/images',
    );
    expect(mockProviderInstance.refresh).toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('moved'));
  });

  test('clears cut state after paste so second paste does normal clipboard upload', async () => {
    const cutHandler = getCommandHandler('skycms.cut');
    await cutHandler(makeFileNode());

    const pasteHandler = getCommandHandler('skycms.pasteFromClipboard');
    // First paste: performs move
    await pasteHandler(makeDestFolderNode());
    jest.clearAllMocks();
    vscode.env.clipboard.readText.mockResolvedValue('   ');

    // Second paste: cut clipboard is cleared, falls through to normal path (empty clipboard warning)
    await pasteHandler(makeDestFolderNode());
    expect(mockCommandClientMethods.moveFile).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('Copy Path'));
  });
});

// ---------------------------------------------------------------------------
// skycms.addToChat command
// ---------------------------------------------------------------------------
describe('skycms.addToChat command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  test('opens chat with file node query', async () => {
    const fileNode = { kind: 'file', label: 'photo.jpg', path: '/pub/images/photo.jpg' };
    const handler = getCommandHandler('skycms.addToChat');
    await handler(fileNode);
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.chat.open',
      expect.objectContaining({ query: expect.stringContaining('/pub/images/photo.jpg'), isPartialQuery: true }),
    );
  });

  test('opens chat with folder node query', async () => {
    const folderNode = { kind: 'folder', label: 'images', path: '/pub/images' };
    const handler = getCommandHandler('skycms.addToChat');
    await handler(folderNode);
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.chat.open',
      expect.objectContaining({ query: expect.stringContaining('/pub/images'), isPartialQuery: true }),
    );
  });

  test('opens chat with article node query including title', async () => {
    const articleNode = {
      kind: 'article',
      label: 'Hello World',
      article: { articleNumber: 42, title: 'Hello World' },
    };
    const handler = getCommandHandler('skycms.addToChat');
    await handler(articleNode);
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.chat.open',
      expect.objectContaining({ query: expect.stringContaining('Hello World'), isPartialQuery: true }),
    );
  });

  test('opens chat with layout node query', async () => {
    const layoutNode = {
      kind: 'layout',
      label: 'Main Layout',
      layout: { layoutNumber: 1, name: 'Main Layout' },
    };
    const handler = getCommandHandler('skycms.addToChat');
    await handler(layoutNode);
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.chat.open',
      expect.objectContaining({ query: expect.stringContaining('Main Layout'), isPartialQuery: true }),
    );
  });

  test('opens chat with root node query including site name', async () => {
    const rootNode = { kind: 'root', label: 'My Site' };
    const handler = getCommandHandler('skycms.addToChat');
    await handler(rootNode);
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.chat.open',
      expect.objectContaining({ query: expect.stringContaining('My Site'), isPartialQuery: true }),
    );
  });

  test('does nothing when node is null', async () => {
    const handler = getCommandHandler('skycms.addToChat');
    await handler(null);
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('workbench.action.chat.open', expect.anything());
  });
});

// ---------------------------------------------------------------------------
// skycms.newFile command
// ---------------------------------------------------------------------------
describe('skycms.newFile command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeFolderNode = () => ({
    kind: 'folder',
    label: 'images',
    path: '/pub/images',
    isDir: true,
  });

  const makeFilesCategoryNode = () => ({
    kind: 'files-category',
    label: 'Files',
  });

  test('creates an empty file inside a folder node', async () => {
    vscode.window.showInputBox.mockResolvedValue('banner.jpg');
    const handler = getCommandHandler('skycms.newFile');
    await handler(makeFolderNode());
    expect(mockCommandClientMethods.uploadFile).toHaveBeenCalledWith(
      '/pub/images/banner.jpg',
      expect.any(Uint8Array),
    );
    expect(mockProviderInstance.refresh).toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('created'));
  });

  test('creates file at root when node is filesCategoryNode', async () => {
    vscode.window.showInputBox.mockResolvedValue('index.html');
    const handler = getCommandHandler('skycms.newFile');
    await handler(makeFilesCategoryNode());
    expect(mockCommandClientMethods.uploadFile).toHaveBeenCalledWith(
      '/index.html',
      expect.any(Uint8Array),
    );
    expect(mockProviderInstance.refresh).toHaveBeenCalled();
  });

  test('does nothing when input is cancelled', async () => {
    vscode.window.showInputBox.mockResolvedValue(undefined);
    const handler = getCommandHandler('skycms.newFile');
    await handler(makeFolderNode());
    expect(mockCommandClientMethods.uploadFile).not.toHaveBeenCalled();
  });

  test('does nothing when input is empty string', async () => {
    vscode.window.showInputBox.mockResolvedValue('');
    const handler = getCommandHandler('skycms.newFile');
    await handler(makeFolderNode());
    expect(mockCommandClientMethods.uploadFile).not.toHaveBeenCalled();
  });

  test('shows error on invalid node kind', async () => {
    vscode.window.showInputBox.mockResolvedValue('file.txt');
    const handler = getCommandHandler('skycms.newFile');
    // articleNode is not a valid folder target
    await handler({ kind: 'article', label: 'Post' });
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    expect(mockCommandClientMethods.uploadFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// skycms.openToSide command
// ---------------------------------------------------------------------------
describe('skycms.openToSide command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeFileNode = () => ({
    kind: 'file',
    label: 'style.css',
    path: '/pub/style.css',
    isDir: false,
  });

  test('opens file in a side editor column', async () => {
    vscode.workspace.openTextDocument.mockResolvedValue({ uri: { scheme: 'skycms-blob' } });
    vscode.window.showTextDocument.mockResolvedValue({} as any);
    const handler = getCommandHandler('skycms.openToSide');
    await handler(makeFileNode());
    expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
    expect(vscode.window.showTextDocument).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ viewColumn: vscode.ViewColumn.Beside, preview: false }),
    );
  });

  test('shows error when node is a folder', async () => {
    const folderNode = { kind: 'folder', label: 'images', path: '/pub/images', isDir: true };
    const handler = getCommandHandler('skycms.openToSide');
    await handler(folderNode);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('folder'));
    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
  });

  test('shows error on invalid node', async () => {
    const handler = getCommandHandler('skycms.openToSide');
    await handler(null);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// skycms.copyCmsPath command
// ---------------------------------------------------------------------------
describe('skycms.copyCmsPath command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeFileNode = () => ({
    kind: 'file',
    label: 'photo.jpg',
    path: '/pub/images/photo.jpg',
    isDir: false,
  });

  const makeFolderNode = () => ({
    kind: 'folder',
    label: 'images',
    path: '/pub/images',
    isDir: true,
  });

  test('copies raw CMS path for a file node', async () => {
    const handler = getCommandHandler('skycms.copyCmsPath');
    await handler(makeFileNode());
    expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('/pub/images/photo.jpg');
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('/pub/images/photo.jpg'),
    );
  });

  test('copies raw CMS path for a folder node', async () => {
    const handler = getCommandHandler('skycms.copyCmsPath');
    await handler(makeFolderNode());
    expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('/pub/images');
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('/pub/images'),
    );
  });

  test('path does not contain a domain or protocol', async () => {
    const handler = getCommandHandler('skycms.copyCmsPath');
    await handler(makeFileNode());
    const [written] = (vscode.env.clipboard.writeText as jest.Mock).mock.calls[0];
    expect(written).not.toMatch(/^https?:\/\//);
  });

  test('shows error on invalid node', async () => {
    const handler = getCommandHandler('skycms.copyCmsPath');
    await handler(null);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// skycms.download command
// ---------------------------------------------------------------------------
describe('skycms.download command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.Uri.file.mockImplementation((path: string) => ({ scheme: 'file', path, toString: () => `file://${path}` }));
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
    vscode.window.showSaveDialog.mockResolvedValue({ scheme: 'file', path: '/local/photo.jpg' });
    vscode.workspace.fs.readFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mockFileSystemProviderInstance.pathToUri.mockReturnValue({ scheme: 'skycms-blob', path: '/pub/images/photo.jpg' });
  });

  const makeFileNode = () => ({
    kind: 'file',
    label: 'photo.jpg',
    path: '/pub/images/photo.jpg',
    isDir: false,
  });

  test('reads file and writes to local path when save confirmed', async () => {
    const handler = getCommandHandler('skycms.download');
    await handler(makeFileNode());
    expect(vscode.window.showSaveDialog).toHaveBeenCalled();
    expect(vscode.workspace.fs.readFile).toHaveBeenCalled();
    expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ scheme: 'file', path: '/local/photo.jpg' }),
      expect.any(Uint8Array),
    );
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('downloaded'));
  });

  test('does nothing when save dialog is cancelled', async () => {
    vscode.window.showSaveDialog.mockResolvedValue(undefined);
    const handler = getCommandHandler('skycms.download');
    await handler(makeFileNode());
    expect(vscode.workspace.fs.readFile).not.toHaveBeenCalled();
    expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
  });

  test('default save dialog filename matches file label', async () => {
    const handler = getCommandHandler('skycms.download');
    await handler(makeFileNode());
    expect(vscode.window.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultUri: expect.objectContaining({ path: expect.stringContaining('photo.jpg') }) }),
    );
  });

  test('shows error when node is a folder', async () => {
    const folderNode = { kind: 'folder', label: 'images', path: '/pub/images', isDir: true };
    const handler = getCommandHandler('skycms.download');
    await handler(folderNode);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Folder download'));
    expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
  });

  test('shows error on invalid node', async () => {
    const handler = getCommandHandler('skycms.download');
    await handler(null);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// skycms.copy command
// ---------------------------------------------------------------------------
describe('skycms.copy command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  const makeFileNode = () => ({
    kind: 'file',
    label: 'photo.jpg',
    path: '/pub/images/photo.jpg',
    isDir: false,
  });

  const makeFolderNode = () => ({
    kind: 'folder',
    label: 'images',
    path: '/pub/images',
    isDir: true,
  });

  test('shows info message after copying a file', async () => {
    const handler = getCommandHandler('skycms.copy');
    await handler(makeFileNode());
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('copied'));
  });

  test('shows info message after copying a folder', async () => {
    const handler = getCommandHandler('skycms.copy');
    await handler(makeFolderNode());
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('copied'));
  });

  test('shows error on invalid node', async () => {
    const handler = getCommandHandler('skycms.copy');
    await handler(null);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// skycms.pasteFromClipboard — copy path
// ---------------------------------------------------------------------------
describe('skycms.pasteFromClipboard — copy path', () => {
  const makeFileNode = () => ({
    kind: 'file',
    label: 'photo.jpg',
    path: '/pub/images/photo.jpg',
    isDir: false,
  });

  const makeFolderNode = () => ({
    kind: 'folder',
    label: 'images',
    path: '/pub/images',
    isDir: true,
  });

  const makeDestFolderNode = () => ({
    kind: 'folder',
    label: 'archive',
    path: '/pub/archive',
    isDir: true,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
    vscode.env.clipboard.readText.mockResolvedValue('');
    mockFileSystemProviderInstance.pathToUri.mockReturnValue({ scheme: 'skycms-blob', path: '/pub/images/photo.jpg' });
    vscode.workspace.fs.readFile.mockResolvedValue(new Uint8Array([10, 20, 30]));
  });

  test('duplicates a copied file to destination folder', async () => {
    const copyHandler = getCommandHandler('skycms.copy');
    await copyHandler(makeFileNode());

    const pasteHandler = getCommandHandler('skycms.pasteFromClipboard');
    await pasteHandler(makeDestFolderNode());

    expect(vscode.workspace.fs.readFile).toHaveBeenCalled();
    expect(mockCommandClientMethods.uploadFile).toHaveBeenCalledWith(
      '/pub/archive/photo.jpg',
      expect.any(Uint8Array),
    );
    expect(mockProviderInstance.refresh).toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('copied'));
  });

  test('copy clipboard persists after paste so a second paste also duplicates', async () => {
    const copyHandler = getCommandHandler('skycms.copy');
    await copyHandler(makeFileNode());

    const pasteHandler = getCommandHandler('skycms.pasteFromClipboard');
    await pasteHandler(makeDestFolderNode());
    jest.clearAllMocks();
    vscode.env.clipboard.readText.mockResolvedValue('');
    mockFileSystemProviderInstance.pathToUri.mockReturnValue({ scheme: 'skycms-blob', path: '/pub/images/photo.jpg' });
    vscode.workspace.fs.readFile.mockResolvedValue(new Uint8Array([10, 20, 30]));

    // Second paste: copy clipboard should still be set
    await pasteHandler(makeDestFolderNode());
    expect(mockCommandClientMethods.uploadFile).toHaveBeenCalledWith(
      '/pub/archive/photo.jpg',
      expect.any(Uint8Array),
    );
  });

  test('warns when trying to copy-paste a folder (not yet supported)', async () => {
    const copyHandler = getCommandHandler('skycms.copy');
    await copyHandler(makeFolderNode());

    const pasteHandler = getCommandHandler('skycms.pasteFromClipboard');
    await pasteHandler(makeDestFolderNode());

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('not yet supported'));
    expect(mockCommandClientMethods.uploadFile).not.toHaveBeenCalled();
  });

  test('warns when copy source and destination paths are identical', async () => {
    const copyHandler = getCommandHandler('skycms.copy');
    await copyHandler(makeFileNode());

    // Paste to the same folder the file already lives in
    const sameParentFolder = { kind: 'folder', label: 'images', path: '/pub/images', isDir: true };
    const pasteHandler = getCommandHandler('skycms.pasteFromClipboard');
    await pasteHandler(sameParentFolder);

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('same'));
    expect(mockCommandClientMethods.uploadFile).not.toHaveBeenCalled();
  });
});

