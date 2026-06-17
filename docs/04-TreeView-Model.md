# TreeView Model

[← Back to Index](00-Index.md)

This document defines the exact structure of the SkyCMS Explorer tree — every level, every node type, and what clicking each node does.

The tree appears in the VS Code Explorer sidebar as a collapsible section labeled **SkyCMS**.

---

## Full Tree Structure

```
SkyCMS
├─ [Sign In]                              ← shown only when not authenticated
│
├─ [Site Root]                            ← active site label, for example "My Site (website)"
│  ├─ Layouts
│  ├─ Page Templates
│  ├─ Articles
│  └─ Files
│
├─ Layouts                                ← shown under Site Root
│  ├─ Default Site Layout                 ← displays LayoutName
│  │  ├─ Layout Name     [input · text]
│  │  ├─ Notes           [doc · html]
│  │  ├─ Head            [doc · html]
│  │  ├─ Header          [doc · html]
│  │  └─ Footer          [doc · html]
│  └─ Article Layout
│     └─ (same children)
│
├─ Page Templates                         ← shown under Site Root
│  ├─ Home Page                           ← displays Title
│  │  ├─ Title           [input · text]
│  │  ├─ Content         [doc · html]
│  │  └─ Description     [doc · text]
│  └─ Article Page
│     └─ (same children)
│
├─ Articles                               ← shown under Site Root
   ├─ Drafts
   │  └─ Welcome                          ← displays Title
   │     ├─ Published    [input · datetime]
   │     ├─ Title        [input · text]
   │     ├─ Banner Image [input · url]
   │     ├─ Category     [input · text]
   │     ├─ Introduction [doc · text]
   │     ├─ Content      [doc · html]
   │     ├─ Header JS    [doc · html]
   │     └─ Footer JS    [doc · html]
   └─ Published
      └─ (same children per article)

   └─ Files                                  ← shown under Site Root
      └─ /pub and descendants
```

**Legend:**
- `[input · text]` — clicking opens a VS Code InputBox pre-populated with the current value; saving calls a PUT endpoint
- `[input · datetime]` — same, but accepts an ISO 8601 date/time string or empty (clears the value)
- `[input · url]` — same, but accepts a URL string
- `[doc · html]` — clicking opens a virtual document tab with `html` language mode
- `[doc · text]` — clicking opens a virtual document tab with `plaintext` language mode

**What is displayed in the tree vs. what is used for API calls:**

| Entity | Tree displays | API call uses | Type |
|---|---|---|---|
| Layout | `LayoutName` | `LayoutNumber` | `int` |
| Template | `Title` | `Guid Id` | UUID string |
| Article | `Title` | `ArticleNumber` | `int` |

The SkyCMS server handles version resolution. The client passes a logical identifier (`LayoutNumber`, `ArticleNumber`, or Template `Guid`) and the server always returns the current editable version. The tree never needs to show or manage version numbers.

---

## Node Types

### Root Nodes (Category Headers)

`Layouts`, `Page Templates`, and `Articles` are the three top-level categories. They are always visible once the user is signed in. They have no associated document — clicking them only expands or collapses the section.

`Files` is also a top-level category and exposes SkyCMS blob storage rooted at `/pub`.

These map to `vscode.TreeItemCollapsibleState.Collapsed` (or `Expanded` if the user has previously opened them, which VS Code remembers).

---

### Node Interaction Modes

Every child node has one of two interaction modes. The tree uses a different icon to distinguish them at a glance.

**Document nodes** (`[doc]`) — for multi-line content:
- Clicking opens a virtual document tab in the editor
- The tab uses the appropriate language mode (`html` or `plaintext`)
- Saving with `Ctrl+S` / `Cmd+S` calls the PUT endpoint
- All layout, template, and article content fields use this mode

**Input nodes** (`[input]`) — for short values:
- Clicking opens a VS Code `InputBox` pre-populated with the current value (fetched via GET)
- The user edits the value and presses Enter to confirm
- Confirming calls the PUT endpoint; pressing Escape cancels with no change
- Title, Published, Banner Image, and Category use this mode

The two modes share the same underlying GET/PUT API contract. They differ only in how the value is presented to the developer.

---

### Files Path Presentation

File and folder nodes can carry two path representations:

| Field | Meaning | Used for |
|---|---|---|
| `path` | Canonical storage path (for example `/pub/articles/42`) | All operations (open, save, rename, move, delete, upload target) |
| `displayPath` | Friendly path (for example `/pub/articles/My Article Title`) | Tree `description`, tooltips, and file-search matching text |

When both are present, the explorer shows the friendly path in UI text and includes the canonical path in tooltip metadata.
For article paths, tooltips also surface the numeric article number when it can be derived from canonical storage path.

---

### Layout Node

A **Layout** represents a single layout record in SkyCMS. Its display name comes from the `LayoutName` field. The SkyCMS server tracks versions internally; the extension always works with the current editable version by passing `LayoutNumber`.

| Property | Value |
|---|---|
| Label | `LayoutName` from the API response |
| Collapsible | Yes — expands to show payload fields |
| Icon | Layout/page icon |
| Children | Layout Name, Notes, Head, Header, Footer |

**Layout child nodes:**

| Child node | `Layout` property | Interaction | URI |
|---|---|---|---|
| Layout Name | `LayoutName` | InputBox (text, max 128) | — |
| Notes | `Notes` | Document tab (html) | `skycms://layouts/{n}/notes` |
| Head | `Head` | Document tab (html) | `skycms://layouts/{n}/head` |
| Header | `HtmlHeader` | Document tab (html) | `skycms://layouts/{n}/header` |
| Footer | `FooterHtmlContent` | Document tab (html) | `skycms://layouts/{n}/footer` |

