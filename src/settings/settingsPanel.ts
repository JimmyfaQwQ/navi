import * as vscode from 'vscode';
import { getSettingsHtml } from '../webview/settings/html.js';
import { ModelCatalog } from './modelCatalog.js';
import { validateSettingUpdate } from './settingsValidation.js';
import {
	DEFAULT_MODEL, affectsModel, describeApiKeySource, readNaviConfig, resolveConfiguredApiKey
} from './naviConfig.js';
import type { SettingsFocus, SettingsInbound, SettingsOutbound, SettingsSnapshot } from '../types/settings.js';

export class SettingsPanel {
	private static current?: SettingsPanel;
	private readonly disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionUri: vscode.Uri, modelCatalog: ModelCatalog, focus?: SettingsFocus): void {
		if (SettingsPanel.current) {
			SettingsPanel.current.panel.reveal();
			if (focus) { void SettingsPanel.current.post({ type: 'settings:state', snapshot: SettingsPanel.current.snapshot(focus) }); }
			return;
		}
		const panel = vscode.window.createWebviewPanel('navi.settingsPanel', 'Navi Settings',
			vscode.ViewColumn.Active,
			{ enableScripts: true, localResourceRoots: [extensionUri], retainContextWhenHidden: true });
		SettingsPanel.current = new SettingsPanel(panel, extensionUri, modelCatalog, focus);
	}

	private constructor(
		private readonly panel: vscode.WebviewPanel,
		extensionUri: vscode.Uri,
		private readonly modelCatalog: ModelCatalog,
		private pendingFocus?: SettingsFocus
	) {
		panel.webview.html = getSettingsHtml(panel.webview, extensionUri);
		panel.webview.onDidReceiveMessage((m: SettingsInbound) => this.onMessage(m), null, this.disposables);
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (!e.affectsConfiguration('navi')) { return; }
			if (affectsModel(e)) { this.modelCatalog.invalidate(); }
			void this.post({ type: 'settings:state', snapshot: this.snapshot() });
		}, null, this.disposables);
		panel.onDidDispose(() => this.dispose(), null, this.disposables);
	}

	private async onMessage(m: SettingsInbound): Promise<void> {
		const config = vscode.workspace.getConfiguration('navi');
		if (m.type === 'settings:ready') {
			await this.post({ type: 'settings:state', snapshot: this.snapshot(this.pendingFocus) });
			this.pendingFocus = undefined;
			return;
		}
		if (m.type === 'settings:update') {
			const check = validateSettingUpdate(m.key, m.value);
			if (!check.ok) {
				await this.post({ type: 'settings:error', scope: scopeFor(m.key), message: check.error });
				return;
			}
			await config.update(m.key, m.value, vscode.ConfigurationTarget.Global);
			return; // change listener re-posts the snapshot
		}
		if (m.type === 'settings:resetModel') {
			await config.update('model', DEFAULT_MODEL, vscode.ConfigurationTarget.Global);
			return;
		}
		if (m.type === 'settings:fetchModels') {
			await this.post({ type: 'settings:models', loading: true });
			const result = await this.modelCatalog.list(config, { force: m.force });
			await this.post({ type: 'settings:models', loading: false, result });
		}
	}

	private snapshot(focus?: SettingsFocus): SettingsSnapshot {
		const c = readNaviConfig();
		return {
			authMode: c.authMode, apiKeyConfigured: !!resolveConfiguredApiKey(), apiKeySource: describeApiKeySource(),
			apiBaseUrl: c.apiBaseUrl, model: c.model, streaming: c.streaming, mcpEnabled: c.mcpEnabled,
			mcpServersJson: c.mcpServersJson, copilotCliPath: c.copilotCliPath,
			debugCopilotCliArgs: c.debugCopilotCliArgs, debugAgentReplyFlow: c.debugAgentReplyFlow,
			debugAgentReplyFlowReveal: c.debugAgentReplyFlowReveal, defaultModel: DEFAULT_MODEL, focus
		};
	}

	private post(msg: SettingsOutbound): Thenable<boolean> { return this.panel.webview.postMessage(msg); }

	private dispose(): void {
		SettingsPanel.current = undefined;
		this.disposables.forEach((d) => d.dispose());
	}
}

function scopeFor(key: string): 'mcp' | 'model' | 'endpoint' | 'general' {
	if (key === 'mcpServersJson') { return 'mcp'; }
	if (key === 'model') { return 'model'; }
	if (key === 'apiBaseUrl') { return 'endpoint'; }
	return 'general';
}
