import type {
	ModelCatalogResult, ModelChoice, SettingsSnapshot, SettingsInbound, SettingsOutbound, SettingKey
} from '../../types/settings.js';
export type { ModelCatalogResult, ModelChoice, SettingsSnapshot, SettingsInbound, SettingsOutbound, SettingKey };

interface VsCodeApi { postMessage(msg: SettingsInbound): void; }
declare function acquireVsCodeApi(): VsCodeApi;
export const vscode = acquireVsCodeApi();

export function requireElement<T extends HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!el) { throw new Error(`Missing #${id}`); }
	return el as T;
}

export const navEl = requireElement<HTMLElement>('settingsNav');
export const contentEl = requireElement<HTMLElement>('settingsContent');

export interface SettingsViewState {
	snapshot: SettingsSnapshot | null;
	activeCategory: 'auth' | 'mcp' | 'advanced';
	models: { loading: boolean; result: ModelCatalogResult | null; open: boolean };
	error: string;
}

export const state: SettingsViewState = {
	snapshot: null,
	activeCategory: 'auth',
	models: { loading: false, result: null, open: false },
	error: ''
};

export function send(msg: SettingsInbound): void { vscode.postMessage(msg); }
