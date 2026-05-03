# Project Overview

[← Back to Index](00-Index.md)

## What This Project Is

The **SkyCMS VS Code Explorer** is a VS Code extension that gives SkyCMS developers a first-class editing experience inside the editor they already use every day.

Instead of switching to a browser, opening the SkyCMS admin UI, navigating through menus, and copying content in and out of forms, a developer can:

- Browse SkyCMS Layouts, Page Templates, and Articles in a sidebar tree
- Click any entity to open its content as an editable document in the VS Code editor
- Edit the content using full editor features (syntax highlighting, find/replace, formatting)
- Save directly back to SkyCMS through the same API that the SkyCMS Editor uses

The extension communicates with SkyCMS through a dedicated server-side API. It does not connect to the database directly. SkyCMS manages authentication and enforces access through its built-in role system.

---

## Who It Is For

This extension is built for **SkyCMS core developers** — the developers who build and maintain SkyCMS itself. It is not intended for end-user content authors, and it does not try to replicate the full SkyCMS Editor UI.

The target user:

- Is comfortable working in VS Code
- Understands the SkyCMS data model (Layouts, Templates, Articles)
- Has an account in SkyCMS with the **Editor** or **Administrator** role
- Wants to work with CMS content the same way they work with code

---

## What Problem It Solves

Developing and maintaining SkyCMS content currently requires switching context between VS Code and a web browser. For a developer who is already working in code — adjusting a layout's `<head>` markup, tweaking a template's content structure, or reviewing article body content — that context switch slows everything down.

The SkyCMS Explorer eliminates that switch. Content becomes a first-class artifact in the development workflow: browseable, editable, and saveable without leaving the editor.

---

## What It Is Not

This extension is not:

- A replacement for the SkyCMS Editor or admin UI
- A tool for non-developer content authors
- A direct database client
- A file-system mirror of CMS content

These are deliberate boundaries. The extension is a **developer productivity tool**, not a general-purpose CMS console.

---

## Why This Matters Strategically

Most CMS platforms treat the admin UI as the only authoring surface. SkyCMS, by offering a VS Code Explorer, positions itself as a **developer-first CMS** — one that understands that developers live in their editor, not their browser.

A SkyCMS VS Code Explorer:

- Makes SkyCMS feel modern and developer-native alongside tools like GitHub Copilot, Docker, and Azure App Service — all of which have VS Code extensions
- Differentiates SkyCMS from traditional and headless CMS competitors
- Locks in developer mindshare early in the adoption cycle
- Establishes a foundation that later phases can grow into (publishing pipelines, diffing, preview, CI integration)

Even a focused, Phase 1 version of this extension is a meaningful product statement.

---

## Relationship to SkyCMS

The extension connects to the SkyCMS **Editor** host — the same server that powers the SkyCMS web-based editor. A dedicated set of API endpoints (prefixed `/api/vscode/`) exposes the data and operations the extension needs.

Authentication is handled through SkyCMS's existing role system. A user must sign in with a SkyCMS account that has the **Editor** or **Administrator** role. The extension does not bypass, replicate, or duplicate SkyCMS access controls.

This means:

- No new user management is required
- Access is consistent between the web editor and the VS Code extension
- Removing a user's role in SkyCMS immediately revokes their extension access

See [Data Access](06-Data-Access.md) for the full API and authentication design.

---

[← Back to Index](00-Index.md)

