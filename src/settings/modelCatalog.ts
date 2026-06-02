import * as vscode from 'vscode';
import type { ModelInfo } from '@github/copilot-sdk';
import { createCopilotClient } from '../agent/modelFactory.js';
import { resolveApiKey, resolveAuthMode, resolveBaseUrl } from './naviConfig.js';
import type { ModelChoice, ModelCatalogResult } from '../types/settings.js';

type ClientFactory = typeof createCopilotClient;

export function mapCopilotModels(models: ModelInfo[]): ModelChoice[] {
	return models.map((m) => {
		const parts: string[] = [];
		const ctx = m.capabilities?.limits?.max_context_window_tokens;
		if (ctx) { parts.push(`${Math.round(ctx / 1000)}k ctx`); }
		if (m.billing?.multiplier !== undefined) { parts.push(`${m.billing.multiplier}×`); }
		if (m.capabilities?.supports?.vision) { parts.push('vision'); }
		if (m.capabilities?.supports?.reasoningEffort) { parts.push('reasoning'); }
		return { id: m.id, label: m.name || m.id, detail: parts.join(' · ') || undefined,
			disabled: m.policy?.state === 'disabled' };
	});
}

export function parseOpenAiModels(payload: unknown): ModelChoice[] {
	const data = (payload as { data?: Array<{ id?: unknown }> } | null)?.data;
	if (!Array.isArray(data)) { return []; }
	return data
		.map((d) => (typeof d?.id === 'string' ? d.id : ''))
		.filter((id) => id.length > 0)
		.sort((a, b) => a.localeCompare(b))
		.map((id) => ({ id, label: id }));
}

function errMsg(error: unknown): string {
	return error instanceof Error ? error.message : 'Unknown error';
}

export class ModelCatalog {
	private readonly cache = new Map<string, ModelCatalogResult>();

	constructor(
		private readonly clientFactory: ClientFactory = createCopilotClient,
		private readonly fetchFn: typeof fetch = fetch
	) {}

	public invalidate(): void { this.cache.clear(); }

	public async list(
		config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('navi'),
		opts: { force?: boolean } = {}
	): Promise<ModelCatalogResult> {
		const mode = resolveAuthMode(config);
		const key = mode === 'copilot' ? 'copilot' : `byok:${resolveBaseUrl(config)}`;
		if (!opts.force && this.cache.has(key)) { return this.cache.get(key)!; }
		const result = mode === 'copilot' ? await this.listCopilot(config) : await this.listByok(config);
		if (result.ok) { this.cache.set(key, result); }
		return result;
	}

	private async listCopilot(config: vscode.WorkspaceConfiguration): Promise<ModelCatalogResult> {
		let client: Awaited<ReturnType<ClientFactory>> | undefined;
		try {
			client = await this.clientFactory(config);
			await client.start();
			const models = await client.listModels();
			return { ok: true, source: 'copilot', models: mapCopilotModels(models) };
		} catch (error) {
			return { ok: false, source: 'copilot', models: [], error: errMsg(error) };
		} finally {
			try { await client?.stop(); } catch { /* best-effort */ }
		}
	}

	private async listByok(config: vscode.WorkspaceConfiguration): Promise<ModelCatalogResult> {
		const apiKey = resolveApiKey(config);
		if (!apiKey) { return { ok: false, source: 'byok', models: [], error: 'No API key configured.' }; }
		const url = `${resolveBaseUrl(config).replace(/\/+$/, '')}/models`;
		try {
			const res = await this.fetchFn(url, { headers: { Authorization: `Bearer ${apiKey}` } });
			if (!res.ok) { return { ok: false, source: 'byok', models: [], error: `Endpoint returned ${res.status}.` }; }
			const models = parseOpenAiModels(await res.json());
			if (models.length === 0) { return { ok: false, source: 'byok', models: [], error: 'No models returned by the endpoint.' }; }
			return { ok: true, source: 'byok', models };
		} catch (error) {
			return { ok: false, source: 'byok', models: [], error: errMsg(error) };
		}
	}
}
