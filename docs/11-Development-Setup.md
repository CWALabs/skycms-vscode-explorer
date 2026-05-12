# Development Setup

[← Back to Index](00-Index.md)

This document explains how to get the SkyCMS VS Code Explorer running on your local machine, from a fresh clone to a running extension in the VS Code Extension Development Host.

---

## Prerequisites

Install these tools before you begin.

| Tool | Minimum version | Notes |
|---|---|---|
| **Node.js** | 18 LTS or later | Download from [nodejs.org](https://nodejs.org). LTS is recommended. |
| **npm** | 9 or later | Bundled with Node.js 18+. |
| **VS Code** | 1.85.0 or later | The minimum supported version (see NFR-COMPAT-01). |
| **Git** | Any recent version | For cloning and branching. |

Verify your installation:

```bash
node --version   # should print v18.x.x or later
npm --version    # should print 9.x.x or later
code --version   # should print 1.85.0 or later
```

---

## Clone and Install

```bash
git clone https://github.com/your-org/skycms-vscode-explorer.git
cd skycms-vscode-explorer
npm ci
```

Use `npm ci` (not `npm install`) to install exactly the versions recorded in `package-lock.json`. This keeps your environment consistent with CI.

---

## Project Structure

```
skycms-vscode-explorer/
├─ src/
│  ├─ extension.ts          # Extension entry point
│  ├─ authManager.ts        # Token storage and sign-in flow
│  ├─ apiClient/
│  │  ├─ queries.ts         # CQRS query (read) operations
│  │  └─ commands.ts        # CQRS command (write) operations
│  ├─ treeProvider.ts       # TreeDataProvider implementation
│  ├─ documentProvider.ts   # TextDocumentContentProvider implementation
│  └─ __mocks__/
│     └─ vscode.ts          # VS Code API mock for unit tests
├─ docs/                    # Documentation (this directory)
├─ dist/                    # Compiled and bundled output (generated — do not edit)
├─ coverage/                # Test coverage reports (generated)
├─ tsconfig.json
├─ jest.config.ts
├─ esbuild.config.mjs
├─ package.json
└─ LICENSE
```

---

## TypeScript Configuration

The project uses TypeScript with `strict` mode. This is required by NFR-QA-01. The key settings in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./out",
    "rootDir": "./src",
    "sourceMap": true,
    "skipLibCheck": true
  },
  "exclude": ["node_modules", ".vscode-test"]
}
```

**`strict: true`** enables all strict checks in one flag: `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, and others. If you find yourself writing `as any`, stop and think about the correct type — or add a comment explaining why the cast is unavoidable.

---

## Build

The extension is bundled with **esbuild** for fast, single-file output. There is no Webpack or Rollup.

```bash
# Build once (development, with source maps)
npm run build

# Build in watch mode — rebuilds automatically on every file change
npm run watch

# Build for production (minified, no source maps, type-checks first)
npm run build:production

# Package as a .vsix file ready for installation or publishing
npm run package
```

The output lands in `dist/extension.js`. VS Code loads this file, not the raw TypeScript.

`npm run watch` uses esbuild's incremental rebuild mode. Changes appear in `dist/extension.js` within milliseconds. Reload the Extension Development Host with `Ctrl+Shift+F5` to pick up each change.

`npm run package` produces a `.vsix` file (for example, `skycms-explorer-0.0.2.vsix`) in the project root. Install it locally with:

```bash
code --install-extension skycms-explorer-0.0.2.vsix
```

Or drag the file into the VS Code Extensions panel.

**Why esbuild?** It is faster than Webpack, requires less configuration, and produces a smaller bundle. VS Code extensions benefit from fast build times during the inner development loop.

---

## CQRS Layer Convention

The API Client layer follows a **CQRS** pattern (requirement NFR-QA-03). This is a code organization convention, not a framework.

- **`src/apiClient/queries.ts`** — all `GET` requests. Classes here read data and never change server state.
- **`src/apiClient/commands.ts`** — all `PUT`, `POST`, and `DELETE` requests. Classes here change server state.

When adding a new API call, decide first: is this a read or a write? Place it in the correct file. Do not mix query and command logic in the same class.

Example:

```typescript
// queries.ts
export class LayoutQueryService {
  /** Fetches all layout families from the API. */
  async getLayouts(): Promise<LayoutFamily[]> { ... }

  /** Fetches the content of a layout field. */
  async getLayoutContent(layoutNumber: number, version: number, field: 'head' | 'footer'): Promise<string> { ... }
}

// commands.ts
export class LayoutCommandService {
  /** Saves new content to a layout field. */
  async saveLayoutContent(layoutNumber: number, version: number, field: 'head' | 'footer', content: string): Promise<void> { ... }
}
```

