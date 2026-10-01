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
<body class="settings-body">
	<div class="settings-shell">
		<nav class="settings-nav" id="settingsNav" aria-label="Settings sections">
			<div class="settings-brand">
				<svg class="settings-brand-mark" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
					<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.4"/>
					<path d="M12 5.5 13.4 10.6 18.5 12 13.4 13.4 12 18.5 10.6 13.4 5.5 12 10.6 10.6Z" fill="currentColor"/>
				</svg>
				<span>Navi settings</span>
			</div>
			<button class="settings-cat active" data-category="auth" type="button">Auth &amp; model</button>
			<button class="settings-cat" data-category="mcp" type="button">MCP servers</button>
			<button class="settings-cat" data-category="advanced" type="button">Advanced</button>
		</nav>
		<main class="settings-content" id="settingsContent"></main>
	</div>
	<script src="${script}"></script>
</body>
</html>`;
}
