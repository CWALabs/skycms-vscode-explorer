# Data Access

[← Back to Index](00-Index.md)

This document covers how the extension communicates with SkyCMS, how authentication works, and what API endpoints the SkyCMS Editor server must expose.

---

## Why API, Not Direct Database

The extension does not connect to the SkyCMS database directly. All data access goes through HTTP API endpoints hosted by the SkyCMS Editor.

This is not a compromise — it is the correct design. See [Design Principles §3](02-Design-Principles.md#3-api-backed-not-database-direct) for the full reasoning. In short:

- SkyCMS controls access through user roles (Editor, Administrator). A direct database connection bypasses that control entirely.
- The database schema is an internal implementation detail. The API exposes a stable contract.
- The extension does not need to know which database engine SkyCMS uses.

---

## Authentication

### Sign-In Flow

1. The developer runs the **SkyCMS: Sign In** command in VS Code.
2. The extension prompts for a username and password using VS Code's `InputBox` API.
3. The extension sends a `POST` request to `/api/vscode/auth/login` with the credentials.
4. On success, the server returns a bearer token (JWT or opaque token — implementation detail of SkyCMS).
5. The extension stores the token in VS Code's `SecretStorage` (an encrypted, per-extension credential store).
6. The extension fires `onDidChangeTreeData` to refresh the tree with authenticated data.

### Token Usage

Every subsequent API request includes the header:

```
Authorization: Bearer <token>
```

### Token Expiry and Revocation

If the server returns `401 Unauthorized` on any request:

1. The extension clears the stored token.
2. The extension shows a notification: "SkyCMS session expired. Please sign in again."
3. The tree reverts to the unauthenticated state (shows "Sign in to SkyCMS…").

If the server returns `403 Forbidden`:

1. The extension shows a notification: "Access denied. Your account does not have Editor or Administrator access."
2. The token is not cleared (the user is authenticated but insufficiently privileged).

### Sign-Out

The developer runs **SkyCMS: Sign Out**. The extension:

1. Sends `POST /api/vscode/auth/logout` (so the server can invalidate the token server-side).
2. Clears the stored token from SecretStorage.
3. Refreshes the tree to the unauthenticated state.

---

## Response Shapes

Endpoints use one of two response shapes depending on the field type:

**Document fields** (multi-line content opened in editor tabs):
```json
{ "content": "<p>HTML or text content here</p>" }
```

**Input fields** (short values edited via InputBox):
```json
{ "value": "Some text" }
```

For `Published`, the value is an ISO 8601 string or `null`:
```json
{ "value": "2026-06-01T09:00:00Z" }
{ "value": null }
```

GET and PUT always use the same shape for a given field.

---

## SkyCMS API Endpoint Contract

These endpoints must be implemented on the SkyCMS Editor server. They are grouped by resource. All endpoints require a valid bearer token for an account with the **Editor** or **Administrator** role.

### Base URL

All endpoints are relative to the SkyCMS Editor host URL, which is configured in VS Code settings as `skycms.editorUrl`. Example:

```
https://editor.mysite.com/api/vscode/
```

---

### Authentication Endpoints

#### `POST /api/vscode/auth/login`

Authenticates a user and returns a bearer token.

**Request body:**
```json
{
  "username": "dev@example.com",
  "password": "..."
}
```

**Response (200):**
```json
{
  "token": "eyJ...",
  "role": "Administrator",
  "displayName": "Dev User"
}
```

**Response (401):** Invalid credentials.
**Response (403):** Valid credentials but insufficient role.

---

#### `POST /api/vscode/auth/logout`

Invalidates the current bearer token server-side.

**Request:** Bearer token in header, no body.
**Response (200):** Empty body.

---

#### `GET /api/vscode/auth/me`

Returns the current user's identity and role. Used on extension activation to check whether a stored token is still valid.

**Response (200):**
```json
{
  "username": "dev@example.com",
  "displayName": "Dev User",
  "role": "Editor"
}
```

**Response (401):** Token is invalid or expired.

---

### Layout Endpoints

#### `GET /api/vscode/layouts`

Returns all layout records.

**Response (200):**
```json
[
  {
    "layoutNumber": 1,
    "name": "Default Site Layout",
    "isDefault": true
  },
  {
    "layoutNumber": 2,
    "name": "Article Layout",
    "isDefault": false
  }
]
```

---

#### `GET /api/vscode/layouts/{layoutNumber}/layoutName`

Returns the current layout name.

**Response (200):** `{ "value": "Default Site Layout" }`

---

#### `PUT /api/vscode/layouts/{layoutNumber}/layoutName`

Updates the layout name.

**Request body:** `{ "value": "My Updated Layout Name" }`
**Response (200):** Empty body.

---

#### `GET /api/vscode/layouts/{layoutNumber}/notes`

Returns the layout notes (HTML).

**Response (200):** `{ "content": "<p>Internal notes here.</p>" }`

---

#### `PUT /api/vscode/layouts/{layoutNumber}/notes`

Saves updated layout notes. Same shape as other document PUT endpoints.

---

#### `GET /api/vscode/layouts/{layoutNumber}/head`

Returns the `<head>` markup for the current editable version of a layout. The server resolves which version is editable.

**Response (200):**
```json
{
  "content": "<meta charset=\"utf-8\">\n  <title>My Site</title>"
}
```

---

#### `PUT /api/vscode/layouts/{layoutNumber}/head`

Saves updated `<head>` markup.

**Request body:**
```json
{
  "content": "<meta charset=\"utf-8\">\n  <title>My Site</title>"
}
```

**Response (200):** Empty body.

---

#### `GET /api/vscode/layouts/{layoutNumber}/header`

Returns the visible page header HTML (`HtmlHeader`) for the current editable version.

**Response (200):**
```json
{
  "content": "<header>...</header>"
}
```

---

#### `PUT /api/vscode/layouts/{layoutNumber}/header`

Saves updated page header HTML. Same shape as `PUT /head`.

---

#### `GET /api/vscode/layouts/{layoutNumber}/footer`

Returns the footer HTML content (`FooterHtmlContent`) for the current editable version.

**Response (200):** Same shape as `/head`.

---

#### `PUT /api/vscode/layouts/{layoutNumber}/footer`

Saves updated footer HTML. Same shape as `PUT /head`.

---

### Template Endpoints

#### `GET /api/vscode/templates`

Returns all page templates.

**Response (200):**
```json
[
  {
    "templateId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Home Page",
    "layoutNumber": 1
  }
]
```

---

#### `GET /api/vscode/templates/{templateGuid}/title`

Returns the current template title.

**Response (200):** `{ "value": "Home Page" }`

---

#### `PUT /api/vscode/templates/{templateGuid}/title`

Updates the template title.

**Request body:** `{ "value": "Updated Title" }`
**Response (200):** Empty body.

---

#### `GET /api/vscode/templates/{templateGuid}/content`

Returns the HTML content body of a template.

**Response (200):**
```json
{
  "content": "<section>...</section>"
}
```

---

#### `PUT /api/vscode/templates/{templateGuid}/content`

Saves updated template content.

**Request body:** `{ "content": "..." }`
**Response (200):** Empty body.

---

#### `GET /api/vscode/templates/{templateGuid}/description`

Returns the description/notes for a template.

**Response (200):**
```json
{
  "content": "Use this template for the home page. Includes hero banner slot."
}
```

---

#### `PUT /api/vscode/templates/{templateGuid}/description`

Saves updated template description.

**Request body:** `{ "content": "..." }`
**Response (200):** Empty body.

---

### Article Endpoints

#### `GET /api/vscode/articles`

Returns all articles, grouped by lifecycle state.

**Response (200):**
```json
{
  "drafts": [
    { "articleNumber": 100, "title": "Welcome" }
  ],
  "published": [
    { "articleNumber": 101, "title": "Getting Started" }
  ]
}
```

---

#### `GET /api/vscode/articles/{articleNumber}/content`

Returns the main HTML content body of an article. The server resolves which version is editable.

**Response (200):**
```json
{
  "content": "<p>Welcome to my site.</p>"
}
```

---

#### `PUT /api/vscode/articles/{articleNumber}/content`

Saves updated article content.

**Request body:** `{ "content": "..." }`
**Response (200):** Empty body.

---

#### `GET /api/vscode/articles/{articleNumber}/published`

Returns the article's scheduled publish date, or `null` if unpublished.

**Response (200):** `{ "value": "2026-06-01T09:00:00Z" }` or `{ "value": null }`

---

#### `PUT /api/vscode/articles/{articleNumber}/published`

Sets or clears the publish date. Send `null` to unpublish.

**Request body:** `{ "value": "2026-06-01T09:00:00Z" }` or `{ "value": null }`
**Response (200):** Empty body.

---

#### `GET /api/vscode/articles/{articleNumber}/title`

Returns the current article title.

**Response (200):** `{ "value": "Welcome to My Site" }`

---

#### `PUT /api/vscode/articles/{articleNumber}/title`

Updates the article title.

**Request body:** `{ "value": "Updated Title" }`
**Response (200):** Empty body.

---

#### `GET /api/vscode/articles/{articleNumber}/bannerImage`

Returns the current banner image URL.

**Response (200):** `{ "value": "/images/hero.jpg" }` or `{ "value": "" }`

---

#### `PUT /api/vscode/articles/{articleNumber}/bannerImage`

Updates the banner image URL. Send an empty string to clear it.

**Request body:** `{ "value": "/images/hero.jpg" }`
**Response (200):** Empty body.

---

#### `GET /api/vscode/articles/{articleNumber}/category`

Returns the article category label.

**Response (200):** `{ "value": "Engineering" }`

---

#### `PUT /api/vscode/articles/{articleNumber}/category`

Updates the category label.

**Request body:** `{ "value": "Engineering" }`
**Response (200):** Empty body.

---

#### `GET /api/vscode/articles/{articleNumber}/introduction`

Returns the article's `Introduction` field (introductory summary).

**Response (200):** Same shape as `/content`.

---

#### `PUT /api/vscode/articles/{articleNumber}/introduction`

Saves updated article introduction.

**Request body:** `{ "content": "..." }`
**Response (200):** Empty body.

---

#### `GET /api/vscode/articles/{articleNumber}/headerJavaScript`

Returns the article's header script block (content for injection into `<head>`).

**Response (200):** Same shape as `/content`.

---

#### `PUT /api/vscode/articles/{articleNumber}/headerJavaScript`

Saves updated header scripts.

**Request body:** `{ "content": "..." }`
**Response (200):** Empty body.

---

#### `GET /api/vscode/articles/{articleNumber}/footerJavaScript`

Returns the article's footer script block (content injected at the end of `<body>`).

**Response (200):** Same shape as `/content`.

---

#### `PUT /api/vscode/articles/{articleNumber}/footerJavaScript`

Saves updated footer scripts.

**Request body:** `{ "content": "..." }`
**Response (200):** Empty body.

---

## Error Handling Summary

| HTTP Status | Extension behavior |
|---|---|
| 200 | Success — return data or confirm save |
| 401 | Clear token, show "session expired" notification, revert tree |
| 403 | Show "access denied" notification, keep token |
| 404 | Show "entity not found" notification |
| 409 | Show "conflict" notification with server message |
| 5xx | Show "server error" notification with status code |
| Network error | Show "cannot reach SkyCMS Editor" notification |

---

## Configuration

The developer sets the SkyCMS Editor URL in VS Code settings:

```json
{
  "skycms.editorUrl": "https://editor.mysite.com"
}
```

This is the only configuration the extension requires. Credentials are stored in SecretStorage after sign-in and are not surfaced in settings (which would be plain text).

---

[← Back to Index](00-Index.md)

