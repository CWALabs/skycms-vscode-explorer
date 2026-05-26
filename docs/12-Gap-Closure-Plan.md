# Gap Closure Plan

[← Back to Index](00-Index.md)

This is the living plan for closing the main product gaps identified in the SkyCMS Explorer review.

The goal is to keep this document current while we work. It should answer three questions at a glance:

1. What gap are we closing?
2. Why does it matter to a web developer using CMS content?
3. What is the current status?

---

## Baseline

SkyCMS Explorer already supports the core developer workflow:

- Connect to one or more SkyCMS Editor sites
- Browse layouts, page templates, articles, and blob storage files
- Edit content fields directly in VS Code
- Publish and unpublish articles
- Work with `/pub` storage as a virtual filesystem

The plan below focuses on the missing pieces that would make the extension feel complete from a CMS developer's point of view.

---

## Workstreams

### 1. Documentation Catch-Up

**Why this matters:** The docs currently describe a narrower feature set than the code already ships. That makes the extension look less capable than it is, and it hides advanced commands from users.

**Scope:**

- Update `README.md` to reflect the current command surface and file workflows
- Update the tree and execution docs so they match the actual UI and node behavior
- Document the advanced commands that already exist but are not prominently described
- Keep this plan updated as we close other gaps

**Done when:**

- The docs match shipped behavior
- New functionality is documented in the same change that introduces it
- The index points readers to the plan and the most relevant feature docs

**Status:** Complete

---

### 2. Content Discovery

**Why this matters:** Developers expect to find the right content fast. A CMS tool that only browses trees becomes tedious once content volume grows.

**Scope:**

- Add search across layouts, page templates, articles, and files
- Add filters for state, type, and site where appropriate
- Consider quick access to recent or pinned entities
- Make article and file navigation faster for large content sets

**Done when:**

- A developer can find content without manually expanding large sections
- Search and filters work without breaking the current tree model
- The feature is documented with examples and keyboard workflow notes

**Status:** Complete

---

### 3. Preview Workflow

**Why this matters:** Web developers usually expect a tight edit-preview loop. Opening a browser tab is useful, but it is not the same as a fast content feedback cycle.

**Scope:**

- Make preview easier to discover from the tree and editor commands
- Add clearer handling for layout, template, and article preview targets
- Improve the handoff between the edited field and the rendered page
- Consider side-by-side or inline preview experiences where practical

**Done when:**

- Preview is a first-class command rather than a hidden extra
- It is obvious how to preview the current entity
- The preview flow is documented and tested

**Status:** Complete

---

### 4. Lifecycle Actions

**Why this matters:** Once developers can edit content, they also expect to manage its lifecycle. Publish and unpublish are useful, but they are not the full story.

**Scope:**

- Add missing article lifecycle actions where SkyCMS supports them
- Add safer duplication and restore flows where they reduce editing risk
- Expose version comparison or diffing for layout and article history
- Align lifecycle actions across layouts, templates, and articles so behavior feels consistent

**Done when:**

- The most common authoring and maintenance actions are available in VS Code
- Destructive actions are confirmed clearly
- Layout and article workflows feel consistent instead of ad hoc

**Status:** Complete

**Completed in this milestone so far:**

- Added a VS Code restore endpoint for deleted articles in the editor backend
- Added a restore article command in desktop and web explorer hosts
- Added restore article quick access from the root menu and command palette
- Added duplicate layout version and article/layout diff commands for lifecycle comparison flows
- Added command client and controller tests for the restore lifecycle flow
- Added lifecycle command menu wiring for article version compare and layout version compare
- Verified focused lifecycle and enhancement test suites are green

---

### 5. Validation and Safety Feedback

**Why this matters:** Developers want immediate feedback when content is malformed. Validation reduces broken saves and makes the tool safer to use in day-to-day editing.

**Scope:**

