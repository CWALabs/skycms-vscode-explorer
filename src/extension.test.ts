import {
  activate,
  assertFieldNode,
  assertArticleNode,
  assertLayoutNode,
  assertFileNode,
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
    },
  },
  window: {
    registerTreeDataProvider: jest.fn(() => ({ dispose: jest.fn() })),
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
  },
  commands: {
    registerCommand: jest.fn(),
    executeCommand: jest.fn(async () => undefined),
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
  Uri: {
    parse: jest.fn((value: string) => ({
      toString: () => value,
    })),
    with: jest.fn((opts) => ({
      scheme: opts.scheme,
      path: opts.path,
    })),
  },
  env: {
    openExternal: jest.fn(async () => true),
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
}));

const mockDocumentProviderInstance = {
  provideTextDocumentContent: jest.fn(async () => ''),
};
jest.mock('./documentProvider', () => ({
  SkyCmsDocumentProvider: jest.fn(() => mockDocumentProviderInstance),
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
  })),
}));

const mockCommandClientMethods = {
  completeBrowserAuth: jest.fn(),
  logout: jest.fn(),
  setDocumentFieldContent: jest.fn(async () => {}),
  setInputFieldValue: jest.fn(async () => {}),
  publishArticle: jest.fn(async () => {}),
  unpublishArticle: jest.fn(async () => {}),
  createArticle: jest.fn(async () => ({ articleNumber: 42, title: 'New Article' })),
  publishLayoutVersion: jest.fn(async () => {}),
  setDefaultLayoutVersion: jest.fn(async () => {}),
  duplicateLayoutVersion: jest.fn(async () => ({ layoutNumber: 1, version: 2 })),
  deleteFile: jest.fn(async () => {}),
  deleteFolder: jest.fn(async () => {}),
  createFolder: jest.fn(async () => {}),
  uploadFile: jest.fn(async () => {}),
};

jest.mock('./apiClient/commands', () => ({
  SkyCmsCommandClient: jest.fn(() => mockCommandClientMethods),
}));

jest.mock('./siteManager', () => ({
  SiteManager: jest.fn(() => ({
    ensureInitialized: jest.fn(async () => {}),
    getActiveSite: jest.fn(async () => ({ id: 'site-1', name: 'Default', editorUrl: 'https://editor.example.com' })),
    getTokenSecretKey: jest.fn(() => 'skycms.bearerToken.site-1'),
    getSites: jest.fn(async () => [{ id: 'site-1', name: 'Default', editorUrl: 'https://editor.example.com' }]),
    addSite: jest.fn(async () => ({ id: 'site-2', name: 'Second', editorUrl: 'https://editor2.example.com' })),
    setActiveSite: jest.fn(async () => ({ id: 'site-1', name: 'Default', editorUrl: 'https://editor.example.com' })),
    removeSite: jest.fn(async () => ({ id: 'site-1', name: 'Default', editorUrl: 'https://editor.example.com' })),
  })),
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

function getSaveHandler(): (e: unknown) => void {
  const call = (vscode.workspace.onWillSaveTextDocument as jest.Mock).mock.calls[0];
  return call[0] as (e: unknown) => void;
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
    expect(validateInputValue('bannerImage', 'not-a-date')).toBeUndefined();
    expect(validateInputValue('category', '')).toBeUndefined();
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
// validateDocumentContent
// ---------------------------------------------------------------------------
describe('validateDocumentContent', () => {
  test('returns undefined for non-JS fields regardless of content', () => {
    expect(validateDocumentContent('content', '')).toBeUndefined();
    expect(validateDocumentContent('head', '<script>broken(')).toBeUndefined();
    expect(validateDocumentContent('notes', 'any text')).toBeUndefined();
    expect(validateDocumentContent('introduction', '')).toBeUndefined();
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
      expect.stringContaining('HTTP 403'),
    );
  });

  test('shows error message for generic Error', () => {
    showError('Something failed.', new Error('network timeout'));
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('network timeout'),
    );
  });

  test('shows prefix only for unknown thrown value', () => {
    showError('Unknown error.', 42);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Unknown error.');
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

  test('registers tree data provider', async () => {
    await activate(makeContext() as any);
    expect(vscode.window.registerTreeDataProvider).toHaveBeenCalledWith(
      'skycmsExplorer',
      expect.anything(),
    );
  });

  test('registers text document content provider for skycms scheme', async () => {
    await activate(makeContext() as any);
    expect(vscode.workspace.registerTextDocumentContentProvider).toHaveBeenCalledWith(
      'skycms',
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
    expect(ids).toContain('skycms.publishArticle');
    expect(ids).toContain('skycms.unpublishArticle');
    expect(ids).toContain('skycms.newArticle');
    expect(ids).toContain('skycms.publishLayoutVersion');
    expect(ids).toContain('skycms.setDefaultLayoutVersion');
    expect(ids).toContain('skycms.duplicateLayoutVersion');
    expect(ids).toContain('skycms.openFile');
    expect(ids).toContain('skycms.deleteFile');
    expect(ids).toContain('skycms.deleteFolder');
    expect(ids).toContain('skycms.uploadFile');
    expect(ids).toContain('skycms.newFolder');
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
// onWillSaveTextDocument — skycms:// documents only
// ---------------------------------------------------------------------------
describe('onWillSaveTextDocument', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration.mockReturnValue({ get: jest.fn(() => 'https://editor.example.com') });
    await activate(makeContext() as any);
  });

  test('ignores non-skycms documents', () => {
    const handler = getSaveHandler();
    const event = { document: { uri: { scheme: 'file' } }, waitUntil: jest.fn() };
    handler(event);
    expect(event.waitUntil).not.toHaveBeenCalled();
  });

  test('calls waitUntil for skycms:// documents', () => {
    const handler = getSaveHandler();
    const event = {
      document: {
        uri: { scheme: 'skycms', authority: 'articles', path: '/1/content' },
        getText: jest.fn(() => '<p>content</p>'),
      },
      waitUntil: jest.fn(),
    };
    handler(event);
    expect(event.waitUntil).toHaveBeenCalled();
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

  test('does not call unpublishArticle if cancelled', async () => {
    vscode.window.showWarningMessage.mockResolvedValue(undefined);
    const handler = getCommandHandler('skycms.unpublishArticle');
    await handler(makeArticleNode());
    expect(mockCommandClientMethods.unpublishArticle).not.toHaveBeenCalled();
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

  test('shows error on invalid node', async () => {
    const handler = getCommandHandler('skycms.uploadFile');
    await handler(null);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
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

  test('shows error on invalid node', async () => {
    const handler = getCommandHandler('skycms.newFolder');
    await handler(null);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
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

