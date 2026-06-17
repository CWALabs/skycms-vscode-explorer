# PR-Ready Change Summary

[← Back to Index](00-Index.md)

Use this page as a copy-ready pull request description for the lifecycle and documentation completion work.

---

## Suggested PR Title

Complete lifecycle enhancement docs, contract alignment, and command-surface documentation

---

## Suggested PR Body

### What changed

- Completed lifecycle documentation updates for restore, duplicate, and version compare flows.
- Aligned README command labels and workflow text with current extension command contributions.
- Updated architecture and data-access documentation to reflect browser-based sign-in and current command families.
- Validated and refreshed endpoint contract documentation against active API client code.
- Added changelog draft notes for unreleased documentation and lifecycle alignment updates.
- Added friendly file-path rendering support using API `displayPath` while preserving canonical `path` for all file operations.
- Added test coverage for `getFilesList` `displayPath` payload handling and file-search matching against friendly paths.

### Why

The extension behavior had moved ahead of documentation in key areas:

- Lifecycle operations were implemented but under-documented.
- File and discovery command labels in docs no longer matched UI labels.
- Contract pages needed explicit linkage to source files used as route-of-truth.

This PR closes that drift so users and maintainers can trust docs as a current operational reference.

It also aligns extension UX with SkyCMS editor behavior for article folders by showing title-based paths in UI while keeping operation safety through canonical storage paths.

### Verification

Focused extension suites used during lifecycle work were green:

- `src/extension.test.ts`
- `src/extension.web.test.ts`
- `src/apiClient/commands.test.ts`
- `src/treeProvider.test.ts`

Result: 4 passed suites, 220 passed tests.

### Documentation impact

- `README.md`
- `docs/03-Architecture.md`
- `docs/06-Data-Access.md`
- `docs/12-Gap-Closure-Plan.md`
- `docs/13-Endpoint-Contract-Matrix.md`
- `docs/14-PR-Ready-Change-Summary.md`
- `CHANGELOG.md`

### Risk and rollback

- Risk is low because this PR is documentation-focused and behavior-preserving.
- Rollback is straightforward by reverting changed markdown files.

### Follow-up

- Keep `docs/13-Endpoint-Contract-Matrix.md` updated in any future route/client change.
- Keep `README.md` command table in sync whenever `package.json` command contributions change.
