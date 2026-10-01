import * as vscode from 'vscode';

const WELCOME_TITLE = 'What would you like to build today?';
const WELCOME_BODY =
	'Paste your requirements, errors, or related code. Navi reads the project first, shows its progress here, then gives you the next step.';

export function getChatHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
	const naviCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'navi.css'));
	const chatCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'chat.css'));
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'chatApp.js'));
	return String.raw`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource};" />
	<title>Navi Chat</title>
	<link rel="stylesheet" href="${naviCssUri}" />
	<link rel="stylesheet" href="${chatCssUri}" />
</head>
<body>
	<div id="chatHeader" class="chat-header">
		<button id="chatTitleBtn" class="chat-title-btn" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="sessionDrawer" title="Show conversations">
			<span id="chatTitle" class="chat-title">New Chat</span>
			<svg class="chat-title-chevron" width="10" height="10" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
				<path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		</button>
		<button id="headerNewChatBtn" class="navi-icon-btn" type="button" aria-label="New chat" title="New chat">
			<svg class="navi-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
				<path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
			</svg>
		</button>
	</div>
	<div class="chat-body" id="chatBody">
		<div class="message assistant welcome" data-welcome-message="true">
			<svg class="welcome-mark" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
				<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.2"/>
				<path d="M12 5.5 13.4 10.6 18.5 12 13.4 13.4 12 18.5 10.6 13.4 5.5 12 10.6 10.6Z" fill="currentColor"/>
			</svg>
			<p class="welcome-title">${WELCOME_TITLE}</p>
			<p class="welcome-body">${WELCOME_BODY}</p>
		</div>
		<div id="toolCallSlot" class="tool-call-slot empty hidden" aria-live="polite"></div>
		<div class="loading" id="loading">Thinking…</div>
	</div>
	<div class="chat-footer">
		<div id="composerShell" class="composer-shell">
			<div id="todoPanel" class="todo-panel">
				<div class="todo-header">
					<div class="todo-title-wrap">
						<span class="todo-title">Tasks</span>
						<span id="todoSummary" class="todo-summary"></span>
					</div>
					<button id="todoToggleBtn" class="section-toggle" type="button" aria-expanded="true" aria-label="Toggle task list">
						<svg class="section-toggle-icon" width="10" height="10" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
							<path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</button>
				</div>
				<div id="todoList" class="todo-list"></div>
			</div>
			<div id="composerPanel" class="composer">
				<div id="composerBody" class="composer-body">
					<textarea id="prompt" placeholder="Ask Navi anything" aria-label="Message Navi" rows="2"></textarea>
					<div class="composer-actions">
						<button id="settingsBtn" class="navi-icon-btn" type="button" aria-label="Settings" title="Settings">
							<svg class="navi-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
								<path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
								<circle cx="10" cy="4.5" r="1.5" stroke="currentColor" stroke-width="1.3"/>
								<circle cx="6" cy="11.5" r="1.5" stroke="currentColor" stroke-width="1.3"/>
							</svg>
						</button>
						<button id="sendBtn" class="composer-send" type="button" aria-label="Send" title="Send">
							<svg class="navi-icon icon-send" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
								<path d="M8 13V3.5M4 7l4-4 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
							<svg class="navi-icon icon-stop" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
								<rect x="4.5" y="4.5" width="7" height="7" rx="1.5"/>
							</svg>
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
	<div id="sessionDrawerOverlay" class="session-drawer-overlay"></div>
	<div id="sessionDrawer" class="session-drawer" role="dialog" aria-modal="true" aria-label="Conversations" aria-hidden="true">
		<div class="drawer-search-wrap">
			<input id="drawerSearch" class="drawer-search" type="text" placeholder="Search conversations" aria-label="Search conversations" autocomplete="off" />
		</div>
		<div id="sessionList" class="session-list"></div>
		<div id="sessionEmpty" class="session-empty">No conversations match.</div>
	</div>
	<script src="${scriptUri}"></script>
</body>
</html>`;
}
