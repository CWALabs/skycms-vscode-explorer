# SkyCMS Explorer

A VS Code extension that brings your SkyCMS content directly into your editor. Browse articles, layouts, page templates, and blob storage files without leaving VS Code. Edit content fields and upload files. Changes save straight to SkyCMS.

---

## Requirements

- VS Code 1.85 or later
- Access to a running SkyCMS Editor instance and its URL

---

## Setup

### 1. Install the extension

Install the `.vsix` package from the Releases page:

1. Open VS Code.
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
3. Run **Extensions: Install from VSIX…**
4. Select the downloaded `.vsix` file.

### 2. Set the editor URL

The extension needs the base URL of your SkyCMS Editor instance.

1. Open **Settings** (`Ctrl+,` / `Cmd+,`).
2. Search for **SkyCMS**.
3. Set **SkyCMS: Editor URL** to your editor's base URL.

Or add this line directly to your `settings.json`:

```json
"skycms.editorUrl": "https://editor.example.com"
```

Replace `https://editor.example.com` with your actual SkyCMS Editor URL.

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
|---|---|
| **Layouts** | Your site layouts and their versions |
| **Page Templates** | Reusable page templates |
| **Articles** | Blog or content articles, split into Drafts and Published |
| **Files** | Blob storage file tree, rooted at `/pub` |

Click any category to expand it. Click any item inside to expand it further.

---

## Articles

Expand **Articles** to see two groups: **Drafts** and **Published**. Articles are sorted alphabetically within each group.

### Editing article fields

Click an article to expand it. Each article has these fields:

| Field | How it opens |
|---|---|
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

Run **SkyCMS: New Article** from the Command Palette. Enter a title and press **Enter**. The article appears in Drafts.

### Publishing and unpublishing

Right-click an article in the tree to see these options:

- **Publish Article** — makes the article publicly visible. VS Code asks you to confirm before publishing.
- **Unpublish Article** — moves the article back to Drafts and removes it from public view. VS Code asks you to confirm.

---

## Layouts

Expand **Layouts** to see your site layouts. Each layout can have multiple versions. Expand a layout to see its versions.

### Editing layout fields

Click a layout version to expand it. Each version has these fields:

| Field | How it opens |
|---|---|
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

---

## Page Templates

Expand **Page Templates** to see your templates. Click a template to expand it. Each template has these fields:

| Field | How it opens |
|---|---|
| Title | Inline input box |
| Content | Editor tab |
| Description | Editor tab |

---

## Files

Expand **Files** to browse your SkyCMS blob storage. The tree starts at `/pub`. Folders expand to show their contents.

### Opening a file

Right-click a file → **Open File**. The file opens as a VS Code editor tab. You can read and edit it normally.

Saving with **Ctrl+S** (Windows/Linux) or **Cmd+S** (macOS) writes the change directly to SkyCMS storage. There is no separate "upload" step.

### Uploading a file

Right-click any folder → **Upload File Here**. A file picker opens. Select a file from your computer. The file uploads to that folder and appears in the tree.

### Creating a folder

Right-click any folder → **New Folder Here**. Enter a name and press **Enter**. The folder is created immediately.

### Renaming or moving a file or folder

The Files section mounts as a virtual filesystem in VS Code. This means you can rename and move files using standard VS Code gestures:

- **Rename:** Press **F2** on any file or folder in the tree, or right-click → **Rename**.
- **Move:** Drag a file or folder to a different location in the tree.

Both operations write through to SkyCMS storage immediately.

### Deleting a file

Right-click a file → **Delete File**. VS Code asks you to confirm. Deletion cannot be undone.

### Deleting a folder

Right-click a folder → **Delete Folder**. VS Code asks you to confirm. The folder and all its contents are deleted. This cannot be undone.

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
|---|---|
| **SkyCMS: Sign In** | Start the browser sign-in flow |
| **SkyCMS: Sign Out** | Clear your stored credentials and sign out |
| **SkyCMS: Refresh** | Reload the tree from SkyCMS |
| **SkyCMS: New Article** | Create a new article |

---

## Troubleshooting

**"SkyCMS editor URL is not configured"**  
Open Settings and set `skycms.editorUrl` to your editor's base URL. See [Set the editor URL](#2-set-the-editor-url) above.

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