- Validate common field types before save where possible
- Surface field-specific diagnostics for HTML, JavaScript, URLs, and dates
- Keep the current input flow, but make invalid values harder to persist accidentally
- Improve error messages so they tell the developer what to fix

**Done when:**

- Invalid content is caught early
- The user sees a useful fix-it hint instead of a generic failure
- Validation behavior is covered by tests and documented

**Status:** Complete

---

### 6. Schema and Metadata Visibility

**Why this matters:** Developers often need to understand the content model itself, not just the current entry values. A CMS tool feels more complete when the structure is easy to inspect.

**Scope:**

- Surface more metadata in the tree and tooltips
- Make field intent and field type easier to discover
- Consider a stronger view of schema, relationships, and version state
- Add helper commands or docs for content-model exploration if needed

**Done when:**

- The tree makes the content model easier to understand
- Version and state information is visible where it helps decisions
- The UI remains readable and does not become cluttered

**Status:** Complete

**Completed in this milestone so far:**

- Added field descriptions and tooltips that surface field mode, read-only state, and version metadata
- Added tree metadata hints so version state is visible without opening extra docs

---

## Suggested Delivery Order

1. Documentation Catch-Up
2. Content Discovery
3. Preview Workflow
4. Validation and Safety Feedback
5. Lifecycle Actions
6. Schema and Metadata Visibility

This order is deliberate:

- Docs catch-up is low risk and improves the product immediately
- Discovery and preview close the biggest day-to-day workflow gaps
- Validation makes the editing experience safer before broader lifecycle work lands
- Lifecycle and metadata work are more visible once the basic UX is already strong

---

## Milestones

Use these milestones as the working backlog. Each milestone is small enough to turn into one or more issues.

### Milestone 1. Documentation Catch-Up

**Goal:** Make the docs match the current extension behavior so users can trust the README and plan.

**Issue drafts:**

### Update README for shipped behavior

Scope: rewrite the README feature list, setup, tree, file, and commands sections so they match the extension as it exists now.

Acceptance criteria: the README no longer describes stale behavior; it includes the advanced file and command workflows that are already implemented; it stays consistent with the docs index and plan.

### Align tree and workflow docs

Scope: update the TreeView, virtual documents, architecture, and phased execution docs where they still describe the older roadmap or incomplete UI.

Acceptance criteria: the docs describe the actual node model and workflows; they no longer imply that implemented features are future work; they cross-link cleanly to the plan and requirements.

### Document advanced commands and file workflows

Scope: add concise documentation for commands that are easy to miss, including the file manager, open on web, copy path, rename, cut/copy/paste, open to side, download, and chat entry points.

Acceptance criteria: each command is discoverable from documentation; the docs explain when to use it; the descriptions match the current command labels and menus.

### Keep the plan as a living backlog

Scope: update this plan whenever a feature lands so it stays useful as the tracking document for the rest of the workstream.

Acceptance criteria: the plan reflects current status; completed items are marked done; new gaps are added here before they are lost.

**Issue-sized tasks:**

- Update `README.md` to describe the current commands, tree actions, and file workflows
- Update the tree and execution docs so they match the shipped UI and node model
- Add examples for advanced commands that already exist but are easy to miss
- Keep this plan updated whenever a feature lands

**Acceptance criteria:**

- The README describes the current behavior rather than the older phased roadmap
- The docs index points to the right reading path for new contributors
- Advanced commands are discoverable from the docs, not just the command registry
- No documented workflow contradicts the shipped extension

### Milestone 2. Content Discovery

**Goal:** Help developers find the right content quickly when the tree gets large.

**Current status:** Complete

**Issue-sized tasks:**

- Add search for layouts, page templates, articles, and files
- Add filters for state, type, and site where they help most
- Add a way to revisit recent or pinned content
- Make navigation usable without expanding large trees manually

**Completed in this milestone so far:**

