jest.mock('vscode', () => ({
  TreeItem: class {
    public label: string;
    public collapsibleState: number;

    public constructor(label: string, collapsibleState: number) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  window: {
    showInputBox: jest.fn(),
    showInformationMessage: jest.fn(),
  },
}));

import * as vscode from 'vscode';
import {
  buildPreviewUrl,
  openInputField,
  resolveLayoutCommandTarget,
  toPersistedInputValue,
  validateInputValue,
} from './webHostCommandDriver';

describe('webHostCommandDriver input helpers', () => {
  test('validateInputValue enforces required title', () => {
    expect(validateInputValue('title', '   ')).toBe('This field is required and cannot be empty.');
  });

  test('validateInputValue accepts empty published value', () => {
    expect(validateInputValue('published', '   ')).toBeUndefined();
  });

  test('toPersistedInputValue normalizes published date', () => {
    expect(toPersistedInputValue('published', '2025-10-01T12:00:00Z')).toBe('2025-10-01T12:00:00.000Z');
  });

  test('toPersistedInputValue clears published date for empty values', () => {
    expect(toPersistedInputValue('published', '   ')).toBeNull();
  });
});

describe('webHostCommandDriver.resolveLayoutCommandTarget', () => {
  test('resolves layout node target', () => {
    const result = resolveLayoutCommandTarget({
      kind: 'layout',
      layout: {
        layoutNumber: 7,
        version: 3,
        name: 'Main Layout',
      },
    });

    expect(result).toEqual({ layoutNumber: 7, version: 3, name: 'Main Layout' });
  });

  test('resolves layout-version node target', () => {
    const result = resolveLayoutCommandTarget({
      kind: 'layout-version',
      layout: {
        layoutNumber: 7,
        version: 3,
        name: 'Main Layout',
      },
      layoutVersion: {
        layoutNumber: 7,
        version: 2,
        name: 'Main Layout',
      },
    });

    expect(result).toEqual({ layoutNumber: 7, version: 2, name: 'Main Layout' });
  });
});

describe('webHostCommandDriver.buildPreviewUrl', () => {
  test('builds article preview URL using editable id', async () => {
    const queryClientMock = {
      getInputFieldValue: jest.fn(async () => 'editable-id-123'),
    };

    const result = await buildPreviewUrl(
      {
        kind: 'article',
        article: {
          articleNumber: 42,
          title: 'Hello',
        },
      } as never,
      'https://editor.example.com',
      queryClientMock as unknown as import('./apiClient/queries').SkyCmsQueryClient,
    );

    expect(result).toContain('previewType=editor');
    expect(result).toContain('itemId=editable-id-123');
    expect(result).toContain('Editor%2FVisualEditor%2F42');
  });
});

describe('webHostCommandDriver.openInputField', () => {
  test('persists edited value and shows success message', async () => {
    const showInputBoxMock = vscode.window.showInputBox as jest.Mock;
    const showInformationMessageMock = vscode.window.showInformationMessage as jest.Mock;
    showInputBoxMock.mockResolvedValue('Updated title');

    const queryClientMock = {
      getInputFieldValue: jest.fn(async () => 'Old title'),
    };

    const commandClientMock = {
      setInputFieldValue: jest.fn(async () => undefined),
    };

    await openInputField(
      {
        kind: 'field',
        label: 'Title',
        entityType: 'articles',
        entityId: '42',
        fieldKey: 'title',
        entityLabel: 'Article',
      } as never,
      queryClientMock as unknown as import('./apiClient/queries').SkyCmsQueryClient,
      commandClientMock as unknown as import('./apiClient/commands').SkyCmsCommandClient,
    );

    expect(queryClientMock.getInputFieldValue).toHaveBeenCalledWith('articles', '42', 'title');
    expect(commandClientMock.setInputFieldValue).toHaveBeenCalledWith('articles', '42', 'title', 'Updated title');
    expect(showInformationMessageMock).toHaveBeenCalledWith('Title updated.');
  });
});