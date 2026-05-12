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
  pollBrowserAuth: jest.fn(),
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

const makeSiteManager = () => ({
  getActiveSite: jest.fn(async () => null),
  updateSiteMetadata: jest.fn(async () => {}),
});

const makeContext = (initial?: string) => ({
  secrets: makeSecrets(initial),
  subscriptions: [] as { dispose(): void }[],
});

const tokenKeyProvider = () => 'skycms.bearerToken.site-1';

describe('AuthManager.getToken', () => {
  test('returns undefined when no token is stored', async () => {
    const ctx = makeContext();
    const am = new AuthManager(ctx as any, makeQueryClient() as any, makeCommandClient() as any, tokenKeyProvider, makeSiteManager() as any);
    expect(await am.getToken()).toBeUndefined();
  });

  test('returns stored token value', async () => {
    const ctx = makeContext('existing-token');
    const am = new AuthManager(ctx as any, makeQueryClient() as any, makeCommandClient() as any, tokenKeyProvider, makeSiteManager() as any);
    expect(await am.getToken()).toBe('existing-token');
  });
});

describe('AuthManager.validateToken', () => {
  test('returns false when no token stored', async () => {
    const qc = makeQueryClient();
    const am = new AuthManager(makeContext() as any, qc as any, makeCommandClient() as any, tokenKeyProvider, makeSiteManager() as any);
    expect(await am.validateToken()).toBe(false);
    expect(qc.getMe).not.toHaveBeenCalled();
  });

  test('returns true when getMe succeeds', async () => {
    const qc = makeQueryClient();
    qc.getMe.mockResolvedValue({ username: 'u', displayName: 'u', role: 'Editors' });
    const am = new AuthManager(makeContext('tok') as any, qc as any, makeCommandClient() as any, tokenKeyProvider, makeSiteManager() as any);
    expect(await am.validateToken()).toBe(true);
  });

  test('clears token and returns false on 401', async () => {
    const qc = makeQueryClient();
    qc.getMe.mockRejectedValue(new HttpError(401, 'Unauthorized'));
    const ctx = makeContext('expired-tok');
    let fireCount = 0;
    const am = new AuthManager(ctx as any, qc as any, makeCommandClient() as any, tokenKeyProvider, makeSiteManager() as any);
    am.onAuthStateChanged(() => { fireCount++; });

    expect(await am.validateToken()).toBe(false);
    expect(ctx.secrets.delete).toHaveBeenCalled();
    expect(fireCount).toBe(1);
  });

  test('rethrows non-401 errors', async () => {
    const qc = makeQueryClient();
    qc.getMe.mockRejectedValue(new HttpError(503, 'Service Unavailable'));
    const am = new AuthManager(makeContext('tok') as any, qc as any, makeCommandClient() as any, tokenKeyProvider, makeSiteManager() as any);
    await expect(am.validateToken()).rejects.toThrow('Service Unavailable');
  });
});

