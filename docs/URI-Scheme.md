# SkyCMS Virtual Document URI Scheme

[← Back to Index](00-Index.md)

All content opened by the SkyCMS Explorer uses URIs with the `skycms://` scheme. This document is the full specification for those URIs.

---

## Why a Custom URI Scheme

VS Code identifies every open document by its URI. A custom URI scheme tells VS Code that this document does not live on disk — it lives in the extension. VS Code routes read and write operations for `skycms://` URIs to the `SkyCmsDocumentProvider`.

The scheme also encodes exactly where the content lives in SkyCMS (entity type, identifier, field name) so the provider can reconstruct any API request purely from the URI, without additional state.

---

## Scope of the URI Scheme

The `skycms://` URI scheme covers **document nodes only** — fields that open in a VS Code editor tab. Short-value fields (Title, Published, Banner Image, Category, Layout Name) use a VS Code `InputBox` instead and are not assigned `skycms://` URIs. They share the same GET/PUT API endpoints but have no URI representation in the extension.

---

## General Pattern

```
skycms://{entityType}/{...identifiers}/{field}
```

| Segment | Meaning |
|---|---|
| `entityType` | The SkyCMS entity category: `layouts`, `templates`, or `articles` |
| `...identifiers` | One or more path segments that uniquely identify the entity |
| `field` | The specific payload field being opened |

---

## Layout URIs

Layouts are identified by their **layout number** (the family identifier). The SkyCMS server resolves which version is currently editable — the client does not track or specify version numbers.

```
skycms://layouts/{layoutNumber}/{field}
```

| Field | Content | Maps to `Layout` property |
|---|---|---|
| `notes` | Notes and internal documentation | `Notes` |
| `head` | Content injected into the page `<head>` | `Head` |
| `header` | Visible page header HTML | `HtmlHeader` |
| `footer` | Page footer HTML content | `FooterHtmlContent` |

**Examples:**

```
skycms://layouts/1/notes     ← Layout 1, notes
skycms://layouts/1/head      ← Layout 1, HEAD content
skycms://layouts/1/header    ← Layout 1, page header HTML
skycms://layouts/1/footer    ← Layout 1, footer HTML
```

---

## Template URIs

Templates are identified by their **template ID** (a UUID). Templates are not versioned.

```
skycms://templates/{templateGuid}/{field}
```

| Field | Content | Maps to `Template` property |
|---|---|---|
| `content` | The template's HTML content body | `Content` |
| `description` | Description/usage notes for the template | `Description` |

**Examples:**

```
skycms://templates/a1b2c3d4-e5f6-7890-abcd-ef1234567890/content      ← Template content body
skycms://templates/a1b2c3d4-e5f6-7890-abcd-ef1234567890/description  ← Template description
```

---

## Article URIs

Articles are identified by their **article number** (the logical article identifier, shared across all versions). The SkyCMS server resolves which version is currently editable — the client does not track version numbers.

```
skycms://articles/{articleNumber}/{field}
```

| Field | Content | Maps to `Article` property |
|---|---|---|
| `introduction` | The article's introductory summary | `Introduction` |
| `content` | The article's main HTML body | `Content` |
| `headerJavaScript` | Script/markup injected into `<head>` | `HeaderJavaScript` |
| `footerJavaScript` | Script/markup injected at end of `<body>` | `FooterJavaScript` |

All article document fields use `html` language mode. `introduction` uses `plaintext`.

**Examples:**

```
skycms://articles/100/introduction       ← Article 100, introduction
skycms://articles/100/content            ← Article 100, main body
skycms://articles/100/headerJavaScript   ← Article 100, head scripts
skycms://articles/100/footerJavaScript   ← Article 100, footer scripts
```

---

## Tab Title Convention

The URI alone is not a friendly tab title. The `SkyCmsDocumentProvider` sets a human-readable title by looking up the entity name from its in-memory cache of the tree data.

| URI | Tab title |
|---|---|
| `skycms://layouts/1/notes` | `Default Site Layout – Notes` |
| `skycms://layouts/1/head` | `Default Site Layout – Head` |
| `skycms://layouts/1/header` | `Default Site Layout – Header` |
| `skycms://layouts/1/footer` | `Default Site Layout – Footer` |
| `skycms://templates/{guid}/content` | `Home Page – Content` |
| `skycms://templates/{guid}/description` | `Home Page – Description` |
| `skycms://articles/100/introduction` | `Welcome – Introduction` |
| `skycms://articles/100/content` | `Welcome – Content` |
| `skycms://articles/100/headerJavaScript` | `Welcome – Header JS` |
| `skycms://articles/100/footerJavaScript` | `Welcome – Footer JS` |

---

## URI Parsing

The Document Provider parses the URI path to extract the segments:

```typescript
// Example: skycms://layouts/1/header
const parts = uri.path.split('/').filter(Boolean);
// parts = ['layouts', '1', 'header']
//          [0]        [1]  [2]

const entityType = parts[0];             // 'layouts'
const field      = parts[parts.length - 1]; // 'header'
// identifiers = parts[1..n-1] = ['1']
```

This parsing logic works for all three entity types without special cases. The identifier is always a single segment (layout number, template UUID, or article number).

---

## Future URI Extensions

Additional fields or entity types can be added by extending the pattern without breaking existing URIs.

Possible future URIs:

```
skycms://layouts/{layoutNumber}/scripts    ← Layout inline scripts (Phase 4)
skycms://articles/{articleNumber}/metadata ← Article metadata block (Phase 4)
skycms://sites/{siteId}/config             ← Site-level config (Phase 4, multi-site)
```

---

[← Back to Index](00-Index.md)

