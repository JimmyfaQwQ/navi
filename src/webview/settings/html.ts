import * as vscode from 'vscode';

export function getSettingsHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
	const naviCss = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'navi.css'));
	const settingsCss = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'settings.css'));
	const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'settingsApp.js'));
	return String.raw`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource};" />
	<title>Navi Settings</title>
	<link rel="stylesheet" href="${naviCss}" />
	<link rel="stylesheet" href="${settingsCss}" />
</head>
<body>
	<div class="settings-shell">
		<nav class="settings-nav" id="settingsNav">
			<button class="settings-cat active" data-category="auth" type="button">Auth &amp; Model</button>
			<button class="settings-cat" data-category="mcp" type="button">MCP</button>
			<button class="settings-cat" data-category="advanced" type="button">Advanced</button>
		</nav>
		<main class="settings-content" id="settingsContent"></main>
	</div>
	<script src="${script}"></script>
</body>
</html>`;
}
