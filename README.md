# SkyCMS Explorer

[![SkyCMS Product Site](https://img.shields.io/badge/SkyCMS-Product%20Site-0B7ACF?logo=googlechrome&logoColor=white)](https://sky-cms.com)
[![SkyCMS Docs](https://img.shields.io/badge/Docs-docs.sky--cms.com-2EA44F?logo=readthedocs&logoColor=white)](https://docs.sky-cms.com)
[![GitHub Repository](https://img.shields.io/badge/GitHub-CWALabs%2Fskycms--vscode--explorer-181717?logo=github&logoColor=white)](https://github.com/CWALabs/skycms-vscode-explorer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A VS Code extension that brings your [SkyCMS](https://sky-cms.com) content directly into your editor. Browse articles, layouts, page templates, and blob storage files without leaving VS Code. Edit content fields and upload files. Changes save straight to SkyCMS.

## Quick links

- Product website: [sky-cms.com](https://sky-cms.com)
- Documentation website: [docs.sky-cms.com](https://docs.sky-cms.com)
- Extension repository: [github.com/CWALabs/skycms-vscode-explorer](https://github.com/CWALabs/skycms-vscode-explorer)

---

## Features at a glance

- Connect and switch between multiple SkyCMS Editor sites.
- Sign in through a secure browser verification flow.
- Browse layouts, page templates, articles, and files in a dedicated SkyCMS tree.
- Search across layouts, templates, articles, and files from one command.
- Filter the Explorer tree by scope and query to reduce visual noise.
- Reopen recent content quickly and pin frequently used items.
- Edit content fields in either document-tab or inline-input modes.
- Manage lifecycle actions including publish, unpublish, restore, duplicate, and version compare flows.
- Work with `/pub` storage directly from VS Code (open, save, upload, rename, move, delete).

For a guided walkthrough, see the docs page:

- [SkyCMS VS Code Extension Guide](https://docs.sky-cms.com/for-developers/extending/vscode-extension/)

---

## Requirements

- VS Code 1.85 or later
- Access to a running SkyCMS Editor instance and its URL

## Environment compatibility

| Environment | Status | Notes |
| --- | --- | --- |
| VS Code Desktop | Supported | Full extension functionality. |
| VS Code Remote / Codespaces | Supported | Full functionality via remote extension host. |
| VS Code Web Host (vscode.dev without remote) | Partial | Site management, sign-in, and tree browsing are enabled; field/file editing and publish/mutate commands are still in progress. |

---

## Setup

### 1. Install the extension

Install the `.vsix` package from the Releases page:

1. Open VS Code.
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
3. Run **Extensions: Install from VSIX…**
4. Select the downloaded `.vsix` file.

### 2. Add your first site

Run **SkyCMS: Add Site** from the Command Palette and enter your SkyCMS editor URL.

The extension stores sites globally and lets you switch between them at any time.

Optional compatibility mode: if `skycms.editorUrl` already exists in your `settings.json`, the extension imports it automatically as your first site.

### 3. Sign in

1. Open the **Explorer** side bar in VS Code.
2. Scroll to the **SkyCMS** section.
3. Click **Sign in to SkyCMS…**

A browser window opens to the SkyCMS sign-in page. After you sign in, SkyCMS displays a one-time verification code. Paste that code into the VS Code prompt and press **Enter**.

You can also trigger sign-in from the Command Palette: **SkyCMS: Sign In**.

---

## The SkyCMS Panel

After signing in, the SkyCMS panel shows four top-level categories:

| Category | Contents |
| --- | --- |
| **Layouts** | Your site layouts and their versions |
| **Page Templates** | Reusable page templates |
| **Articles** | Content articles and blog posts (blog posts show a `(Blog)` suffix) |
| **Files** | Blob storage file tree, rooted at `/pub` |

Click any category to expand it. Click any item inside to expand it further.

### Content discovery workflows

When your site has many items, use these commands instead of manual tree expansion:

#### Search Content

- Run **SkyCMS: Search Content**.
- Pick a scope (`All Content`, `Layouts`, `Page Templates`, `Articles`, or `Files`).
- Enter a query.
- Pick a result, then choose an action (for example Open, Preview Draft, Open in File Manager, or Pin / Unpin).

#### Filter Explorer

- Run **SkyCMS: Filter Explorer**.
- Pick a scope and enter a filter string.
- The tree narrows to matching nodes.
- Run **SkyCMS: Clear Explorer Filter** to restore the full tree.

#### Recent and Pinned

- Run **SkyCMS: Recent and Pinned** to open a quick list of previously opened items.
- Use **Pin / Unpin** from search actions or item context menus to keep important content at the top.

#### Preview Current Context

- Run **SkyCMS: Preview Current Context**.
- If a previewable node is selected in the tree, that node is used.
- If a SkyCMS field tab is active, the extension resolves the parent entity and previews it.
- This is the fastest way to move from editing to page preview without manually finding the parent node.

---

## Articles

Expand **Articles** to see all content items in one list. Items are sorted alphabetically and still show status in their label (for example, `(Draft)` or `(Published)`).

### Editing article fields

Click an article to expand it. Each article has these fields:

| Field | How it opens |
| --- | --- |
| Published | Inline input box |
| Title | Inline input box |
| Banner Image | Inline input box |
| Category | Inline input box |
| Introduction | Editor tab |
| Content | Editor tab |
| Header JS | Editor tab |
| Footer JS | Editor tab |

Click any field to open it. See [Editing fields](#editing-fields) below for how each type works.

### Creating an article

Run **SkyCMS: New Article** from the Command Palette. Enter a title and press **Enter**. The article appears under **Articles**.

### Publishing, unpublishing, and restore

Right-click an article in the tree to see these options:

- **Publish** — makes the article publicly visible. VS Code asks you to confirm before publishing.
- **Unpublish** — moves the article back to draft state and removes it from public view. VS Code asks you to confirm.

From the SkyCMS root menu (**More Actions…**) or Command Palette:

- **Restore Deleted Article...** — restores a deleted article by article number and refreshes the tree.

For version-level lifecycle checks:

- **Compare with Current Draft** — compares an article version against the current draft in VS Code diff.
- **Compare With Editable** — compares a layout version against the current editable version in VS Code diff.

---

## Layouts

Expand **Layouts** to see your site layouts. Each layout can have multiple versions. Expand a layout to see its versions.

### Editing layout fields

Click a layout version to expand it. Each version has these fields:

| Field | How it opens |
| --- | --- |
| Layout Name | Inline input box |
| Notes | Editor tab |
| Head | Editor tab |
| Header | Editor tab |
| Footer | Editor tab |

### Layout version actions

Right-click a layout version to see these options:

- **Publish Layout Version** — makes this version the live version. VS Code asks you to confirm.
- **Set as Default Layout** — marks this version as the default layout for new pages. VS Code asks you to confirm.
- **Duplicate Layout Version** — creates a new version copied from this one. The new version number appears in a confirmation message.
- **Compare With Editable** — opens a VS Code diff between this version and the current editable layout field.

---

## Page Templates

Expand **Page Templates** to see your templates. Click a template to expand it. Each template has these fields:

| Field | How it opens |
| --- | --- |
| Title | Inline input box |
| Content | Editor tab |
| Description | Editor tab |

---

## Files

Expand **Files** to browse your SkyCMS blob storage. The tree starts at `/pub`. Folders expand to show their contents.

### Opening a file

Right-click a file -> **Open**. The file opens as a VS Code editor tab. You can read and edit it normally.

Saving with **Ctrl+S** (Windows/Linux) or **Cmd+S** (macOS) writes the change directly to SkyCMS storage. There is no separate "upload" step.

### Uploading a file

Right-click any folder -> **Upload File...**. A file picker opens. Select a file from your computer. The file uploads to that folder and appears in the tree.

### Creating a folder

Right-click any folder -> **New Folder...**. Enter a name and press **Enter**. The folder is created immediately.

### Renaming or moving a file or folder

The Files section mounts as a virtual filesystem in VS Code. This means you can rename and move files using standard VS Code gestures:

- **Rename:** Press **F2** on any file or folder in the tree, or right-click → **Rename**.
- **Move:** Drag a file or folder to a different location in the tree.

Both operations write through to SkyCMS storage immediately.

### Deleting a file

Right-click a file -> **Delete**. VS Code asks you to confirm. Deletion cannot be undone.

### Deleting a folder

Right-click a folder -> **Delete**. VS Code asks you to confirm. The folder and all its contents are deleted. This cannot be undone.

### More file actions

The Files context menus also include:

- **Open in File Manager** - opens the SkyCMS file manager at the current folder.
- **Open on Web** - opens a file or folder using the configured site public URL.
- **Copy Public URL** - copies the full public URL.
- **Copy CMS Path** - copies the `/pub/...` storage path.
- **Paste** - uploads a local file/folder from copied OS path, or pastes Cut/Copy actions.
- **Cut / Copy / Rename... / Download / Open to the Side / New File... / Add to Chat** for workflow speed.

---

## Editing fields

There are two ways fields open, depending on the field type.

### Editor tab fields

Fields like **Content**, **Head**, **Header**, and **Footer** open as a text document in a new VS Code tab. Edit the text normally using all the standard VS Code editing tools.

Press **Ctrl+S** (Windows/Linux) or **Cmd+S** (macOS) to save. The extension writes the change to SkyCMS immediately on save.

### Inline input fields

Fields like **Title**, **Category**, and **Banner Image** open a small input box at the top of the VS Code window. The current value is pre-filled.

Edit the value and press **Enter** to save. Press **Escape** to cancel without saving.

---

## Commands

All SkyCMS commands are available from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).

| Command | What it does |
| --- | --- |
| **SkyCMS: Add Site** | Add a SkyCMS editor URL profile |
| **SkyCMS: Switch Site** | Switch the active SkyCMS site |
| **SkyCMS: Remove Site** | Remove a saved SkyCMS site |
| **SkyCMS: Manage Sites** | Open site management actions |
| **SkyCMS: Sign In** | Start the browser sign-in flow |
| **SkyCMS: Sign Out** | Clear stored credentials |
| **SkyCMS: Refresh** | Reload the explorer tree |
| **SkyCMS: Open Public Site** | Open the active site's public URL |
| **SkyCMS: Open Editor** | Open the active site's editor URL |
| **SkyCMS: Documentation** | Open SkyCMS documentation |
| **SkyCMS: Ask SkyCMS** | Open the SkyCMS chat assistant |
| **SkyCMS: Search Content** | Search layouts, templates, articles, and files |
| **SkyCMS: Filter Explorer** | Apply a tree filter by scope and query |
| **SkyCMS: Clear Explorer Filter** | Remove the active tree filter |
| **SkyCMS: Recent and Pinned** | Open quick-access recent/pinned content |
| **SkyCMS: Pin / Unpin** | Toggle quick-access pin state |
| **SkyCMS: Preview Draft** | Preview selected layout, template, article, or blog stream |
| **SkyCMS: Preview Current Context** | Preview from selected node or active SkyCMS field tab |
| **SkyCMS: Publish** | Publish selected article/blog stream |
| **SkyCMS: Unpublish** | Unpublish selected article/blog stream |
| **SkyCMS: Restore Deleted Article...** | Restore an article by article number |
| **SkyCMS: New Article** | Create a new article |
| **SkyCMS: New Template** | Create a new page template |
| **SkyCMS: Open on Public Site** | Open selected article/blog stream on public site |
| **SkyCMS: Publish Layout Version** | Publish selected layout version |
| **SkyCMS: Set as Default Layout** | Set selected layout version as default |
| **SkyCMS: Duplicate Layout Version** | Duplicate selected layout version |
| **SkyCMS: Compare with Current Draft** | Diff an article version against draft |
| **SkyCMS: Compare With Editable** | Diff a layout version against editable |
| **SkyCMS: Open** | Open selected file |
| **SkyCMS: Open to the Side** | Open selected file in side editor |
| **SkyCMS: Upload File...** | Upload into selected files folder |
| **SkyCMS: New Folder...** | Create folder in selected files location |
| **SkyCMS: New File...** | Create empty file in selected files location |
| **SkyCMS: Paste** | Paste from OS path or Cut/Copy buffer |
| **SkyCMS: Rename...** | Rename selected file/folder |
| **SkyCMS: Cut** | Mark selected file/folder for move |
| **SkyCMS: Copy** | Mark selected file/folder for duplicate |
| **SkyCMS: Delete** | Delete selected file/folder |
| **SkyCMS: Open in File Manager** | Open selected path in SkyCMS File Manager |
| **SkyCMS: Open on Web** | Open selected file/folder on public site |
| **SkyCMS: Copy Public URL** | Copy selected path public URL |
| **SkyCMS: Copy CMS Path** | Copy selected path as CMS storage path |
| **SkyCMS: Download** | Download selected file locally |
| **SkyCMS: Add to Chat** | Open chat with selected node context |

---

## Extension settings

The extension works without required manual settings for most users.

- `skycms.editorUrl` (legacy compatibility):
  - If present in VS Code settings, it is imported automatically as the first site profile.
  - New setups should prefer **SkyCMS: Add Site** and site profiles instead of relying on a single global URL.

---

## Known limitations

- File and tree updates are refresh-oriented. Run **SkyCMS: Refresh** when needed.
- Concurrent edits to the same SkyCMS field or file do not provide merge conflict UX.
- Some preview actions depend on server-provided identifiers and can vary by environment.

---

## Troubleshooting

**"No SkyCMS site is configured"**  
Run **SkyCMS: Add Site** and enter your editor URL.

**Need to work across multiple editors/tenants?**  
Use **SkyCMS: Switch Site** to move between saved sites.

**The tree is empty after signing in**  
Click the refresh icon in the SkyCMS panel header, or run **SkyCMS: Refresh** from the Command Palette.

**A browser tab did not open during sign-in**  
VS Code may have blocked the external URL. Allow it when prompted, or copy the URL from the notification and paste it into your browser manually. Then paste the verification code back into VS Code.

**Saving a file shows an error**  
Your session may have expired. Run **SkyCMS: Sign Out**, then **SkyCMS: Sign In** to refresh your credentials.

**A file opened as garbled text**  
The file may be a binary format (image, PDF, etc.) that is not intended for text editing. Use the **Upload File Here** command to replace the file with a new version from your computer.

---

## Contributing

See [docs/11-Development-Setup.md](docs/11-Development-Setup.md) for how to build and test the extension locally.

## Release notes

See [CHANGELOG.md](CHANGELOG.md) for version history.
