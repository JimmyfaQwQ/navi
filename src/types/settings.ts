// Wire contract between the settings webview and the extension host.

export type SettingKey =
	| 'authMode' | 'apiKey' | 'apiBaseUrl' | 'model' | 'streaming'
	| 'mcpEnabled' | 'mcpServersJson' | 'copilotCliPath'
	| 'debugCopilotCliArgs' | 'debugAgentReplyFlow' | 'debugAgentReplyFlowReveal';

export interface ModelChoice {
	id: string;        // value written to navi.model
	label: string;     // Copilot: display name; BYOK: id
	detail?: string;   // Copilot: "200k ctx · 1× · vision"
	disabled?: boolean;
}

export interface ModelCatalogResult {
	ok: boolean;
	source: 'copilot' | 'byok';
	models: ModelChoice[];
	error?: string;
}

export interface SettingsFocus { category: 'auth' | 'mcp' | 'advanced'; field?: string; }

export interface SettingsSnapshot {
	authMode: 'copilot' | 'byok';
	apiKeyConfigured: boolean;     // never send the key value
	apiKeySource: string;
	apiBaseUrl: string;
	model: string;
	streaming: boolean;
	mcpEnabled: boolean;
	mcpServersJson: string;
	copilotCliPath: string;
	debugCopilotCliArgs: boolean;
	debugAgentReplyFlow: boolean;
	debugAgentReplyFlowReveal: boolean;
	defaultModel: string;
	focus?: SettingsFocus;
}

export type SettingsInbound =
	| { type: 'settings:ready' }
	| { type: 'settings:update'; key: SettingKey; value: string | boolean }
	| { type: 'settings:fetchModels'; force?: boolean }
	| { type: 'settings:resetModel' };

export type SettingsOutbound =
	| { type: 'settings:state'; snapshot: SettingsSnapshot }
	| { type: 'settings:models'; loading: true }
	| { type: 'settings:models'; loading: false; result: ModelCatalogResult }
	| { type: 'settings:error'; scope: 'mcp' | 'model' | 'endpoint' | 'general'; message: string };
