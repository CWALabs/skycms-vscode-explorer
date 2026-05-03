# Research Links

[← Back to Index](00-Index.md)

Reference links for building the SkyCMS VS Code Explorer. Organized by topic so you can go directly to what you need.

---

## VS Code Extension APIs

### TreeView
- [Tree View API Guide](https://code.visualstudio.com/api/extension-guides/tree-view) — the primary guide for implementing `TreeDataProvider`. Covers nodes, icons, collapsible states, and the `onDidChangeTreeData` event.
- [`TreeDataProvider` API reference](https://code.visualstudio.com/api/references/vscode-api#TreeDataProvider)
- [`TreeItem` API reference](https://code.visualstudio.com/api/references/vscode-api#TreeItem) — all properties including `description`, `tooltip`, `iconPath`, `command`, and `contextValue`.

### Virtual Documents
- [Virtual Documents Guide](https://code.visualstudio.com/api/extension-guides/virtual-documents) — explains `TextDocumentContentProvider`, how to register a custom URI scheme, and how to trigger refresh.
- [`TextDocumentContentProvider` API reference](https://code.visualstudio.com/api/references/vscode-api#TextDocumentContentProvider)
- [`workspace.onWillSaveTextDocument`](https://code.visualstudio.com/api/references/vscode-api#workspace.onWillSaveTextDocument) — the event used to intercept Ctrl+S for virtual document URIs.

### Authentication and Secrets
- [`SecretStorage` API reference](https://code.visualstudio.com/api/references/vscode-api#SecretStorage) — the secure credential store for extensions. Accessed via `context.secrets`.
- [Extension API: `InputBox`](https://code.visualstudio.com/api/references/vscode-api#InputBox) — used to prompt the developer for username and password.

### Commands and Menus
- [Commands extension guide](https://code.visualstudio.com/api/extension-guides/command)
- [`contributes.menus`](https://code.visualstudio.com/api/references/contribution-points#contributes.menus) — how to add right-click context menus to tree nodes using `"view/item/context"` and `"when"` clauses.
- [`contributes.viewsWelcome`](https://code.visualstudio.com/api/references/contribution-points#contributes.viewsWelcome) — how to show a "Sign in" message when the tree is empty/unauthenticated.

### Configuration
- [`contributes.configuration`](https://code.visualstudio.com/api/references/contribution-points#contributes.configuration) — for registering the `skycms.editorUrl` setting.
- [`workspace.getConfiguration`](https://code.visualstudio.com/api/references/vscode-api#workspace.getConfiguration) — how to read settings at runtime.

### Language Modes
- [`languages.setTextDocumentLanguage`](https://code.visualstudio.com/api/references/vscode-api#languages.setTextDocumentLanguage) — sets the syntax highlighting mode for an open document.

---

## VS Code Extension Examples

- [VS Code Extension Samples (GitHub)](https://github.com/microsoft/vscode-extension-samples) — the official Microsoft sample repository. Most relevant:
  - [`tree-view-sample`](https://github.com/microsoft/vscode-extension-samples/tree/main/tree-view-sample) — complete TreeDataProvider example
  - [`contentprovider-sample`](https://github.com/microsoft/vscode-extension-samples/tree/main/contentprovider-sample) — TextDocumentContentProvider with a custom URI scheme

- [GitLens source (GitHub)](https://github.com/gitkraken/vscode-gitlens) — a large, production-quality extension that uses TreeView extensively. Good reference for how real extensions structure their providers.

- [Azure App Service Extension (GitHub)](https://github.com/microsoft/vscode-azureappservice) — Microsoft's own extension using TreeView + API calls + SecretStorage. Directly comparable to this project's architecture.

- [MongoDB for VS Code (GitHub)](https://github.com/mongodb-js/vscode) — database-backed TreeView with virtual document editing. Very close to what this project does.

---

## SkyCMS References

- [SkyCMS documentation](https://docs.sky-cms.com/) — the official docs. Start here for understanding entities, versioning, and the publishing model.
- [SkyCMS source code (GitHub)](https://github.com/CWALabs/SkyCMS) — the full source.
- [SkyCMS entity models](https://github.com/CWALabs/SkyCMS/tree/main/Common/Data) — the C# entity classes for Layouts, Templates, and Articles. These define the fields that the API endpoints expose.

---

## ASP.NET Core (Server-Side API)

- [ASP.NET Core Web API overview](https://learn.microsoft.com/en-us/aspnet/core/web-api/) — for building the `/api/vscode/` controller in the SkyCMS Editor project.
- [JWT Bearer authentication in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/jwt-authn) — for issuing and validating the bearer tokens returned to the extension.
- [Authorization with roles in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/security/authorization/roles) — for restricting the `/api/vscode/` endpoints to the Editor and Administrator roles.
- [`[Authorize(Roles = "Editor,Administrator")]`](https://learn.microsoft.com/en-us/aspnet/core/security/authorization/roles#adding-role-checks) — the attribute used to gate API endpoints by SkyCMS role.

---

## General Extension Development

- [Your First Extension](https://code.visualstudio.com/api/get-started/your-first-extension) — quick start if you have not built a VS Code extension before.
- [Extension Manifest (`package.json`)](https://code.visualstudio.com/api/references/extension-manifest) — full reference for every field in the extension's `package.json`.
- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) — for Phase 4 when the extension is ready for the Marketplace.
- [Bundling with esbuild](https://code.visualstudio.com/api/working-with-extensions/bundling-extension#using-esbuild) — the recommended bundler for VS Code extensions; produces the smallest and fastest output.

---

[← Back to Index](00-Index.md)

