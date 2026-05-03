import { buildFieldUri, getLanguageForField, parseFieldUri } from './uriUtils';

jest.mock('vscode');

describe('uriUtils', () => {
  test('buildFieldUri and parseFieldUri round-trip values', () => {
    const uri = buildFieldUri({
      entityType: 'articles',
      entityId: '100',
      fieldKey: 'content',
    });

    const parsed = parseFieldUri(uri);

    expect(parsed).toEqual({
      entityType: 'articles',
      entityId: '100',
      fieldKey: 'content',
    });
  });

  test('parseFieldUri accepts authority + path variants', () => {
    const vscode = require('vscode');
    const uri = vscode.Uri.parse('skycms://layouts/1/head');

    const parsed = parseFieldUri(uri);

    expect(parsed).toEqual({
      entityType: 'layouts',
      entityId: '1',
      fieldKey: 'head',
    });
  });

  test('getLanguageForField maps plaintext fields', () => {
    expect(getLanguageForField('description')).toBe('plaintext');
    expect(getLanguageForField('introduction')).toBe('plaintext');
    expect(getLanguageForField('content')).toBe('html');
  });

  test('parseFieldUri throws for non-skycms scheme', () => {
    const vscode = require('vscode');
    const uri = vscode.Uri.from({ scheme: 'file', path: '/layouts/1/head' });
    expect(() => parseFieldUri(uri)).toThrow('Unsupported URI scheme');
  });

  test('parseFieldUri throws when path has wrong number of parts', () => {
    const vscode = require('vscode');
    const uri = vscode.Uri.from({ scheme: 'skycms', path: '/layouts/1' });
    expect(() => parseFieldUri(uri)).toThrow('Invalid SkyCMS field URI');
  });

  test('parseFieldUri throws for unsupported entity type', () => {
    const vscode = require('vscode');
    const uri = vscode.Uri.from({ scheme: 'skycms', path: '/pages/1/title' });
    expect(() => parseFieldUri(uri)).toThrow('Unsupported SkyCMS entity type');
  });
});
