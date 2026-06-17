# Endpoint Contract Matrix

[← Back to Index](00-Index.md)

This page is the source-of-truth mapping between extension client methods and SkyCMS server routes.

Use it when either side changes:

- If a controller route changes, update extension client paths.
- If extension client paths change, confirm matching controller routes exist.
- Keep this file current in the same change as route or client updates.

Validated against:

- `src/apiClient/queries.ts`
- `src/apiClient/commands.ts`
- `package.json` command surface (for lifecycle and file operation discoverability)

---

## Authentication

| Extension Method | HTTP | Route | Controller Action |
| --- | --- | --- | --- |
| SkyCmsQueryClient.startBrowserAuth | GET | /api/vscode/auth/browser/start | VsCodeController.StartBrowserAuth |
| SkyCmsQueryClient.pollBrowserAuth | GET | /api/vscode/auth/poll | VsCodeController.PollBrowserAuth |
| SkyCmsCommandClient.completeBrowserAuth | POST | /api/vscode/auth/browser/exchange | VsCodeController.ExchangeBrowserAuth |
| SkyCmsCommandClient.logout | POST | /api/vscode/auth/logout | VsCodeController.Logout |
| SkyCmsQueryClient.getMe | GET | /api/vscode/auth/me | VsCodeController.Me |

---

## Layouts and Templates

| Extension Method | HTTP | Route | Controller Action |
| --- | --- | --- | --- |
| SkyCmsQueryClient.getLayouts | GET | /api/vscode/layouts | VsCodeController.GetLayouts |
| SkyCmsQueryClient.getLayoutVersions | GET | /api/vscode/layouts/{layoutNumber}/versions | VsCodeController.GetLayoutVersions |
| SkyCmsQueryClient.getDocumentFieldContent (layouts) | GET | /api/vscode/layouts/{layoutNumber}/{fieldKey} | VsCodeController.GetLayoutField |
| SkyCmsQueryClient.getLayoutVersionDocumentFieldContent | GET | /api/vscode/layouts/{layoutNumber}/{version}/{fieldKey} | VsCodeController.GetLayoutVersionField |
| SkyCmsCommandClient.setDocumentFieldContent / setInputFieldValue (layouts) | PUT | /api/vscode/layouts/{layoutNumber}/{fieldKey} | VsCodeController.SetLayoutField |
| SkyCmsCommandClient.publishLayoutVersion | POST | /api/vscode/layouts/{layoutNumber}/{version}/publish | VsCodeController.PublishLayoutVersion |
| SkyCmsCommandClient.setDefaultLayoutVersion | POST | /api/vscode/layouts/{layoutNumber}/{version}/set-default | VsCodeController.SetDefaultLayoutVersion |
| SkyCmsCommandClient.duplicateLayoutVersion | POST | /api/vscode/layouts/{layoutNumber}/versions | VsCodeController.DuplicateLayoutVersion |
| SkyCmsQueryClient.getTemplates | GET | /api/vscode/templates | VsCodeController.GetTemplates |
| SkyCmsQueryClient.getDocumentFieldContent / getInputFieldValue (templates) | GET | /api/vscode/templates/{templateId}/{fieldKey} | VsCodeController.GetTemplateField |
| SkyCmsCommandClient.setDocumentFieldContent / setInputFieldValue (templates) | PUT | /api/vscode/templates/{templateId}/{fieldKey} | VsCodeController.SetTemplateField |
| SkyCmsCommandClient.createTemplate | POST | /api/vscode/templates | VsCodeController.CreateTemplate |

---

## Articles and Blogs

| Extension Method | HTTP | Route | Controller Action |
| --- | --- | --- | --- |
| SkyCmsQueryClient.getArticles | GET | /api/vscode/articles | VsCodeController.GetArticles |
| SkyCmsQueryClient.getDocumentFieldContent / getInputFieldValue (articles) | GET | /api/vscode/articles/{articleNumber}/{fieldKey} | VsCodeController.GetArticleField |
| SkyCmsCommandClient.setDocumentFieldContent / setInputFieldValue (articles) | PUT | /api/vscode/articles/{articleNumber}/{fieldKey} | VsCodeController.SetArticleField |
| SkyCmsCommandClient.publishArticle | POST | /api/vscode/articles/{articleNumber}/publish | VsCodeController.PublishArticle |
| SkyCmsCommandClient.unpublishArticle | POST | /api/vscode/articles/{articleNumber}/unpublish | VsCodeController.UnpublishArticle |
| SkyCmsCommandClient.restoreArticle | POST | /api/vscode/articles/{articleNumber}/restore | VsCodeController.RestoreArticle |
| SkyCmsQueryClient.getArticleVersions | GET | /api/vscode/articles/{articleNumber}/versions | VsCodeController.GetArticleVersions |
| SkyCmsQueryClient.getArticleVersionFieldContent | GET | /api/vscode/articles/{articleNumber}/versions/{versionId}/{fieldKey} | VsCodeController.GetArticleVersionField |
| SkyCmsCommandClient.createArticle | POST | /api/vscode/articles | VsCodeController.CreateArticle |
| SkyCmsQueryClient.getBlogPosts | GET | /api/vscode/blogs/{blogKey}/posts | VsCodeController.GetBlogPosts |

---

## Files and Folders

| Extension Method | HTTP | Route | Controller Action |
| --- | --- | --- | --- |
| SkyCmsQueryClient.getFilesList | GET | /api/vscode/files/{pathHash?} | VsCodeController.GetFilesList |
| SkyCmsQueryClient.getFileStat | GET | /api/vscode/files/{pathHash}/stat | VsCodeController.GetFileStat |
| SkyCmsQueryClient.readFile | GET | /api/vscode/files/{pathHash}/read | VsCodeController.GetFileContent |
| SkyCmsCommandClient.uploadFile | POST | /api/vscode/files/{pathHash} | VsCodeController.UploadFile |
| SkyCmsCommandClient.deleteFile | DELETE | /api/vscode/files/{pathHash} | VsCodeController.DeleteFile |
| SkyCmsCommandClient.moveFile | POST | /api/vscode/files/{pathHash}/move | VsCodeController.MoveFile |
| SkyCmsCommandClient.createFolder | POST | /api/vscode/folders/{pathHash} | VsCodeController.CreateFolder |
| SkyCmsCommandClient.deleteFolder | DELETE | /api/vscode/folders/{pathHash} | VsCodeController.DeleteFolder |
| SkyCmsCommandClient.moveFolder | POST | /api/vscode/folders/{pathHash}/move | VsCodeController.MoveFolder |

---

## Notes

- FileManagerController and elFinder connector routes are not used by the extension API client.
- The extension opens FileManager UI pages directly for human navigation, but API writes and reads are routed through /api/vscode endpoints.
- Route path parameters in client methods are URL encoded where needed (`entityId`, `fieldKey`, and `versionId`).
- File and folder route parameters use URL-safe Base64 hashes generated from full CMS paths.
- `SkyCmsQueryClient.getFilesList` consumes both canonical and friendly path fields when present:
	- `path`: canonical storage path (operation-safe, used for all reads/writes/moves/deletes)
	- `displayPath`: friendly path (UI/search text, may replace article number segments with article titles)

[← Back to Index](00-Index.md)
