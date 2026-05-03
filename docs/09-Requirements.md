# Requirements

[← Back to Index](00-Index.md)

This document lists all requirements for the SkyCMS VS Code Explorer and its companion server-side API. Requirements are divided into functional (what the system must do) and non-functional (how the system must behave). Each requirement has a short ID so it can be referenced from code reviews, tests, and issue tracking.

---

## Functional Requirements

Functional requirements describe observable, testable behaviors.

### Authentication and Authorization

| ID | Requirement |
|---|---|
| FR-AUTH-01 | A user must sign in through an external web browser using SkyCMS's native authentication flow before the tree displays any content. |
| FR-AUTH-02 | The extension must accept accounts with the **Administrators** or **Editors** role. Accounts with only the **Authors**, **Reviewers**, or no role must be denied with a clear message. |
| FR-AUTH-03 | After successful sign-in, the bearer token must be stored in VS Code SecretStorage and reused across sessions without prompting the user to sign in again on every launch. |
| FR-AUTH-04 | On extension activation, the extension must validate any stored token against `GET /api/vscode/auth/me` and silently proceed if the token is valid, or revert to the unauthenticated state if it is not. |
| FR-AUTH-05 | When the server returns HTTP 401 on any request, the extension must clear the stored token, show a "session expired" notification, and return the tree to the unauthenticated state. |
| FR-AUTH-06 | When the server returns HTTP 403 on any request, the extension must show an "access denied" notification and keep the stored token. |
| FR-AUTH-07 | The **SkyCMS: Sign Out** command must call `POST /api/vscode/auth/logout`, clear the stored token, and return the tree to the unauthenticated state. |
| FR-AUTH-08 | Credentials must never be written to VS Code settings, output channels, log files, or any plain-text storage. Password entry must not happen inside the extension UI. |

### Tree Navigation

| ID | Requirement |
|---|---|
| FR-TREE-01 | The tree must display three top-level categories: **Layouts**, **Page Templates**, and **Articles**. |
| FR-TREE-02 | Layout nodes must appear as collapsible nodes under **Layouts**, displaying `LayoutName`. |
| FR-TREE-03 | Each Layout node must expose five editable child fields: **Layout Name**, **Notes**, **Head**, **Header**, and **Footer**. |
| FR-TREE-04 | Page Template nodes must appear under the Page Templates category and expose three editable child fields: **Title**, **Content**, and **Description**. |
| FR-TREE-05 | Article nodes must be grouped into **Drafts** and **Published** sub-categories, ordered alphabetically within each group. |
| FR-TREE-06 | Article nodes must display the article title and a dimmed `ArticleType` badge. The node must expose eight editable child fields: **Published**, **Title**, **Banner Image**, **Category**, **Introduction**, **Content**, **Header JS**, and **Footer JS**. |
| FR-TREE-07 | Tree data must load lazily — children are fetched from the API only when the user expands a node. |
| FR-TREE-08 | The **SkyCMS: Refresh** command must reload all visible tree data from the API. |
| FR-TREE-09 | When the user is not authenticated, the tree must show a single "Sign in to SkyCMS…" item. Clicking it must trigger the sign-in flow. |

### Editing

