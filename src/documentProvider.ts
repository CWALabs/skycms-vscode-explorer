import * as vscode from 'vscode';
import { SkyCmsQueryClient } from './apiClient/queries';
import { parseFieldUri } from './uriUtils';

export class SkyCmsDocumentProvider implements vscode.TextDocumentContentProvider {
  private readonly queryClient: SkyCmsQueryClient;

  public constructor(queryClient: SkyCmsQueryClient) {
    this.queryClient = queryClient;
  }

  public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const reference = parseFieldUri(uri);
    return this.queryClient.getDocumentFieldContent(reference.entityType, reference.entityId, reference.fieldKey);
  }
}
