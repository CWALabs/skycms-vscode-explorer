# Virtual Documents

[← Back to Index](00-Index.md)

This document explains what virtual documents are, why the SkyCMS Explorer uses them, and how they work — both for reading content and for saving it back to SkyCMS.

---

## What a Virtual Document Is

In VS Code, a **virtual document** is a file that opens in an editor tab but does not correspond to a file on disk. The extension generates the content on demand and presents it to VS Code as if it were a real file.

This is the right model for SkyCMS because CMS content lives in a database, not on disk. There is no file to open. Virtual documents let the extension present that content in the editor without creating temporary files.

The extension uses VS Code's [`FileSystemProvider`](https://code.visualstudio.com/api/extension-guides/virtual-documents#file-system-api) API — specifically `SkyCmsFieldFileSystemProvider` — registered for the custom `skycms:` URI scheme. This gives editor tabs full parity with real workspace files: save integration, dirty indicators, diff support, and language-aware editing all work without any custom wiring.

---

## How It Works: Reading

When a developer clicks a field node in the tree (for example, **Footer** under the Default Layout), the extension opens this URI:

```
skycms:/layouts/0/footer/Layout - Footer
```

VS Code sees the `skycms:` scheme and calls `readFile` on `SkyCmsFieldFileSystemProvider`.

The provider:

1. Parses the URI to identify the entity type, ID/number, version (if applicable), and field name
2. Calls the API Client to fetch the field content from the SkyCMS API
3. Returns the content as bytes to VS Code

VS Code opens a new editor tab. The tab title shows a human-readable label derived from the entity and field name (for example, `Layout - Footer`). The language mode is set based on the field — `html` for all layout and article fields, `plaintext` for template descriptions.

---

## How It Works: Saving

Because the extension uses `FileSystemProvider`, saving works exactly like saving a regular file on disk. No custom save command is needed.

**To save:** press `Ctrl+S` (Windows/Linux) or `Cmd+S` (macOS), or use **File → Save**. VS Code calls `writeFile` on `SkyCmsFieldFileSystemProvider`, which sends the content to the SkyCMS API.

**Dirty indicator:** When you edit content in a tab, VS Code automatically shows a dot (●) next to the tab title — the same dot you see when editing any workspace file. No special extension logic is needed for this; it is standard `FileSystemProvider` behavior.

**On failure:** If the API call fails, VS Code shows an error notification and the tab remains dirty. Your edits are not lost — VS Code keeps the modified content in the editor until the save succeeds.

**Read-only tabs:** Layout version tabs (opened from the **Layout Versions** category) are intentionally read-only. `writeFile` throws `NoPermissions` for those URIs, so pressing `Ctrl+S` has no effect. These tabs are for reviewing archived versions, not editing.

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

The extension computes a human-readable label and appends it as the last segment of the URI path. VS Code decodes that segment and uses it as the tab title.

The label format is:

```
{Entity} - {Field}
```

For example, a layout's footer field opens with the tab title:

```
Layout - Footer
```

A versioned layout field (read-only) uses:

```
Layout Version 3 - Head
```

For articles and templates the entity label (the actual title) is used:

```
My Article - Content
```

---

## Read-Only Documents

Layout version tabs are read-only. They open from the **Layout Versions** category in the tree and show archived snapshots of a layout field. The `writeFile` handler rejects saves for these URIs with a permissions error, so `Ctrl+S` does nothing.

All other document tabs (editable layout fields, template fields, article fields) are read/write.

---

[← Back to Index](00-Index.md)