| ID | Requirement |
|---|---|
| FR-EDIT-01 | Clicking a Layout's **Notes**, **Head**, **Header**, or **Footer** field node must open that field as a virtual document in VS Code. |
| FR-EDIT-02 | Clicking a Layout's **Layout Name** field node must open an InputBox pre-populated with the current value. |
| FR-EDIT-03 | Clicking a Template's **Content** or **Description** field node must open that field as a virtual document in VS Code. |
| FR-EDIT-04 | Clicking an Article's **Content**, **Introduction**, **Header JS**, or **Footer JS** field node must open that field as a virtual document in VS Code. |
| FR-EDIT-05 | Clicking an Article's **Published**, **Title**, **Banner Image**, or **Category** field node must open an InputBox pre-populated with the current value. |
| FR-EDIT-06 | All virtual documents must open under the `skycms://` URI scheme as defined in [URI-Scheme.md](URI-Scheme.md). |
| FR-EDIT-07 | Each open virtual document must display a human-readable tab title (e.g., "Default Site Layout – Head") rather than the raw URI. |
| FR-EDIT-08 | Pressing `Ctrl+S` (`Cmd+S` on macOS) in a virtual document must send the current content to the appropriate `PUT` API endpoint. |
| FR-EDIT-09 | A successful save must mark the document clean (remove the unsaved-changes indicator from the tab). |
| FR-EDIT-10 | A failed save must show an error notification and leave the document in its modified (dirty) state so the user does not lose their changes. |
| FR-EDIT-11 | If loading the current value for an InputBox field fails, the extension must show an error and not open the InputBox. |
| FR-EDIT-12 | Pressing Escape in an InputBox must cancel with no API call. |
| FR-EDIT-13 | Confirming an InputBox value must call the corresponding PUT endpoint and refresh the visible node state. |
| FR-EDIT-14 | The **Published** InputBox must validate ISO 8601 values and allow empty input to clear the value (`null`). |

### Configuration

| ID | Requirement |
|---|---|
| FR-CFG-01 | The extension must expose a `skycms.editorUrl` setting that accepts the base URL of the SkyCMS Editor instance (e.g., `https://editor.mysite.com`). |
| FR-CFG-02 | If `skycms.editorUrl` is not set, the extension must prompt the user to configure it before attempting any API call. |
| FR-CFG-03 | The extension must support connecting to any SkyCMS Editor instance — cloud-hosted, Docker, or local — by changing `skycms.editorUrl`. |

### Server-Side API

| ID | Requirement |
|---|---|
| FR-API-01 | The SkyCMS Editor must expose all endpoints listed in [Data Access](06-Data-Access.md) under the `/api/vscode/` path prefix. |
| FR-API-02 | Every `/api/vscode/` endpoint except browser-auth bootstrap/exchange endpoints must require a valid bearer token and reject unauthenticated requests with HTTP 401. |
| FR-API-03 | Every `/api/vscode/` endpoint that writes data must restrict access to the **Administrators** and **Editors** roles and return HTTP 403 for all other authenticated users. |
| FR-API-04 | Read endpoints (`GET`) must be accessible to both **Administrators** and **Editors**. |
| FR-API-05 | The server must invalidate bearer tokens on `POST /api/vscode/auth/logout`. |

---

## Non-Functional Requirements

Non-functional requirements define quality attributes that apply across the entire codebase.

### License

| ID | Requirement |
|---|---|
| NFR-LIC-01 | The extension must be released under the **MIT License**. The `LICENSE` file must be present at the repository root. |

### Code Quality