---

### Page Template Node

A **Page Template** displays its `Title` in the tree. Templates are not versioned — each template is a single record identified by its `Guid Id`.

| Property | Value |
|---|---|
| Label | `Title` from the API response |
| Collapsible | Yes — expands to show payload fields |
| Icon | Document icon |
| Children | Title, Content, Description |

**Template child nodes:**

| Child node | `Template` property | Interaction | URI |
|---|---|---|---|
| Title | `Title` | InputBox (text, max 128) | — |
| Content | `Content` | Document tab (html) | `skycms://templates/{guid}/content` |
| Description | `Description` | Document tab (plaintext) | `skycms://templates/{guid}/description` |

---

### Article Node

An **Article** displays its `Title` in the tree and is grouped under `Drafts` or `Published` based on its lifecycle state. The extension passes `ArticleNumber` (the logical group ID) when calling the API; the server returns the current editable version.

| Property | Value |
|---|---|
| Label | Article `Title` |
| Collapsible | Yes — expands to show payload fields |
| Icon | Filled document for Published, dashed document for Draft |
| Children | Published, Title, Banner Image, Category, Introduction, Content, Header JS, Footer JS |

**Article child nodes:**

| Child node | `Article` property | Interaction | URI |
|---|---|---|---|
| Published | `Published` | InputBox (ISO 8601 datetime, nullable) | — |
| Title | `Title` | InputBox (text, max 254) | — |
| Banner Image | `BannerImage` | InputBox (URL string) | — |
| Category | `Category` | InputBox (text, max 64) | — |
| Introduction | `Introduction` | Document tab (plaintext) | `skycms://articles/{n}/introduction` |
| Content | `Content` | Document tab (html) | `skycms://articles/{n}/content` |
| Header JS | `HeaderJavaScript` | Document tab (html) | `skycms://articles/{n}/headerJavaScript` |
| Footer JS | `FooterJavaScript` | Document tab (html) | `skycms://articles/{n}/footerJavaScript` |

**Note on `Published`:** An empty input clears the value (sets it to `null`), which marks the article as unpublished. A valid ISO 8601 string sets the scheduled publish time.

---

## State Badges and Icons

VS Code TreeItems support a `description` property (shown dimmed, after the label) and a `tooltip`. Use these to show state without cluttering the label.

| Entity state | Label | Description |
|---|---|---|
| Published article | Article title | `Published` |
| Draft article | Article title | `Draft` |

---

## Loading Behavior

The tree loads data lazily:

1. On first expand of **Layouts**, the API Client fetches the list of layout records.
2. On expand of a **Layout**, all child nodes are generated locally — no extra API call. The identifiers are deterministic from `LayoutNumber`.
3. On first expand of **Page Templates**, the API Client fetches the list of templates.
4. On expand of a **Template**, all child nodes are generated locally from the template's `Guid`.
5. On first expand of **Articles**, the API Client fetches the article list, pre-grouped into Drafts and Published.
6. On expand of an **Article**, all child nodes are generated locally from `ArticleNumber`.

The actual content fetch (GET) for each field happens on click — not on expand. This means opening a Layout and seeing its child nodes listed causes no API traffic. Traffic only occurs when the developer clicks a specific child node to view or edit that field.

---

## Refresh

A **Refresh** command (available in the tree view toolbar) fires `onDidChangeTreeData` with `undefined`, which causes VS Code to re-request all visible nodes. The API Client fetches fresh data for each.

Individual nodes can also be refreshed by right-clicking and selecting **Refresh** (Phase 2 feature).

---

## Content Discovery Commands

SkyCMS Explorer includes command-driven discovery flows so developers can find content without opening many tree branches.

### Search Content

- Command: **SkyCMS: Search Content**
- Behavior:
   - Choose a scope: all content, layouts, templates, articles, or files.
   - Enter a query.
   - Pick a result and then choose an action.
- Common actions:
   - Open file
   - Preview content
   - Open folder in File Manager
   - Pin / Unpin an item for quick access

### Filter Explorer

- Command: **SkyCMS: Filter Explorer**
- Behavior:
   - Choose a scope.
   - Enter a filter query.
   - Tree nodes are reduced to matching content.
- Clear command: **SkyCMS: Clear Explorer Filter**

### Recent and Pinned

- Command: **SkyCMS: Recent and Pinned**
- Behavior:
   - Opens a quick-pick list that merges pinned items and recent items.
   - Pinned items appear first.
   - Selecting an item opens it using the default action for that node type.

### Pin / Unpin from Context Menu

- Command: **SkyCMS: Pin / Unpin**
- Availability:
   - Files and folders
   - Layouts and layout versions
   - Templates
   - Articles and blog streams

### Lifecycle Commands

- Publish and unpublish actions are exposed from the article and layout version context menus.
- Duplicate and compare/diff actions are exposed for layout versions and article versions where version history is available.
- Restore deleted articles is available from the root menu and command palette, not as a tree node action.
- The tree model stays focused on browse/edit behavior; lifecycle actions are documented here only at a high level.

---

## Unauthenticated State

When no valid token exists, the tree shows a single item:

```
SkyCMS
└─ Sign in to SkyCMS…   ← clicking this triggers the sign-in flow
```

After successful sign-in, the tree refreshes and shows the full hierarchy.

---

[← Back to Index](00-Index.md)