describe('AuthManager.startBrowserSignIn', () => {
  const vscode = require('vscode');

  beforeEach(() => {
    jest.clearAllMocks();
    // Restore the default withProgress: runs the task with a non-cancelled token.
    vscode.window.withProgress.mockImplementation(async (_options: unknown, task: any) => {
      return task(
        { report: jest.fn() },
        { isCancellationRequested: false, onCancellationRequested: jest.fn() },
      );
    });
  });

  test('returns false when browser fails to open', async () => {
    const qc = makeQueryClient();
    qc.startBrowserAuth.mockResolvedValue({ loginUrl: 'https://host/login', state: 'st' });
    vscode.env.openExternal.mockResolvedValue(false);

    const am = new AuthManager(makeContext() as any, qc as any, makeCommandClient() as any, tokenKeyProvider, makeSiteManager() as any);
    expect(await am.startBrowserSignIn()).toBe(false);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });

  test('returns false when user cancels the progress notification', async () => {
    const qc = makeQueryClient();
    qc.startBrowserAuth.mockResolvedValue({ loginUrl: 'https://host/login', state: 'st' });
    vscode.env.openExternal.mockResolvedValue(true);
    // Simulate the user pressing Cancel in the progress notification.
    vscode.window.withProgress.mockImplementation(async (_options: unknown, task: any) => {
      return task(
        { report: jest.fn() },
        { isCancellationRequested: true, onCancellationRequested: jest.fn() },
      );
    });

    const am = new AuthManager(makeContext() as any, qc as any, makeCommandClient() as any, tokenKeyProvider, makeSiteManager() as any);
    expect(await am.startBrowserSignIn()).toBe(false);
  });

  test('returns false when poll returns expired', async () => {
    const qc = makeQueryClient();
    qc.startBrowserAuth.mockResolvedValue({ loginUrl: 'https://host/login', state: 'st' });
    qc.pollBrowserAuth.mockResolvedValue({ status: 'expired' });
    vscode.env.openExternal.mockResolvedValue(true);

    const am = new AuthManager(makeContext() as any, qc as any, makeCommandClient() as any, tokenKeyProvider, makeSiteManager() as any);
    expect(await am.startBrowserSignIn()).toBe(false);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });

  test('stores token and fires event on success via polling', async () => {
    const qc = makeQueryClient();
    qc.startBrowserAuth.mockResolvedValue({ loginUrl: 'https://host/login', state: 'st' });
    qc.pollBrowserAuth.mockResolvedValue({ status: 'complete', code: 'ABCD1234', websiteTitle: 'My Site', publicUrl: 'https://mysite.com' });
    vscode.env.openExternal.mockResolvedValue(true);

    const cc = makeCommandClient();
    cc.completeBrowserAuth.mockResolvedValue({ token: 'bearer-tok', role: 'Editors', websiteTitle: 'My Site', publicUrl: 'https://mysite.com' });

    const ctx = makeContext();
    let fireCount = 0;
    const am = new AuthManager(ctx as any, qc as any, cc as any, tokenKeyProvider, makeSiteManager() as any);
    am.onAuthStateChanged(() => { fireCount++; });

    expect(await am.startBrowserSignIn()).toBe(true);
    expect(cc.completeBrowserAuth).toHaveBeenCalledWith({ state: 'st', code: 'ABCD1234' });
    expect(ctx.secrets.store).toHaveBeenCalledWith('skycms.bearerToken.site-1', 'bearer-tok');
    expect(fireCount).toBe(1);
    expect(vscode.window.showInformationMessage).toHaveBeenCalled();
  });

  test('returns false when exchange response has no token', async () => {
    const qc = makeQueryClient();
    qc.startBrowserAuth.mockResolvedValue({ loginUrl: 'https://host/login', state: 'st' });
    qc.pollBrowserAuth.mockResolvedValue({ status: 'complete', code: 'ABCD1234' });
    vscode.env.openExternal.mockResolvedValue(true);

    const cc = makeCommandClient();
    cc.completeBrowserAuth.mockResolvedValue({ token: '' });

    const am = new AuthManager(makeContext() as any, qc as any, cc as any, tokenKeyProvider, makeSiteManager() as any);
    expect(await am.startBrowserSignIn()).toBe(false);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });

  test('updates site metadata from exchange response when available', async () => {
    const qc = makeQueryClient();
    qc.startBrowserAuth.mockResolvedValue({ loginUrl: 'https://host/login', state: 'st' });
    qc.pollBrowserAuth.mockResolvedValue({ status: 'complete', code: 'CODE1', websiteTitle: 'Poll Title', publicUrl: 'https://poll.com' });
    vscode.env.openExternal.mockResolvedValue(true);

    const cc = makeCommandClient();
    cc.completeBrowserAuth.mockResolvedValue({ token: 'tok', websiteTitle: 'Exchange Title', publicUrl: 'https://exchange.com' });

    const sm = makeSiteManager();
    (sm.getActiveSite as jest.Mock).mockResolvedValue({ id: 'site-1', name: 'Site' });

    const am = new AuthManager(makeContext() as any, qc as any, cc as any, tokenKeyProvider, sm as any);
    await am.startBrowserSignIn();

    // Exchange response takes priority over poll response for metadata.
    expect(sm.updateSiteMetadata).toHaveBeenCalledWith('site-1', 'Exchange Title', 'https://exchange.com');
  });

  test('retries poll on network error before succeeding', async () => {
    const qc = makeQueryClient();
    qc.startBrowserAuth.mockResolvedValue({ loginUrl: 'https://host/login', state: 'st' });
    // First call throws a network error; second returns complete.
    qc.pollBrowserAuth
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue({ status: 'complete', code: 'RETRY1' });
    vscode.env.openExternal.mockResolvedValue(true);

    // Mock withProgress to call the task with a token whose onCancellationRequested
    // resolves the inner sleep immediately so there is no real 2s delay.
    vscode.window.withProgress.mockImplementation(async (_options: unknown, task: any) => {
      const onCancellationRequested = jest.fn((cb: () => void) => { cb(); return { dispose: jest.fn() }; });
      return task(
        { report: jest.fn() },
        { isCancellationRequested: false, onCancellationRequested },
      );
    });

    const cc = makeCommandClient();
    cc.completeBrowserAuth.mockResolvedValue({ token: 'tok' });

    const am = new AuthManager(makeContext() as any, qc as any, cc as any, tokenKeyProvider, makeSiteManager() as any);
    expect(await am.startBrowserSignIn()).toBe(true);
    expect(qc.pollBrowserAuth).toHaveBeenCalledTimes(2);
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
    const am = new AuthManager(ctx as any, makeQueryClient() as any, cc as any, tokenKeyProvider, makeSiteManager() as any);
    am.onAuthStateChanged(() => { fireCount++; });

    await am.signOut();

    expect(ctx.secrets.delete).toHaveBeenCalled();
    expect(fireCount).toBe(1);
  });

  test('still clears token even if logout API call throws', async () => {
    const cc = makeCommandClient();
    cc.logout.mockRejectedValue(new Error('network error'));
    const ctx = makeContext('stored-token');
    const am = new AuthManager(ctx as any, makeQueryClient() as any, cc as any, tokenKeyProvider, makeSiteManager() as any);

    await am.signOut();
    expect(ctx.secrets.delete).toHaveBeenCalled();
  });
});
