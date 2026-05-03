# Virtual Documents

[← Back to Index](00-Index.md)

This document explains what virtual documents are, why the SkyCMS Explorer uses them, and how they work — both for reading content and for saving it back to SkyCMS.

---

## What a Virtual Document Is

In VS Code, a **virtual document** is a file that opens in an editor tab but does not correspond to a file on disk. The extension generates the content on demand and presents it to VS Code as if it were a file.

Virtual documents are created using VS Code's [`TextDocumentContentProvider`](https://code.visualstudio.com/api/extension-guides/virtual-documents) API. The extension registers this provider for a custom URI scheme — in this case, `skycms://`. Whenever VS Code encounters a URI with that scheme, it asks the extension to supply the content.

This is the right model for SkyCMS because CMS content lives in a database, not on disk. There is no file to open. Virtual documents let the extension present that content in the editor without creating temporary files.

---

## How It Works: Reading

When a developer clicks a payload node in the tree (for example, **Header** under the Default Layout), the tree sends a command to VS Code to open this URI:

```
skycms://layouts/1/header
```

VS Code sees the `skycms://` scheme and asks the `SkyCmsDocumentProvider` to supply content for that URI.

The Document Provider:

1. Parses the URI to identify the entity type, ID/number, version (if applicable), and field name
2. Calls the API Client to fetch the payload from the SkyCMS API
3. Returns the content string to VS Code

VS Code opens a new editor tab. The tab's title shows the URI (or a friendly name derived from it). The language mode is set based on the field — `html` for all layout and article fields, `plaintext` for template descriptions.

---

## How It Works: Saving

VS Code's `TextDocumentContentProvider` is read-only by default. To support saving, the extension also registers a **custom save handler** using the [`onWillSaveTextDocument`](https://code.visualstudio.com/api/references/vscode-api#workspace.onWillSaveTextDocument) event.

When the developer presses `Ctrl+S` (or `Cmd+S`) in a virtual document tab:

1. VS Code fires `onWillSaveTextDocument` for that document's URI
2. The extension checks whether the URI scheme is `skycms://`
3. If it is, the extension calls the API Client to `PUT` the current document content to the corresponding SkyCMS API endpoint
4. On success, VS Code marks the document as clean (the "unsaved dot" disappears from the tab title)
5. On failure, the extension shows an error notification and the document remains dirty

The developer does not lose their changes on failure — VS Code keeps the modified content in the editor until the save succeeds.

---

## Language Modes

The correct language mode ensures syntax highlighting, formatting, and IntelliSense work correctly.

| URI pattern | Language mode | Notes |
|---|---|---|
| `skycms://layouts/*/notes` | `html` | |
| `skycms://layouts/*/head` | `html` | `<head>` content |
| `skycms://layouts/*/header` | `html` | body header |
| `skycms://layouts/*/footer` | `html` | body footer |
| `skycms://templates/*/content` | `html` | |
| `skycms://templates/*/description` | `plaintext` | |
| `skycms://articles/*/introduction` | `plaintext` | max 512 chars |
| `skycms://articles/*/content` | `html` | |
| `skycms://articles/*/headerJavaScript` | `html` | injected into `<head>` |
| `skycms://articles/*/footerJavaScript` | `html` | injected at end of `<body>` |

Language mode is determined by the field name, not by a server-supplied flag. The extension sets it after opening the document.

### Fields that do not use virtual documents

Input-mode fields (Title, Published, Banner Image, Category, Layout Name) do not open a document tab. Clicking them triggers a VS Code `InputBox`. They are not registered with the `SkyCmsDocumentProvider` and have no `skycms://` URI.

---

## URI Scheme

All virtual documents in this extension use URIs of the form:

```
skycms://{entityType}/{...identifiers}/{field}
```

The full URI specification is in [URI-Scheme.md](URI-Scheme.md).

---

## Tab Title

By default, VS Code displays the full URI as the tab title, which would look like:

```
skycms://layouts/1/3/head
```

That is readable but not friendly. The extension sets a human-readable title using the `label` property when calling `vscode.workspace.openTextDocument` and then `vscode.window.showTextDocument`. The title will be:

```
Default Site Layout – Header
```

---

## Read-Only Documents

Some documents should be read-only — for example, a published layout version that the user does not have permission to edit, or any entity when the user is signed in with a restricted role.

The extension marks these documents read-only by setting `vscode.workspace.openTextDocument` with `{ content, readonly: true }` (or by returning a read-only URI). The editor shows a lock icon in the tab and prevents the user from typing.

This is a Phase 2 feature; all documents in Phase 1 are editable.

---

## Relationship to FileSystemProvider

A later phase may register a `FileSystemProvider` instead of (or in addition to) the `TextDocumentContentProvider`. This would allow:

- Native diff (`git diff`-style comparisons between layout versions)
- Rename via the Explorer UI
- Drag-and-drop between entities
- Integration with VS Code's built-in file operations

The `skycms://` URI scheme is already compatible with `FileSystemProvider`. Migrating from virtual documents to a full filesystem provider does not require changing the URI design.

See [Design Principles](02-Design-Principles.md#4-domain-aware-not-filesystem-aware) for why the MVP uses virtual documents rather than a filesystem provider.

---

[← Back to Index](00-Index.md)

