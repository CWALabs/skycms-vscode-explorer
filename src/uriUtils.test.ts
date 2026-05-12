import {
  buildFieldUri,
  getExtensionForField,
  getLanguageForField,
  getLanguageForMimeType,
  getLanguageForPath,
  parseFieldUri,
} from './uriUtils';

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

  test('parseFieldUri ignores tab label suffix segment', () => {
    const uri = buildFieldUri({
      entityType: 'articles',
      entityId: '100',
      fieldKey: 'content',
      tabLabel: 'Default Site / For Modern Web Teams / Content',
    });

    const parsed = parseFieldUri(uri);

    expect(parsed).toEqual({
      entityType: 'articles',
      entityId: '100',
      fieldKey: 'content',
    });
  });

  test('builds and parses versioned layout field URIs', () => {
    const uri = buildFieldUri({
      entityType: 'layouts',
      entityId: '12',
      version: 4,
      fieldKey: 'head',
      tabLabel: 'Main Layout/Version 4/Head.html',
    });

    const parsed = parseFieldUri(uri);

    expect(parsed).toEqual({
      entityType: 'layouts',
      entityId: '12',
      version: 4,
      fieldKey: 'head',
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
    expect(getLanguageForField('headerJavaScript')).toBe('javascript');
    expect(getLanguageForField('footerJavaScript')).toBe('javascript');
    expect(getLanguageForField('content')).toBe('html');
  });

  test('getExtensionForField maps expected file extensions', () => {
    expect(getExtensionForField('content')).toBe('.html');
    expect(getExtensionForField('headerJavaScript')).toBe('.js');
    expect(getExtensionForField('description')).toBe('.txt');
  });

  test('getLanguageForPath maps common web file extensions', () => {
    expect(getLanguageForPath('/pub/site.css')).toBe('css');
    expect(getLanguageForPath('/pub/site.ts')).toBe('typescript');
    expect(getLanguageForPath('/pub/site.js')).toBe('javascript');
    expect(getLanguageForPath('/pub/index.html')).toBe('html');
    expect(getLanguageForPath('/pub/data.unknown')).toBeUndefined();
  });

  test('getLanguageForMimeType maps common MIME types', () => {
    expect(getLanguageForMimeType('text/html')).toBe('html');
    expect(getLanguageForMimeType('text/css')).toBe('css');
    expect(getLanguageForMimeType('application/javascript')).toBe('javascript');
    expect(getLanguageForMimeType('application/json; charset=utf-8')).toBe('json');
    expect(getLanguageForMimeType('text/plain')).toBe('plaintext');
    expect(getLanguageForMimeType('application/octet-stream')).toBeUndefined();
    expect(getLanguageForMimeType(undefined)).toBeUndefined();
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
