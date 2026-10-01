import * as vscode from 'vscode';

export function getFocusHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
	const naviCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'navi.css'));
	const focusCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'focus.css'));
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'focusApp.js'));
	return String.raw`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource};" />
	<title>Navi Focus</title>
	<link rel="stylesheet" href="${naviCssUri}" />
	<link rel="stylesheet" href="${focusCssUri}" />
</head>
<body class="focus-body">
	<div class="focus-page">
		<div class="focus-page-header">
			<div class="focus-page-title">Focus regions</div>
			<div class="focus-page-actions">
				<button id="focusPrevBtn" class="navi-icon-btn focus-nav-btn" type="button" aria-label="Previous region" title="Previous region">
					<svg class="navi-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
						<path d="M10 4L6 8L10 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>
				<div id="focusSummary" class="focus-page-summary" aria-live="polite">No focus regions yet</div>
				<button id="focusNextBtn" class="navi-icon-btn focus-nav-btn" type="button" aria-label="Next region" title="Next region">
					<svg class="navi-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
						<path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>
			</div>
		</div>
		<div id="focusList" class="focus-page-list"></div>
		<div id="focusFooter" class="focus-page-footer">
			<span id="focusSelectionLabel" class="focus-selection-label"></span>
			<div class="focus-footer-actions">
				<button id="focusHelpSelectedBtn" class="navi-btn secondary focus-footer-btn focus-help-btn" type="button">Help</button>
				<button id="focusReviewSelectedBtn" class="navi-btn focus-footer-btn focus-review-btn" type="button">Review</button>
			</div>
		</div>
	</div>
	<script src="${scriptUri}"></script>
</body>
</html>`;
}
