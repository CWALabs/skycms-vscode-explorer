# Data Access

[← Back to Index](00-Index.md)

This document explains how the extension talks to SkyCMS, how sign-in works, and which API contract the extension depends on.

---

## Why API, Not Direct Database

The extension does not connect to the SkyCMS database directly.

All reads and writes flow through SkyCMS Editor API endpoints.

This preserves role-based access control, keeps schema details internal to SkyCMS, and gives the extension a stable integration contract.

---

## Authentication

### Sign-in flow

1. The developer runs SkyCMS: Sign In.
2. The extension calls `GET /api/vscode/auth/browser/start`.
3. The API returns `loginUrl` and `state`.
4. The extension opens the browser to `loginUrl`.
5. The extension polls `GET /api/vscode/auth/poll?state=...`.
6. When poll returns `complete`, the extension calls `POST /api/vscode/auth/browser/exchange`.
7. The API returns bearer token metadata.
8. The extension stores the token in VS Code SecretStorage.

SkyCMS can require a one-time verification code during this browser flow. The extension captures that value and completes the exchange request.

### Auth header

Every authenticated request includes:

```text
Authorization: Bearer <token>
```

### Expiry and revocation

If the API returns `401`:

1. Clear the stored token.
2. Prompt the user to sign in again.
3. Refresh the tree to unauthenticated state.

If the API returns `403`:

1. Keep the token.
2. Show access denied for insufficient role.

### Sign-out

SkyCMS: Sign Out triggers:

1. `POST /api/vscode/auth/logout`
2. Token removal from SecretStorage
3. Tree refresh

---

## Payload shapes

Document fields use:

```json
{ "content": "<p>HTML or text content here</p>" }
```

Input fields use:

```json
{ "value": "Some text" }
```

Nullable publish date example:

```json
{ "value": "2026-06-01T09:00:00Z" }
```

```json
{ "value": null }
```

---

## Base URL

All routes are relative to configured `skycms.editorUrl`.

Example:

```text
https://editor.mysite.com/api/vscode/
```

---

## Endpoint contract

This is the practical contract the extension depends on. For full method-to-route mapping, see [Endpoint Contract Matrix](13-Endpoint-Contract-Matrix.md).

Contract source files in this repository:

- `src/apiClient/queries.ts`
- `src/apiClient/commands.ts`
- `package.json` (command registrations and labels)

### Authentication endpoints

- `GET /api/vscode/auth/browser/start`
- `GET /api/vscode/auth/poll?state={state}`
- `POST /api/vscode/auth/browser/exchange`
- `POST /api/vscode/auth/logout`
- `GET /api/vscode/auth/me`

`GET /api/vscode/auth/me` returns current authenticated identity and role context used by extension startup/session checks.

### Layout endpoints

- `GET /api/vscode/layouts`
- `GET /api/vscode/layouts/{layoutNumber}/versions`
- `GET /api/vscode/layouts/{layoutNumber}/{fieldKey}`
- `GET /api/vscode/layouts/{layoutNumber}/{version}/{fieldKey}`
- `PUT /api/vscode/layouts/{layoutNumber}/{fieldKey}`
- `POST /api/vscode/layouts/{layoutNumber}/{version}/publish`
- `POST /api/vscode/layouts/{layoutNumber}/{version}/set-default`
- `POST /api/vscode/layouts/{layoutNumber}/versions`

### Template endpoints

- `GET /api/vscode/templates`
- `GET /api/vscode/templates/{templateId}/{fieldKey}`
- `PUT /api/vscode/templates/{templateId}/{fieldKey}`
- `POST /api/vscode/templates`

### Article and blog endpoints

- `GET /api/vscode/articles`
- `GET /api/vscode/articles/{articleNumber}/{fieldKey}`
- `PUT /api/vscode/articles/{articleNumber}/{fieldKey}`
- `POST /api/vscode/articles/{articleNumber}/publish`
- `POST /api/vscode/articles/{articleNumber}/unpublish`
- `POST /api/vscode/articles/{articleNumber}/restore`
- `GET /api/vscode/articles/{articleNumber}/versions?skip={skip}&take={take}`
- `GET /api/vscode/articles/{articleNumber}/versions/{versionId}/{fieldKey}`
- `POST /api/vscode/articles`
- `GET /api/vscode/blogs/{blogKey}/posts`

### File and folder endpoints

These routes use URL-safe Base64 path hashes in route segments.

- `GET /api/vscode/files/{pathHash?}`
- `GET /api/vscode/files/{pathHash}/stat`
- `GET /api/vscode/files/{pathHash}/read`
- `POST /api/vscode/files/{pathHash}`
- `DELETE /api/vscode/files/{pathHash}`
- `POST /api/vscode/files/{pathHash}/move`
- `POST /api/vscode/folders/{pathHash}`
- `DELETE /api/vscode/folders/{pathHash}`
- `POST /api/vscode/folders/{pathHash}/move`

Move payload shape:

```json
{ "destination": "/pub/new/path/file-or-folder" }
```

The extension does not use FileManager connector commands for file CRUD.
All editor operations route through `/api/vscode/files/*` and `/api/vscode/folders/*` endpoints.

---

## Error handling summary

| HTTP status | Extension behavior |
| --- | --- |
| 200 | Success. |
| 401 | Clear token, prompt sign-in, refresh tree. |
| 403 | Show access denied, keep token. |
| 404 | Show not found for missing entity/path. |
| 409 | Show conflict with server message when available. |
| 5xx | Show server error notification. |
| Network failure | Show connectivity error to SkyCMS Editor. |

---

## Configuration

Set the SkyCMS Editor URL in VS Code settings:

```json
{
  "skycms.editorUrl": "https://editor.mysite.com"
}
```

Credentials are stored in SecretStorage, not in plain-text settings.

---

[← Back to Index](00-Index.md)