| ID | Requirement |
|---|---|
| NFR-QA-01 | All source code must be written in **TypeScript** with `strict` mode enabled in `tsconfig.json`. No `any` casts without an explanatory comment. |
| NFR-QA-02 | The codebase must follow the **DRY** (Don't Repeat Yourself) principle. Logic that is needed in more than one place must be extracted into a shared function or module. |
| NFR-QA-03 | The API Client layer must follow a **CQRS** (Command Query Responsibility Segregation) pattern. Read operations (queries) and write operations (commands) must be implemented in separate classes or clearly separated namespaces within the client layer. |
| NFR-QA-04 | All exported classes, functions, interfaces, and public methods must carry **TSDoc** documentation comments. Documentation must describe purpose, parameters, return values, and thrown errors where relevant. |
| NFR-QA-05 | The three architectural layers — API Client, Tree Provider, Document Provider — must not mix concerns. The Tree Provider must not make HTTP calls directly. The Document Provider must not contain tree logic. |
| NFR-QA-06 | The extension must minimize npm dependencies. Prefer Node.js built-in modules and VS Code APIs over third-party packages. Each added dependency must be justified. |

### Testing

| ID | Requirement |
|---|---|
| NFR-TEST-01 | Unit test coverage must reach or exceed **95%** of statements across the extension source code. |
| NFR-TEST-02 | Tests must be runnable with a single command (`npm test`) from the repository root. |
| NFR-TEST-03 | Tests must not require a live SkyCMS instance. All API calls must be intercepted by mocks or stubs. |
| NFR-TEST-04 | Test files must live alongside the source files they test (e.g., `src/apiClient.test.ts` next to `src/apiClient.ts`). |
| NFR-TEST-05 | Coverage reports must be generated as part of the test run and written to a `coverage/` directory. |

See [Testing Strategy](10-Testing-Strategy.md) for the full testing plan.

### Security

| ID | Requirement |
|---|---|
| NFR-SEC-01 | Bearer tokens must be stored exclusively in VS Code `SecretStorage` under key `skycms.bearerToken`. They must not appear in settings, environment variables, output channels, or log files. |
| NFR-SEC-02 | Passwords must not be stored anywhere after the sign-in API call completes. |
| NFR-SEC-03 | All API communication must use HTTPS. The extension must not connect to an HTTP (non-TLS) `skycms.editorUrl` without warning the user. |
| NFR-SEC-04 | The extension must not execute content received from the API as code. Virtual document content must be treated as plain text or markup only. |
| NFR-SEC-05 | The server-side API must validate all input. It must not pass unsanitized content from the extension directly into database queries. |

### Versioning

| ID | Requirement |
|---|---|
| NFR-VER-01 | The extension must follow **Semantic Versioning**: `MAJOR.MINOR.PATCH`. |
| NFR-VER-02 | `MAJOR` increments when a breaking change is made to the extension's behavior or the API contract. |
| NFR-VER-03 | `MINOR` increments when new features are added in a backward-compatible way. |
| NFR-VER-04 | `PATCH` increments for backward-compatible bug fixes. |
| NFR-VER-05 | The version in `package.json` must match the version in `CHANGELOG.md` at every release. |

### Performance

| ID | Requirement |
|---|---|
| NFR-PERF-01 | The extension must not block VS Code's UI thread. All API calls must be asynchronous. |
| NFR-PERF-02 | The initial tree render (top-level categories) must complete within 2 seconds on a local SkyCMS instance. |
| NFR-PERF-03 | A node expansion (loading children) must complete within 3 seconds under normal network conditions. |

### Compatibility

| ID | Requirement |
|---|---|
| NFR-COMPAT-01 | The extension must target VS Code **1.85.0** or later (the version that introduced stable `SecretStorage`). |
| NFR-COMPAT-02 | The extension must function on Windows, macOS, and Linux. |
| NFR-COMPAT-03 | The extension must connect to any SkyCMS instance version that exposes the `/api/vscode/` endpoints, regardless of the SkyCMS database backend (SQL Server, MySQL, SQLite, Cosmos DB). |

---

## Constraints

Constraints are hard limits that cannot be negotiated or phased. They differ from requirements in that they cannot be traded off against other concerns.

| ID | Constraint |
|---|---|
| C-01 | The extension must communicate with SkyCMS exclusively through the `/api/vscode/` API endpoints. Direct database connections are not permitted under any circumstance. |
| C-02 | The server-side API must enforce SkyCMS role checks on every endpoint. The extension must not rely solely on client-side role checks. |
| C-03 | The `skycms://` URI scheme must be the only URI scheme used for virtual documents. Extensions to the scheme (new entity types, new fields) must follow the pattern defined in [URI-Scheme.md](URI-Scheme.md). |
| C-04 | The extension must not modify, extend, or replace SkyCMS's existing user or role management. It must use the role system as-is. |

---

## Traceability

Each requirement should be traceable to at least one of the following:

- A unit test (referenced by test file and test name)
- A phase in [Phased Execution](07-Phased-Execution.md)
- A section of [Architecture](03-Architecture.md)

Requirement traceability tracking is a Phase 3 documentation task.

---

[← Back to Index](00-Index.md)
