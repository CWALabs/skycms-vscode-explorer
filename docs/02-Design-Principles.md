# Design Principles

[← Back to Index](00-Index.md)

These principles capture the "why" behind the technical decisions in this project. When a new implementation question comes up, these principles should guide the answer.

---

## 1. Developer-First

The extension is built for SkyCMS developers, not content authors.

This means:

- The UI does not need guardrails or hand-holding
- Content opens in raw form (HTML, Razor, JSON, Markdown) — not in visual editors
- Error messages can be technical
- The schema is not hidden; field names and version numbers are visible in the tree

Every UX decision should ask: *Would a developer find this faster or more useful than the web UI?* If not, it does not belong in the MVP.

---

## 2. Treat Content as Code

CMS content — layout markup, template structure, article body — is treated as source artifacts, not form data.

This means:

- Layouts open as HTML/Razor files in the editor
- Templates open as structured text (HTML or JSON depending on the field)
- Articles open as Markdown or HTML, not as form fields
- Save is a deliberate action, not an auto-save on every keystroke

Treating content as code enables developers to use all the editor features they already know: find/replace, multi-cursor, formatting, diff, copy/paste between files.

---

## 3. API-Backed, Not Database-Direct

The extension does not connect to the SkyCMS database. It communicates exclusively through a dedicated set of HTTP API endpoints hosted by the SkyCMS Editor.

This principle exists for three reasons:

**Access control.** SkyCMS manages user roles (Editor, Administrator) through its own system. Bypassing that system with a direct database connection would mean that anyone with a connection string could read and write CMS content without any SkyCMS-level access control. That is not acceptable even for a developer tool.

**Schema stability.** The SkyCMS database schema is an internal implementation detail. If the schema changes, a direct-DB extension breaks silently. An API contract is versioned and can be maintained independently.

**Separation of concerns.** The extension should not need to know which database engine SkyCMS uses, how entities relate at the table level, or how transactions are managed. The API speaks in domain terms (Layouts, Templates, Articles), not table terms.

See [Data Access](06-Data-Access.md) for the full API design.

---

## 4. Domain-Aware, Not Filesystem-Aware

SkyCMS entities are not files. They are versioned, relational, stateful domain objects. The Explorer represents them as domain objects, not as a fake filesystem.

This means:

- The tree shows **Layout families** with **versions** as children, not folders and files
- Node labels use CMS concepts: Published, Draft, Default — not file extensions or paths
- The tree hierarchy reflects the SkyCMS domain model, not a directory structure

A later phase may optionally implement `FileSystemProvider` to enable features like diff and rename. That is a forward-compatible addition, not a requirement.

---

## 5. SkyCMS Role System is the Auth System

The extension does not have its own login or user management. The user signs in with their SkyCMS Editor credentials (username and password). The API returns a bearer token scoped to that session.

The SkyCMS role system governs what the user can do:

| Role | Can browse | Can edit | Can publish |
|---|---|---|---|
| Editor | ✅ | ✅ | Phase 3 |
| Administrator | ✅ | ✅ | Phase 3 |
| No role / invalid | ❌ | ❌ | ❌ |

If a user's role is revoked in SkyCMS, the next API call returns a 401 and the extension shows an "Access denied" state. No separate revocation mechanism is needed.

---

## 6. Small MVP, Forward-Compatible Design

The MVP does one thing: **browse and edit**. It does not publish, create, delete, diff, or preview.

But every architectural decision in the MVP is made so that those features can be added later without rewriting the foundation.

Specifically:

- The URI scheme (`skycms://`) is designed to accommodate all entity types and all payload fields from the start
- The API client is a single abstraction layer; adding new endpoints later does not require changing calling code throughout the extension
- The tree node model includes fields for state (draft/published) and version even in Phase 1, so the data is present when Phase 3 needs it

The goal is: **stop at any phase and still have working, useful software**.

---

## 7. One Concern Per Layer

The extension has three distinct layers, and they do not mix:

| Layer | Responsibility |
|---|---|
| **API Client** | HTTP communication with the SkyCMS API. Auth headers, error handling, JSON parsing. |
| **Tree Provider** | Mapping API responses to VS Code tree nodes. No HTTP calls. |
| **Document Provider** | Mapping `skycms://` URIs to readable/writable content. No tree logic. |

Keeping these layers clean means each one can be tested, replaced, or extended independently.

---

[← Back to Index](00-Index.md)

