import { AuthManager } from './authManager';
import { HttpError } from './apiClient/http';

jest.mock('vscode');

const makeSecrets = (initial?: string) => {
  let stored = initial;
  return {
    get: jest.fn(async () => stored),
    store: jest.fn(async (_key: string, value: string) => { stored = value; }),
    delete: jest.fn(async () => { stored = undefined; }),
    onDidChange: jest.fn(),
  };
};

const makeQueryClient = () => ({
  startBrowserAuth: jest.fn(),
  getMe: jest.fn(),
  getLayouts: jest.fn(),
  getTemplates: jest.fn(),
  getArticles: jest.fn(),
  getDocumentFieldContent: jest.fn(),
  getInputFieldValue: jest.fn(),
});

const makeCommandClient = () => ({
  completeBrowserAuth: jest.fn(),
  logout: jest.fn(),
  setDocumentFieldContent: jest.fn(),
  setInputFieldValue: jest.fn(),
});

const makeContext = (initial?: string) => ({
  secrets: makeSecrets(initial),
  subscriptions: [] as { dispose(): void }[],
});

const tokenKeyProvider = () => 'skycms.bearerToken.site-1';

describe('AuthManager.getToken', () => {
  test('returns undefined when no token is stored', async () => {
    const ctx = makeContext();
    const am = new AuthManager(ctx as any, makeQueryClient() as any, makeCommandClient() as any, tokenKeyProvider);
    expect(await am.getToken()).toBeUndefined();
  });

  test('returns stored token value', async () => {
    const ctx = makeContext('existing-token');
    const am = new AuthManager(ctx as any, makeQueryClient() as any, makeCommandClient() as any, tokenKeyProvider);
    expect(await am.getToken()).toBe('existing-token');
  });
});

describe('AuthManager.validateToken', () => {
  test('returns false when no token stored', async () => {
    const qc = makeQueryClient();
    const am = new AuthManager(makeContext() as any, qc as any, makeCommandClient() as any, tokenKeyProvider);
    expect(await am.validateToken()).toBe(false);
    expect(qc.getMe).not.toHaveBeenCalled();
  });

  test('returns true when getMe succeeds', async () => {
    const qc = makeQueryClient();
    qc.getMe.mockResolvedValue({ username: 'u', displayName: 'u', role: 'Editors' });
    const am = new AuthManager(makeContext('tok') as any, qc as any, makeCommandClient() as any, tokenKeyProvider);
    expect(await am.validateToken()).toBe(true);
  });

  test('clears token and returns false on 401', async () => {
    const qc = makeQueryClient();
    qc.getMe.mockRejectedValue(new HttpError(401, 'Unauthorized'));
    const ctx = makeContext('expired-tok');
    let fireCount = 0;
    const am = new AuthManager(ctx as any, qc as any, makeCommandClient() as any, tokenKeyProvider);
    am.onAuthStateChanged(() => { fireCount++; });

    expect(await am.validateToken()).toBe(false);
    expect(ctx.secrets.delete).toHaveBeenCalled();
    expect(fireCount).toBe(1);
  });

  test('rethrows non-401 errors', async () => {
    const qc = makeQueryClient();
    qc.getMe.mockRejectedValue(new HttpError(503, 'Service Unavailable'));
    const am = new AuthManager(makeContext('tok') as any, qc as any, makeCommandClient() as any, tokenKeyProvider);
    await expect(am.validateToken()).rejects.toThrow('Service Unavailable');
  });
});

