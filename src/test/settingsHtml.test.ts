// src/test/settingsHtml.test.ts
import * as assert from 'assert';
import * as vscode from 'vscode';
import { getSettingsHtml } from '../webview/settings/html.js';

suite('getSettingsHtml', () => {
	test('renders CSP, resources, and category shell', () => {
		const webview = {
			cspSource: 'vscode-webview://test-source',
			asWebviewUri: (uri: vscode.Uri) => vscode.Uri.parse(`webview:${uri.path}`)
		} as unknown as vscode.Webview;
		const html = getSettingsHtml(webview, vscode.Uri.file('/tmp/navi-extension'));
		assert.ok(html.includes('<title>Navi Settings</title>'));
		assert.ok(html.includes('style-src vscode-webview://test-source; script-src vscode-webview://test-source;'));
		assert.ok(html.includes('webview:/tmp/navi-extension/media/navi.css'));
		assert.ok(html.includes('webview:/tmp/navi-extension/media/settings.css'));
		assert.ok(html.includes('webview:/tmp/navi-extension/dist/settingsApp.js'));
		assert.ok(html.includes('data-category="auth"'));
		assert.ok(html.includes('data-category="mcp"'));
		assert.ok(html.includes('data-category="advanced"'));
		assert.ok(html.includes('id="settingsContent"'));
	});
});
