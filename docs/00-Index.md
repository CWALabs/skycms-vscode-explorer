# SkyCMS VS Code Explorer – Documentation Index

This is the authoritative project documentation for the **SkyCMS VS Code Explorer** — a developer-native VS Code extension that lets SkyCMS developers browse, open, and edit CMS entities directly inside the editor.

If you are reading this for the first time, start at the top and work down. Each document builds on the one before it.

---

## Reading Path

| # | Document | What it covers |
|---|---|---|
| 01 | [Project Overview](01-Project-Overview.md) | What this project is, who it is for, and why it exists |
| 02 | [Design Principles](02-Design-Principles.md) | The decisions that shape every technical choice |
| 03 | [Architecture](03-Architecture.md) | How the extension, the API, and SkyCMS fit together |
| 04 | [TreeView Model](04-TreeView-Model.md) | The exact structure of the Explorer tree |
| 05 | [Virtual Documents](05-Virtual-Documents.md) | How editing works inside VS Code |
| 06 | [Data Access](06-Data-Access.md) | The API layer, authentication, and endpoint contract |
| 07 | [Phased Execution](07-Phased-Execution.md) | The development plan broken into phases |
| 08 | [Research Links](08-Research-Links.md) | VS Code API docs, SkyCMS references, and code examples |
| 09 | [Requirements](09-Requirements.md) | Functional and non-functional requirements with IDs |
| 10 | [Testing Strategy](10-Testing-Strategy.md) | Test framework, coverage targets, and CI integration |
| 11 | [Development Setup](11-Development-Setup.md) | How to build, test, and run the extension locally |
| – | [URI Scheme](URI-Scheme.md) | Full specification of the `skycms://` URI scheme |

---

## Quick Reference

- **Extension entry point:** `src/extension.ts`
- **Tree data provider:** `src/treeProvider.ts`
- **URI scheme:** `skycms://`
- **SkyCMS docs:** https://docs.sky-cms.com/
- **SkyCMS source:** https://github.com/CWALabs/SkyCMS
- **SkyCMS entity models:** https://github.com/CWALabs/SkyCMS/tree/main/Common/Data
