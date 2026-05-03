# Testing Strategy

[← Back to Index](00-Index.md)

This document describes how the SkyCMS VS Code Explorer is tested, what tools are used, how coverage is measured, and what the standards are for each test type.

The target is **95% statement coverage** across all extension source files (requirement NFR-TEST-01).

---

## Test Framework

The extension uses **Jest** as the test runner and assertion library.

Jest is the standard choice for VS Code extension testing because:

- It supports TypeScript natively via `ts-jest`
- It has first-class mocking built in, which is essential for isolating the VS Code API
- Its coverage tool (via `--coverage`) integrates with `c8`/Istanbul for accurate statement, branch, and function counts
- It runs entirely in Node.js — no browser or Electron instance required for unit tests

### Supporting tools

| Tool | Purpose |
|---|---|
| `jest` | Test runner and assertion library |
| `ts-jest` | TypeScript preprocessor for Jest |
| `jest-mock-vscode` | Pre-built mocks for common VS Code API types (`Uri`, `TreeItem`, `EventEmitter`, etc.) |
| `@vscode/test-electron` | Integration test runner that launches a real VS Code instance (used sparingly — see below) |
| `nock` or `jest` manual mocks | HTTP request interception for API Client tests |

---

## Test File Location

Test files live **alongside the source files they test**. This is requirement NFR-TEST-04.

```
src/
├─ authManager.ts
├─ authManager.test.ts
├─ apiClient/
│  ├─ queries.ts
│  ├─ queries.test.ts
│  ├─ commands.ts
│  └─ commands.test.ts
├─ treeProvider.ts
├─ treeProvider.test.ts
├─ documentProvider.ts
├─ documentProvider.test.ts
└─ extension.ts
   (extension.ts is covered by integration tests, not unit tests)
```

---

## Test Types

### Unit Tests (Primary)

Unit tests cover individual classes and functions in isolation. They make up the majority of the test suite and are responsible for reaching the 95% coverage target.

Every unit test must:

- Test one class or function at a time
- Mock all external dependencies (VS Code API, HTTP requests, other extension modules)
- Run in milliseconds (no I/O, no real HTTP calls, no real VS Code instance)
- Be deterministic — the same input always produces the same output

#### What gets unit tested

| Source module | What to test |
|---|---|
| `AuthManager` | Browser sign-in opens external URL and exchanges code; successful sign-in stores token in SecretStorage; sign-out clears token and calls logout endpoint; `getToken()` returns stored token; `getToken()` returns null when no token is stored; 401 handling clears token |
| `ApiClient / queries.ts` | Each query method sends the correct HTTP verb, path, and auth header; correct response parsing; each HTTP error status is mapped to the correct exception type |
| `ApiClient / commands.ts` | Each command method sends the correct HTTP verb, path, auth header, and request body; success responses resolve; error responses throw |
| `SkyCmsTreeProvider` | `getChildren(undefined)` returns the three root categories when authenticated; `getChildren(undefined)` returns the sign-in node when not authenticated; layout nodes produce exactly 5 field children; template nodes produce exactly 3 field children; article nodes produce exactly 8 field children; article labels include an `ArticleType` description when present |
| `SkyCmsDocumentProvider` | URI parsing extracts correct entity type, identifiers, and field; `provideTextDocumentContent` calls the correct query; save handler calls the correct command with the current document text |
| URI utilities | `buildFieldUri()` produces the expected `skycms://` URI for each entity type and field; `parseFieldUri()` correctly extracts all segments including authority/path variants; `getLanguageForField()` returns expected editor language |

---

### Integration Tests (Selective)

Integration tests launch a real VS Code instance using `@vscode/test-electron`. They are used only for behaviors that cannot be verified without a real VS Code host — primarily:

- The extension activates without errors
- The tree view appears in the Explorer sidebar
- The `skycms://` URI scheme is registered and can be opened
- `Ctrl+S` on a virtual document triggers the save handler

Integration tests are slower (several seconds each) and should be kept to a small, stable set. They do not count toward the 95% coverage target, which is a unit-test metric.

---

### What Is Explicitly Not Tested

