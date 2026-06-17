# Changelog

All notable changes to this project are documented in this file.

## Unreleased

### Added

- Lifecycle coverage for article restore and version comparison workflows in extension documentation.
- Command-surface documentation for discovery flows and advanced file operations.
- Contract documentation updates tying API route maps to current client implementations.
- PR-ready summary artifact for maintainers to reuse in pull request descriptions.
- Friendly file-path presentation support using `displayPath` metadata from `/api/vscode/files`.
- File search matching support for friendly `displayPath` values while preserving canonical-path operations.
- Unit test coverage for `getFilesList` `displayPath` payload handling and friendly-path file search.

### Changed

- README command catalog now reflects the active contributed commands and labels.
- File workflow sections now use current context menu labels (`Open`, `Upload File...`, `New Folder...`, `Delete`).
- Architecture and data-access docs now describe browser sign-in exchange and current command families.
- Explorer file and folder tooltips now show friendly path text plus canonical storage path metadata (including article number hints when available).
- Protected-folder deletion test mocks now align with runtime constants (`/pub/lib/ckeditor`).