describe('AuthManager.startBrowserSignIn', () => {
  const vscode = require('vscode');

  beforeEach(() => jest.clearAllMocks());

  test('returns false when browser fails to open', async () => {
    const qc = makeQueryClient();
    qc.startBrowserAuth.mockResolvedValue({ loginUrl: 'https://host/login', state: 'st' });
    vscode.env.openExternal.mockResolvedValue(false);

    const am = new AuthManager(makeContext() as any, qc as any, makeCommandClient() as any, tokenKeyProvider);
    expect(await am.startBrowserSignIn()).toBe(false);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });

  test('returns false when user cancels the input box', async () => {
    const qc = makeQueryClient();
    qc.startBrowserAuth.mockResolvedValue({ loginUrl: 'https://host/login', state: 'st' });
    vscode.env.openExternal.mockResolvedValue(true);
    vscode.window.showInputBox.mockResolvedValue(undefined);

    const am = new AuthManager(makeContext() as any, qc as any, makeCommandClient() as any, tokenKeyProvider);
    expect(await am.startBrowserSignIn()).toBe(false);
  });

  test('stores token and fires event on success', async () => {
    const qc = makeQueryClient();
    qc.startBrowserAuth.mockResolvedValue({ loginUrl: 'https://host/login', state: 'st' });
    vscode.env.openExternal.mockResolvedValue(true);
    vscode.window.showInputBox.mockResolvedValue('ABCD1234');

    const cc = makeCommandClient();
    cc.completeBrowserAuth.mockResolvedValue({ token: 'bearer-tok', role: 'Editors' });

    const ctx = makeContext();
    let fireCount = 0;
    const am = new AuthManager(ctx as any, qc as any, cc as any, tokenKeyProvider);
    am.onAuthStateChanged(() => { fireCount++; });

    expect(await am.startBrowserSignIn()).toBe(true);
    expect(ctx.secrets.store).toHaveBeenCalledWith('skycms.bearerToken.site-1', 'bearer-tok');
    expect(fireCount).toBe(1);
    expect(vscode.window.showInformationMessage).toHaveBeenCalled();
  });

  test('returns false when exchange response has no token', async () => {
    const qc = makeQueryClient();
    qc.startBrowserAuth.mockResolvedValue({ loginUrl: 'https://host/login', state: 'st' });
    vscode.env.openExternal.mockResolvedValue(true);
    vscode.window.showInputBox.mockResolvedValue('ABCD1234');

    const cc = makeCommandClient();
    cc.completeBrowserAuth.mockResolvedValue({ token: '' });

    const am = new AuthManager(makeContext() as any, qc as any, cc as any, tokenKeyProvider);
    expect(await am.startBrowserSignIn()).toBe(false);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });

  test('validateInput callback rejects empty code and accepts non-empty code', async () => {
    const qc = makeQueryClient();
    qc.startBrowserAuth.mockResolvedValue({ loginUrl: 'https://host/login', state: 'st' });
    vscode.env.openExternal.mockResolvedValue(true);

    let capturedOptions: any;
    vscode.window.showInputBox.mockImplementation((options: any) => {
      capturedOptions = options;
      return Promise.resolve(undefined);
    });

    const am = new AuthManager(makeContext() as any, qc as any, makeCommandClient() as any, tokenKeyProvider);
    await am.startBrowserSignIn();

    expect(capturedOptions.validateInput('')).toBe('Verification code is required.');
    expect(capturedOptions.validateInput('   ')).toBe('Verification code is required.');
    expect(capturedOptions.validateInput('abc123')).toBeUndefined();
  });
});

describe('AuthManager.signOut', () => {
  const vscode = require('vscode');

  beforeEach(() => jest.clearAllMocks());

  test('clears token and fires event', async () => {
    const cc = makeCommandClient();
    cc.logout.mockResolvedValue(undefined);
    const ctx = makeContext('stored-token');
    let fireCount = 0;
    const am = new AuthManager(ctx as any, makeQueryClient() as any, cc as any, tokenKeyProvider);
    am.onAuthStateChanged(() => { fireCount++; });

    await am.signOut();

    expect(ctx.secrets.delete).toHaveBeenCalled();
    expect(fireCount).toBe(1);
  });

  test('still clears token even if logout API call throws', async () => {
    const cc = makeCommandClient();
    cc.logout.mockRejectedValue(new Error('network error'));
    const ctx = makeContext('stored-token');
    const am = new AuthManager(ctx as any, makeQueryClient() as any, cc as any, tokenKeyProvider);

    await am.signOut();
    expect(ctx.secrets.delete).toHaveBeenCalled();
  });
});