- **The VS Code API itself** — VS Code is a tested product. The extension tests mock it.
- **The SkyCMS API server** — The server has its own tests. The extension tests mock all HTTP calls.
- **Network conditions** — Slow networks, dropped connections, and DNS failures are covered by the error-handling unit tests using mocks, not real infrastructure.

---

## Coverage Configuration

Coverage is measured with Jest's built-in coverage tool. The configuration in `jest.config.ts`:

```typescript
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      statements: 95,
      branches: 90,
      functions: 95,
      lines: 95,
    },
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/extension.ts',   // covered by integration tests
  ],
};
```

**Why is `extension.ts` excluded from coverage collection?**
`extension.ts` is the entry point — it wires everything together and registers VS Code commands. Its logic is minimal by design (see Design Principle 7: One Concern Per Layer). It is tested at the integration level, not the unit level.

**Branch coverage target is 90%, not 95%.** Some branches in error-handling code are difficult to trigger without fragile mocks. 90% is a practical floor that still forces thorough coverage of the main paths.

---

## Running Tests

```bash
# Run all tests and generate a coverage report
npm test

# Run tests in watch mode during development
npm run test:watch

# Run only unit tests (exclude integration)
npm run test:unit

# Run integration tests (requires VS Code installed)
npm run test:integration
```

Coverage reports are written to `coverage/`. Open `coverage/lcov-report/index.html` in a browser for the full line-by-line report.

---

## Mocking the VS Code API

The VS Code `vscode` module is not available in a plain Node.js test environment. It must be mocked. The `jest-mock-vscode` package provides ready-made mocks for the most common types.

For types not covered by `jest-mock-vscode`, create a manual mock in `src/__mocks__/vscode.ts`. Every class or function the extension uses must have a corresponding entry.

Example pattern for mocking `SecretStorage`:

```typescript
const mockSecrets = new Map<string, string>();

const mockContext = {
  secrets: {
    get: jest.fn((key: string) => Promise.resolve(mockSecrets.get(key))),
    store: jest.fn((key: string, value: string) => {
      mockSecrets.set(key, value);
      return Promise.resolve();
    }),
    delete: jest.fn((key: string) => {
      mockSecrets.delete(key);
      return Promise.resolve();
    }),
  },
} as unknown as vscode.ExtensionContext;
```

---

## Mocking HTTP (API Client Tests)

API Client tests must not make real HTTP calls. Use Jest's `jest.mock` with a manual factory, or use `nock` to intercept Node.js `https` requests at the module level.

Example using Jest manual mocks:

```typescript
jest.mock('../http', () => ({
  request: jest.fn(),
}));

import { request } from '../http';

test('getLayouts sends GET with auth header', async () => {
  (request as jest.Mock).mockResolvedValueOnce({
    status: 200,
    body: [{ layoutNumber: 1, name: 'Default', versions: [] }],
  });

  const client = new LayoutQueryService('https://editor.example.com', 'token123');
  const result = await client.getLayouts();

  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'GET',
      path: '/api/vscode/layouts',
      headers: expect.objectContaining({ Authorization: 'Bearer token123' }),
    })
  );
  expect(result).toHaveLength(1);
});
```

---

## Test Naming Convention

Test names must read as complete sentences that describe the expected behavior:

```typescript
// Good
test('getToken returns null when no token is stored in SecretStorage', ...)
test('save handler calls PUT /api/vscode/layouts/1/3/head with document content', ...)
test('tree shows sign-in node when AuthManager has no token', ...)

// Avoid
test('getToken null', ...)
test('save works', ...)
```

This makes failures easy to understand without reading the test body.

---

## CI Pipeline Integration

Tests must pass in CI before any pull request can be merged. The CI pipeline must:

1. Run `npm ci` to install dependencies from the lockfile
2. Run `npm test` to execute all unit tests and generate coverage
3. Fail the build if any test fails
4. Fail the build if coverage drops below the thresholds defined in `jest.config.ts`
5. Upload the `coverage/` directory as a CI artifact

Integration tests run in a separate CI job against a headless VS Code instance.

---

[← Back to Index](00-Index.md)
