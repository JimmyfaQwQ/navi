// src/test/modelCatalog.test.ts
import * as assert from 'assert';
import { ModelCatalog, mapCopilotModels, parseOpenAiModels } from '../settings/modelCatalog.js';

function fakeConfig(values: Record<string, unknown>) {
	return { get: (k: string, d?: unknown) => (k in values ? values[k] : d) } as any;
}

suite('modelCatalog', () => {
	test('mapCopilotModels formats detail and disabled flag', () => {
		const out = mapCopilotModels([
			{ id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5',
			  capabilities: { supports: { vision: true, reasoningEffort: false },
			                  limits: { max_context_window_tokens: 200000 } },
			  billing: { multiplier: 1 }, policy: { state: 'enabled', terms: '' } } as any,
			{ id: 'old', name: 'Old', capabilities: { supports: { vision: false, reasoningEffort: false },
			  limits: { max_context_window_tokens: 8000 } }, policy: { state: 'disabled', terms: '' } } as any
		]);
		assert.strictEqual(out[0].detail, '200k ctx · 1× · vision');
		assert.strictEqual(out[0].disabled, false);
		assert.strictEqual(out[1].disabled, true);
	});

	test('parseOpenAiModels extracts and sorts ids', () => {
		const out = parseOpenAiModels({ data: [{ id: 'gpt-4o' }, { id: 'a-model' }, { nope: 1 }] });
		assert.deepStrictEqual(out.map((m) => m.id), ['a-model', 'gpt-4o']);
	});
	test('parseOpenAiModels tolerates malformed payloads', () => {
		assert.deepStrictEqual(parseOpenAiModels(null), []);
		assert.deepStrictEqual(parseOpenAiModels({}), []);
	});

	test('list() copilot path maps live models and caches', async () => {
		let starts = 0;
		const fakeClient = { start: async () => { starts++; }, stop: async () => {},
			listModels: async () => ([{ id: 'm1', name: 'M1',
				capabilities: { supports: { vision: false, reasoningEffort: false },
				limits: { max_context_window_tokens: 128000 } } }]) };
		const cat = new ModelCatalog(async () => fakeClient as any, (async () => {}) as any);
		const r1 = await cat.list(fakeConfig({ authMode: 'copilot' }));
		const r2 = await cat.list(fakeConfig({ authMode: 'copilot' }));
		assert.strictEqual(r1.ok, true);
		assert.strictEqual(r1.models[0].id, 'm1');
		assert.strictEqual(starts, 1, 'second call is cached');
	});

	test('list() byok path returns error without key', async () => {
		const cat = new ModelCatalog(undefined, (async () => ({ ok: true, json: async () => ({}) })) as any);
		const r = await cat.list(fakeConfig({ authMode: 'byok', apiKey: '' }));
		assert.strictEqual(r.ok, false);
		assert.match(r.error || '', /API key/i);
	});

	test('list() byok path fetches and parses', async () => {
		const fetchFn = (async (url: string, init: any) => {
			assert.match(url, /\/models$/);
			assert.strictEqual(init.headers.Authorization, 'Bearer sk-x');
			return { ok: true, json: async () => ({ data: [{ id: 'gpt-4o' }] }) };
		}) as any;
		const cat = new ModelCatalog(undefined, fetchFn);
		const r = await cat.list(fakeConfig({ authMode: 'byok', apiKey: 'sk-x', apiBaseUrl: 'https://api.x/v1' }));
		assert.strictEqual(r.ok, true);
		assert.strictEqual(r.models[0].id, 'gpt-4o');
	});
});