---

## Running Tests

```bash
# Run all unit tests and generate a coverage report
npm test

# Run tests in watch mode during development
npm run test:watch
```

Coverage output lands in `coverage/`. Open `coverage/lcov-report/index.html` in a browser to see line-by-line results.

The build will fail if coverage drops below the thresholds set in `jest.config.ts` (95% statements, 90% branches, 95% functions, 95% lines).

See [Testing Strategy](10-Testing-Strategy.md) for the full testing plan.

---

## Running the Extension in VS Code

1. Open the repository root in VS Code (`code .` or **File → Open Folder**).
2. Press **F5**. VS Code launches the **Extension Development Host** — a second VS Code window with the extension loaded.
3. In the Extension Development Host, open the **SkyCMS** panel in the Explorer sidebar.
4. Configure `skycms.editorUrl` in settings (see below).

To reload after a code change, click **Restart** in the debug toolbar of the first window, or press `Ctrl+Shift+F5`.

---

## Connecting to a Local SkyCMS Instance

For development and manual testing, point the extension at a SkyCMS Editor running locally.

**Step 1 — Start SkyCMS Editor.** Follow the [SkyCMS local development guide](https://docs.sky-cms.com/installation/local-development/). By default the Editor runs on `http://localhost:5000` (or the port configured in your `appsettings.json`).

**Step 2 — Configure the extension.** In the Extension Development Host:

1. Open **Settings** (`Ctrl+,`)
2. Search for `skycms.editorUrl`
3. Set the value to your local instance URL, e.g. `http://localhost:5000`

**Step 3 — Sign in.** Click "Sign in to SkyCMS…" in the tree view and enter an account with the Administrators or Editors role.

> **Note on HTTP vs HTTPS:** SkyCMS's local development instance uses HTTP. The extension will warn you about non-HTTPS URLs (requirement NFR-SEC-03). This warning is expected in local development and can be dismissed. Use HTTPS for all non-local environments.

---

## Debugging

The repository includes a `.vscode/launch.json` that configures the extension debugger. Press **F5** to attach the debugger to the Extension Development Host.

Set breakpoints in any `.ts` source file — source maps are generated by default in development builds. The debugger maps back to the TypeScript source, not the compiled JavaScript.

For API Client debugging, it can be useful to add a temporary log in the HTTP layer. Remove all debug logs before committing (the DRY/clean-code review will catch these).

---

## Linting

The project uses **ESLint** with TypeScript rules.

```bash
# Check for lint errors
npm run lint

# Fix auto-fixable errors
npm run lint:fix
```

Lint runs as part of CI. Pull requests with lint errors will not pass the checks.

---

## Versioning Workflow

The project follows **Semantic Versioning** (`MAJOR.MINOR.PATCH`) as required by NFR-VER-01.

Before releasing:

1. Update the `version` field in `package.json`
2. Add a corresponding entry to `CHANGELOG.md` describing what changed
3. Commit both files together: `git commit -m "chore: release v1.2.0"`
4. Tag the commit: `git tag v1.2.0`

Version rules:
- `MAJOR` — breaking change to extension behavior or the `/api/vscode/` contract
- `MINOR` — new feature, backward compatible
- `PATCH` — bug fix, backward compatible

---

## TSDoc Convention

All exported symbols must have TSDoc comments (requirement NFR-QA-04). Use the `/** ... */` format.

```typescript
/**
 * Retrieves the current bearer token from SecretStorage.
 *
 * @returns The stored token, or `null` if no token is present.
 */
async getToken(): Promise<string | null> {
  return this.context.secrets.get(TOKEN_KEY);
}
```

The VS Code extension editor provides IntelliSense from TSDoc comments. Good comments make the codebase self-documenting and reduce the need for inline explanation.

---

## Adding a New Entity Type

If SkyCMS adds a new entity type that the extension should support, follow this checklist:

1. **API contract** — Add the new endpoints to [Data Access](06-Data-Access.md)
2. **URI scheme** — Add the new URI pattern to [URI-Scheme.md](URI-Scheme.md)
3. **Query method** — Add a method to `src/apiClient/queries.ts`
4. **Command method** — Add a method to `src/apiClient/commands.ts`
5. **Tree node** — Add a new node type to `src/treeProvider.ts`
6. **Document provider** — Handle the new URI pattern in `src/documentProvider.ts`
7. **Tests** — Add unit tests covering each new method. Keep coverage above 95%.
8. **Docs** — Update [Tree View Model](04-TreeView-Model.md) and [Virtual Documents](05-Virtual-Documents.md) as needed

---

[← Back to Index](00-Index.md)