- Added global content search across layouts, templates, articles, and files
- Added result actions to open, preview, and jump to relevant commands directly from search results
- Added explorer tree filtering with scope selection and clear-filter command
- Added recent and pinned content quick access, including pin/unpin actions from search and tree context menus
- Added desktop and web command registration parity for search and filter flows

**Acceptance criteria:**

- A developer can locate content without scrolling through the whole tree
- Search results and filters preserve the current domain model
- The feature works without requiring a browser-based CMS search
- The workflow is documented with examples and entry points

### Milestone 3. Preview and Validation

**Goal:** Tighten the edit-check loop so content problems are visible earlier.

**Current status:** Complete

**Issue-sized tasks:**

- Make preview easier to discover from the tree and command palette
- Improve the handoff between the field that was edited and the page that is previewed
- Add basic validation for common content types before save
- Improve error text for HTML, JavaScript, URL, and date fields

**Completed in this milestone so far:**

- Added a `Preview Current Context` command in desktop and web hosts
- Added preview target resolution from current tree selection or active `skycms://` field tab
- Added root menu and title/menu discoverability for the preview-context workflow
- Added command registration test coverage for desktop and web activation

**Acceptance criteria:**

- A developer can preview the current entity without hunting for the right command
- Invalid content is caught before it reaches the API when practical
- Validation failures explain what to fix
- Preview and validation behavior are covered by docs and tests

### Milestone 4. Lifecycle Actions

**Goal:** Cover the everyday publish and maintenance operations that follow editing.

**Current status:** Complete

**Issue-sized tasks:**

- Add the remaining article lifecycle operations supported by SkyCMS
- Add safer duplicate, restore, or revert flows where they reduce risk
- Add version comparison or diffing for layouts and content history
- Make lifecycle behavior consistent across layouts and articles

**Acceptance criteria:**

- A developer can complete common publish flows without leaving VS Code
- Destructive actions require confirmation
- The same kind of object behaves consistently across the tree
- The lifecycle commands are documented in the plan and README

### Milestone 5. Schema and Metadata Visibility

**Goal:** Make it easier to understand the content model and state directly in the explorer.

**Issue-sized tasks:**

- Surface more field and version metadata in labels, descriptions, or tooltips
- Improve visibility of field intent and type
- Consider a dedicated schema or model view if the tree needs more context
- Keep the UI readable while increasing the amount of useful context

**Acceptance criteria:**

- A developer can tell what they are editing without opening extra docs
- Version and state information is visible where it helps decisions
- The tree remains readable and does not become noisy
- The docs explain what metadata is shown and why

---

## Progress Tracker

| Workstream | Status | Notes |
| --- | --- | --- |
| Documentation Catch-Up | Complete | README, tree docs, phased execution note, and plan entries are aligned |
| Content Discovery | Complete | Search, explorer filtering, recent/pinned quick access, and docs examples are implemented |
| Preview Workflow | Complete | Added preview-current command and context-aware target resolution |
| Lifecycle Actions | Complete | Publish/unpublish, restore, duplicate layout version, and article/layout version diff flows are implemented across desktop and web hosts with focused test coverage |
| Validation and Safety Feedback | Complete | HTML, URL, and date validation are covered for saved input paths |
| Schema and Metadata Visibility | Complete | Field descriptions and tooltips now surface field intent, read-only state, and version metadata |

---

## Definition Of Done

The plan is complete when:

- The docs describe the shipped behavior accurately
- The extension supports fast discovery and preview for common CMS workflows
- Common lifecycle actions are available directly in VS Code
- Validation prevents avoidable bad saves
- The tree gives developers enough schema and metadata context to work confidently
- The README and doc index point readers to the right workflow guides

---

## Notes

- This plan should be updated as work lands, not only after the fact
- If a feature is implemented but not documented, it is not considered fully done
- If the docs describe a feature that no longer exists, the docs should be corrected in the same change

[← Back to Index](00-Index.md)
