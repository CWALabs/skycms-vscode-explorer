import { SkyCmsDocumentProvider } from './documentProvider';

jest.mock('vscode');

describe('SkyCmsDocumentProvider', () => {
  test('loads document content from query client based on skycms URI', async () => {
    const queryClient = {
      getDocumentFieldContent: jest.fn(async () => '<h1>Header</h1>'),
    };

    const provider = new SkyCmsDocumentProvider(queryClient as any);
    const vscode = require('vscode');
    const uri = vscode.Uri.parse('skycms://layouts/1/head');

    const content = await provider.provideTextDocumentContent(uri);

    expect(content).toBe('<h1>Header</h1>');
    expect(queryClient.getDocumentFieldContent).toHaveBeenCalledWith('layouts', '1', 'head');
  });
});
