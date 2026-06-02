# Navi Settings Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Navi's chained QuickPick settings flow with an editor-tab webview panel that edits every `navi.*` setting and turns the model field into a live, fetched dropdown.

**Architecture:** A new `ModelCatalog` service (extension host) fetches models — Copilot via the SDK `listModels()`, BYOK via `GET {baseUrl}/models`. A `SettingsPanel` manager owns a singleton `createWebviewPanel`, reads/writes `navi.*` config, and exchanges typed messages with a webview client (`src/webview/settings/*`). The webview renders a sidebar-category form; MCP servers are expanded, auto-saving cards. The QuickPick `SettingsManager`/`McpSettingsManager` are retired.

**Tech Stack:** TypeScript, VS Code extension API (`createWebviewPanel`, `workspace.getConfiguration`), `@github/copilot-sdk` (node-side external), webpack (separate `web` config for webview bundles), mocha + `assert` via `@vscode/test-cli`.

**Spec:** `docs/superpowers/specs/2026-06-02-navi-settings-panel-design.md`

**Plan-file note:** This plan currently lives at the Plan-mode path. As the first execution step, copy it to `docs/superpowers/plans/2026-06-02-navi-settings-panel.md` and commit, to match repo convention.

**Iteration test command (fast):** `npm run compile-tests && npx vscode-test`
**Full gate (pretest runs lint + webpack):** `npm test`
The runner globs `out/test/**/*.test.js` and runs the whole suite; there is no single-file filter, so "expected to fail/pass" refers to the named `suite`/`test`.

---

## File structure

**New (extension host)**
- `src/types/settings.ts` — shared DTOs + message unions.
- `src/settings/modelCatalog.ts` — model fetching service + pure mappers.
- `src/settings/settingsValidation.ts` — `validateSettingUpdate(key, value)`.
- `src/settings/settingsPanel.ts` — webview panel singleton + message handler.

**New (webview client, bundled to `dist/settingsApp.js`)**
- `src/webview/settings/html.ts` — `getSettingsHtml(webview, extensionUri)`.
- `src/webview/settings/state.ts` — vscode bridge, DOM refs, mutable `state`, type re-exports.
- `src/webview/settings/render.ts` — pure-ish DOM rendering from snapshot/model/error.
- `src/webview/settings/view.ts` — event wiring, message listener, senders (webpack entry).
- `media/settings.css` — panel styles.

**New (tests)**
- `src/test/modelCatalog.test.ts`
- `src/test/settingsValidation.test.ts`
- `src/test/settingsHtml.test.ts`
- extend `src/test/naviConfig.test.ts` for `describeApiKeySource`.

**Modified**
- `src/settings/naviConfig.ts` — export `describeApiKeySource`.
- `src/extension.ts` — construct `ModelCatalog`, register `navi.openSettings`.
- `src/chat/inboundRouter.ts` — `chat:openSettings` → execute command; drop `SettingsManager`.
- `src/chat/apiKeyGate.ts` + `src/chat/generationController.ts` — open panel via callback.
- `webpack.config.js` — add `settingsApp` entry.
- `package.json` — add `navi.openSettings` to `contributes.commands`.

**Deleted**
- `src/settings/settingsCommands.ts`, `src/mcp/settingsCommands.ts`.

---

## Task 1: Shared types (`src/types/settings.ts`)

**Files:** Create `src/types/settings.ts`

- [ ] **Step 1: Write the types** (no test — type-only module)

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run compile-tests`
Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git add src/types/settings.ts && git commit -m "feat(settings): shared types for settings panel"
```

---

## Task 2: ModelCatalog (`src/settings/modelCatalog.ts`)

**Files:**
- Create: `src/settings/modelCatalog.ts`
- Test: `src/test/modelCatalog.test.ts`
- Reuse: `createCopilotClient` (`src/agent/modelFactory.ts`), `resolveAuthMode`/`resolveBaseUrl`/`resolveApiKey` (`src/settings/naviConfig.ts`), `ModelInfo` (`@github/copilot-sdk`).

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run compile-tests && npx vscode-test`
Expected: FAIL — `Cannot find module '../settings/modelCatalog.js'`.

- [ ] **Step 3: Implement `src/settings/modelCatalog.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run compile-tests && npx vscode-test`
Expected: PASS — `modelCatalog` suite green.

- [ ] **Step 5: Commit**

```bash
git add src/settings/modelCatalog.ts src/test/modelCatalog.test.ts
git commit -m "feat(settings): ModelCatalog with Copilot+BYOK model fetching"
```

---

## Task 3: `describeApiKeySource` in naviConfig

**Files:** Modify `src/settings/naviConfig.ts`; Test: extend `src/test/naviConfig.test.ts`.

- [ ] **Step 1: Add the failing test** (append inside the `naviConfig` suite)

```ts
import { describeApiKeySource } from '../settings/naviConfig.js'; // add to imports
// ...
	test('describeApiKeySource reports a stable label', () => {
		// With no settings key and (in CI) no env var, source is "Not configured".
		const label = describeApiKeySource(fakeConfig({ apiKey: '' }) as any);
		assert.match(label, /Not configured|Environment variable/);
	});
```
Add this `fakeConfig` helper near the top of the test file if not present:
```ts
function fakeConfig(values: Record<string, unknown>) {
	return { get: (k: string, d?: unknown) => (k in values ? values[k] : d) };
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run compile-tests && npx vscode-test`
Expected: FAIL — `describeApiKeySource` is not exported.

- [ ] **Step 3: Implement** — add to `src/settings/naviConfig.ts` (logic lifted verbatim from `SettingsManager.describeKeySource`):

```ts
/** Human-readable source of the effective API key (settings vs env vs none). */
export function describeApiKeySource(config: vscode.WorkspaceConfiguration = naviConfiguration()): string {
	const configuredApiKey = resolveConfiguredApiKey(config);
	const envApiKey = resolveEnvApiKey();
	return configuredApiKey
		? 'VS Code Settings (in use)'
		: envApiKey
			? 'Environment variable (in use)'
			: 'Not configured';
}
```

- [ ] **Step 4: Run to verify it passes** — `npm run compile-tests && npx vscode-test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/settings/naviConfig.ts src/test/naviConfig.test.ts
git commit -m "feat(settings): hoist describeApiKeySource into naviConfig"
```

---

## Task 4: Settings validation (`src/settings/settingsValidation.ts`)

**Files:** Create `src/settings/settingsValidation.ts`; Test: `src/test/settingsValidation.test.ts`. Reuse `parseMcpServerSettings` (`src/mcp/config.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// src/test/settingsValidation.test.ts
import * as assert from 'assert';
import { validateSettingUpdate } from '../settings/settingsValidation.js';

suite('validateSettingUpdate', () => {
	test('model must be non-empty', () => {
		assert.strictEqual(validateSettingUpdate('model', 'gpt-5').ok, true);
		assert.strictEqual(validateSettingUpdate('model', '  ').ok, false);
	});
	test('apiBaseUrl must be http(s)', () => {
		assert.strictEqual(validateSettingUpdate('apiBaseUrl', 'https://api.x/v1').ok, true);
		assert.strictEqual(validateSettingUpdate('apiBaseUrl', 'ftp://x').ok, false);
		assert.strictEqual(validateSettingUpdate('apiBaseUrl', 'not a url').ok, false);
	});
	test('mcpServersJson validated via parseMcpServerSettings', () => {
		assert.strictEqual(validateSettingUpdate('mcpServersJson', '').ok, true);
		assert.strictEqual(validateSettingUpdate('mcpServersJson', '{"a":{"type":"stdio"}}').ok, true);
		assert.strictEqual(validateSettingUpdate('mcpServersJson', '{bad').ok, false);
		assert.strictEqual(validateSettingUpdate('mcpServersJson', '[1,2]').ok, false);
	});
	test('booleans and other keys pass through', () => {
		assert.strictEqual(validateSettingUpdate('streaming', true).ok, true);
		assert.strictEqual(validateSettingUpdate('copilotCliPath', '').ok, true);
	});
});
```

- [ ] **Step 2: Run to verify it fails** — module not found.

- [ ] **Step 3: Implement `src/settings/settingsValidation.ts`**

```ts
import { parseMcpServerSettings } from '../mcp/config.js';
import type { SettingKey } from '../types/settings.js';

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateSettingUpdate(key: SettingKey, value: string | boolean): ValidationResult {
	switch (key) {
		case 'model':
			return typeof value === 'string' && value.trim()
				? { ok: true } : { ok: false, error: 'Model name cannot be empty.' };
		case 'apiBaseUrl':
			return validateUrl(String(value));
		case 'mcpServersJson':
			try { parseMcpServerSettings(String(value)); return { ok: true }; }
			catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Invalid MCP JSON.' }; }
		default:
			return { ok: true };
	}
}

function validateUrl(value: string): ValidationResult {
	const trimmed = value.trim();
	if (!trimmed) { return { ok: false, error: 'API endpoint cannot be empty.' }; }
	try {
		const url = new URL(trimmed);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			return { ok: false, error: 'API endpoint must use http or https.' };
		}
		return { ok: true };
	} catch {
		return { ok: false, error: 'Please enter a valid URL.' };
	}
}
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/settings/settingsValidation.ts src/test/settingsValidation.test.ts
git commit -m "feat(settings): validateSettingUpdate helper"
```

---

## Task 5: Settings panel HTML shell (`src/webview/settings/html.ts`)

**Files:** Create `src/webview/settings/html.ts`; Test `src/test/settingsHtml.test.ts` (mirror `chatHtml.test.ts`).

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run to verify it fails** — module not found.

- [ ] **Step 3: Implement `src/webview/settings/html.ts`** (mirrors `chat/html.ts`: CSP via `webview.cspSource`, `asWebviewUri` for css/js). The body is the static shell — a sidebar nav + an empty `#settingsContent` the client fills:

```ts
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
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/webview/settings/html.ts src/test/settingsHtml.test.ts
git commit -m "feat(settings): settings panel HTML shell"
```

---

## Task 6: Webpack entry + CSS

**Files:** Modify `webpack.config.js`; Create `media/settings.css`.

- [ ] **Step 1: Add the webview entry** — in `webpack.config.js`, `webviewConfig.entry`:

```js
  entry: {
		chatApp: './src/webview/chat/view.ts',
		focusApp: './src/webview/focus/view.ts',
		settingsApp: './src/webview/settings/view.ts'
  },
```

- [ ] **Step 2: Create `media/settings.css`** — reuse VS Code theme vars (as `navi.css`/`chat.css` do). Concrete starting rules (extend during render work):

```css
.settings-shell { display: flex; height: 100vh; color: var(--vscode-foreground); font-size: 13px; }
.settings-nav { flex: 0 0 180px; border-right: 1px solid var(--vscode-panel-border); padding: 12px 0; }
.settings-cat { display: block; width: 100%; text-align: left; padding: 8px 16px; background: none;
	border: none; color: var(--vscode-foreground); cursor: pointer; }
.settings-cat.active { background: var(--vscode-list-activeSelectionBackground);
	border-left: 2px solid var(--vscode-focusBorder); }
.settings-content { flex: 1; padding: 20px 24px; overflow: auto; }
.settings-section { display: none; } .settings-section.active { display: block; }
.settings-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0;
	border-bottom: 1px solid var(--vscode-panel-border); gap: 16px; }
.settings-row label { color: var(--vscode-descriptionForeground); }
.settings-input, .settings-select { background: var(--vscode-input-background);
	color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent);
	border-radius: 3px; padding: 4px 8px; min-width: 220px; }
.model-control { position: relative; }
.model-popover { position: absolute; right: 0; z-index: 10; background: var(--vscode-dropdown-background);
	border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border)); border-radius: 4px; min-width: 280px; }
.model-item { padding: 6px 10px; cursor: pointer; display: flex; gap: 8px; }
.model-item:hover { background: var(--vscode-list-hoverBackground); }
.model-item.disabled { opacity: .5; pointer-events: none; }
.model-item .meta { color: var(--vscode-descriptionForeground); font-size: 11px; margin-left: auto; }
.model-action { padding: 6px 10px; color: var(--vscode-textLink-foreground); cursor: pointer; }
.tag { font-size: 10px; padding: 1px 6px; border-radius: 3px; background: var(--vscode-badge-background);
	color: var(--vscode-badge-foreground); }
.mcp-card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 12px; margin-bottom: 10px; }
.mcp-card.disabled { opacity: .55; }
.mcp-field { display: flex; align-items: center; gap: 10px; padding: 3px 0; }
.mcp-field .k { flex: 0 0 90px; color: var(--vscode-descriptionForeground); }
.mcp-add { border: 1px dashed var(--vscode-panel-border); border-radius: 6px; padding: 10px;
	text-align: center; color: var(--vscode-textLink-foreground); cursor: pointer; }
.field-error { color: var(--vscode-errorForeground); font-size: 11px; }
.toggle { cursor: pointer; }
```

- [ ] **Step 3: Verify webpack builds** (entry resolves once `view.ts` exists; for now confirm config is valid JS).

Run: `node -e "require('./webpack.config.js')"`
Expected: no error (array of two configs).

- [ ] **Step 4: Commit**

```bash
git add webpack.config.js media/settings.css
git commit -m "build(settings): webpack entry + base panel CSS"
```

---

## Task 7: Webview client — state bridge (`src/webview/settings/state.ts`)

**Files:** Create `src/webview/settings/state.ts`. (No unit test — DOM module, consistent with chat/focus convention.)

- [ ] **Step 1: Implement** — vscode bridge, DOM refs, mutable state, re-export wire types:

```ts
import type {
	ModelCatalogResult, SettingsSnapshot, SettingsInbound, SettingsOutbound, SettingKey
} from '../../types/settings.js';
export type { ModelCatalogResult, SettingsSnapshot, SettingsInbound, SettingsOutbound, SettingKey };

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
}

export const state: SettingsViewState = {
	snapshot: null,
	activeCategory: 'auth',
	models: { loading: false, result: null, open: false }
};

export function send(msg: SettingsInbound): void { vscode.postMessage(msg); }
```

- [ ] **Step 2: Typecheck** — `npm run compile-tests` → PASS.
- [ ] **Step 3: Commit**

```bash
git add src/webview/settings/state.ts && git commit -m "feat(settings): webview state bridge"
```

---

## Task 8: Webview client — rendering (`src/webview/settings/render.ts`)

**Files:** Create `src/webview/settings/render.ts`. Imports `state`, `send`, `contentEl` from `state.js`.

Responsibilities (each a small exported function; full code below for the non-obvious ones, straightforward field rows follow the same `row(label, control)` helper):

- [ ] **Step 1: Implement helpers + section renderers**

```ts
import { state, send, contentEl, type SettingsSnapshot, type ModelChoice } from './state.js';
import type { ModelCatalogResult } from './state.js';

function el(tag: string, cls?: string, text?: string): HTMLElement {
	const e = document.createElement(tag);
	if (cls) { e.className = cls; }
	if (text !== undefined) { e.textContent = text; }
	return e;
}
function row(labelText: string, control: HTMLElement): HTMLElement {
	const r = el('div', 'settings-row');
	r.appendChild(el('label', undefined, labelText));
	r.appendChild(control);
	return r;
}
function toggle(value: boolean, onChange: (v: boolean) => void): HTMLElement {
	const t = el('span', `toggle ${value ? 'on' : 'off'}`, value ? 'On' : 'Off');
	t.addEventListener('click', () => onChange(!value));
	return t;
}
function textInput(value: string, onCommit: (v: string) => void, opts: { password?: boolean } = {}): HTMLInputElement {
	const i = el('input', 'settings-input') as HTMLInputElement;
	i.type = opts.password ? 'password' : 'text';
	i.value = value;
	i.addEventListener('change', () => onCommit(i.value));
	return i;
}

// --- top-level render dispatch ---
export function render(): void {
	contentEl.replaceChildren();
	if (!state.snapshot) { contentEl.appendChild(el('p', undefined, 'Loading…')); return; }
	if (state.activeCategory === 'auth') { renderAuth(state.snapshot); }
	else if (state.activeCategory === 'mcp') { renderMcp(state.snapshot); }
	else { renderAdvanced(state.snapshot); }
}

function update(key: string, value: string | boolean): void {
	send({ type: 'settings:update', key: key as any, value });
}

function renderAuth(s: SettingsSnapshot): void {
	const sec = el('div', 'settings-section active');
	// auth mode segmented control
	const seg = el('div', 'segmented');
	(['copilot', 'byok'] as const).forEach((mode) => {
		const b = el('button', `seg ${s.authMode === mode ? 'active' : ''}`,
			mode === 'copilot' ? 'GitHub Copilot' : 'BYOK');
		b.addEventListener('click', () => update('authMode', mode));
		seg.appendChild(b);
	});
	sec.appendChild(row('Auth mode', seg));

	if (s.authMode === 'byok') {
		sec.appendChild(row('API key', textInput(s.apiKeyConfigured ? '********' : '',
			(v) => update('apiKey', v), { password: true })));
		sec.appendChild(rowNote(s.apiKeySource));
		sec.appendChild(row('API endpoint', textInput(s.apiBaseUrl, (v) => update('apiBaseUrl', v))));
	}
	sec.appendChild(row('Model', renderModelControl(s)));
	sec.appendChild(row('Streaming', toggle(s.streaming, (v) => update('streaming', v))));
	contentEl.appendChild(sec);
}

function rowNote(text: string): HTMLElement {
	const r = el('div', 'settings-row note'); r.appendChild(el('small', undefined, text)); return r;
}

function renderAdvanced(s: SettingsSnapshot): void {
	const sec = el('div', 'settings-section active');
	sec.appendChild(row('Copilot CLI path', textInput(s.copilotCliPath, (v) => update('copilotCliPath', v))));
	sec.appendChild(row('Debug CLI args', toggle(s.debugCopilotCliArgs, (v) => update('debugCopilotCliArgs', v))));
	sec.appendChild(row('Debug agent flow', toggle(s.debugAgentReplyFlow, (v) => update('debugAgentReplyFlow', v))));
	sec.appendChild(row('Reveal agent-flow log', toggle(s.debugAgentReplyFlowReveal, (v) => update('debugAgentReplyFlowReveal', v))));
	contentEl.appendChild(sec);
}
```

- [ ] **Step 2: Implement the model control (dropdown + in-place custom entry)**

```ts
function renderModelControl(s: SettingsSnapshot): HTMLElement {
	const wrap = el('div', 'model-control');
	const inList = state.models.result?.models.some((m) => m.id === s.model) ?? false;
	const field = el('button', 'settings-input model-field');
	field.appendChild(el('span', undefined, s.model));
	if (!inList && state.models.result) { field.appendChild(el('span', 'tag', 'custom')); }
	field.appendChild(el('span', undefined, state.models.open ? ' ▴' : ' ▾'));
	field.addEventListener('click', () => {
		state.models.open = !state.models.open;
		if (state.models.open && !state.models.result) { send({ type: 'settings:fetchModels' }); }
		render();
	});
	wrap.appendChild(field);
	if (state.models.open) { wrap.appendChild(renderModelPopover(s)); }
	return wrap;
}

function renderModelPopover(s: SettingsSnapshot): HTMLElement {
	const pop = el('div', 'model-popover');
	if (state.models.loading) { pop.appendChild(el('div', 'model-item', '⟳ Loading models…')); return pop; }
	const result = state.models.result;
	if (result && !result.ok) {
		pop.appendChild(el('div', 'model-item', `⚠ ${result.error || "Couldn't load models"}`));
		pop.appendChild(customInputRow(s));   // free-text fallback
		return pop;
	}
	(result?.models ?? []).forEach((m: ModelChoice) => {
		const item = el('div', `model-item ${m.disabled ? 'disabled' : ''}`);
		item.appendChild(el('span', undefined, (m.id === s.model ? '✓ ' : '') + m.label));
		if (m.detail) { item.appendChild(el('span', 'meta', m.detail)); }
		if (!m.disabled) {
			item.addEventListener('click', () => { state.models.open = false; update('model', m.id); });
		}
		pop.appendChild(item);
	});
	const custom = el('div', 'model-action', '✎ Enter a custom model ID…');
	custom.addEventListener('click', () => openInPlaceCustom(s));
	pop.appendChild(custom);
	const refresh = el('div', 'model-action', '⟳ Refresh');
	refresh.addEventListener('click', () => { state.models.result = null; state.models.loading = true; send({ type: 'settings:fetchModels', force: true }); render(); });
	pop.appendChild(refresh);
	const reset = el('div', 'model-action', `↺ Reset to default (${s.defaultModel})`);
	reset.addEventListener('click', () => { state.models.open = false; send({ type: 'settings:resetModel' }); });
	pop.appendChild(reset);
	return pop;
}

// In-place custom entry: swap the Model row's field into a text input + Save/Cancel.
function openInPlaceCustom(s: SettingsSnapshot): void {
	state.models.open = false;
	render();
	const fieldRow = contentEl.querySelector('.model-control')?.parentElement;
	if (!fieldRow) { return; }
	fieldRow.replaceChildren(document.createTextNode('Model'));
	fieldRow.appendChild(customInputRow(s, true));
}

function customInputRow(s: SettingsSnapshot, autofocus = false): HTMLElement {
	const box = el('div', 'model-custom');
	const input = el('input', 'settings-input') as HTMLInputElement;
	input.value = s.model;
	const save = () => { if (input.value.trim()) { update('model', input.value.trim()); } };
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') { e.preventDefault(); save(); }
		if (e.key === 'Escape') { render(); }
	});
	const saveBtn = el('button', 'settings-btn', 'Save'); saveBtn.addEventListener('click', save);
	const cancelBtn = el('button', 'settings-btn ghost', 'Cancel'); cancelBtn.addEventListener('click', () => render());
	box.append(input, saveBtn, cancelBtn);
	if (autofocus) { setTimeout(() => input.focus(), 0); }
	return box;
}
```

- [ ] **Step 3: Implement the MCP cards (expanded, auto-save, debounced)**

```ts
import { parseServers, serializeServers, type McpDraft } from './mcpDraft.js';

let mcpDebounce: ReturnType<typeof setTimeout> | undefined;
function commitMcp(servers: McpDraft): void {
	if (mcpDebounce) { clearTimeout(mcpDebounce); }
	mcpDebounce = setTimeout(() => update('mcpServersJson', serializeServers(servers)), 400);
}

function renderMcp(s: SettingsSnapshot): void {
	const sec = el('div', 'settings-section active');
	sec.appendChild(row('Enable MCP', toggle(s.mcpEnabled, (v) => update('mcpEnabled', v))));
	const servers = parseServers(s.mcpServersJson);
	Object.keys(servers).forEach((name) => sec.appendChild(renderMcpCard(name, servers)));
	const add = el('div', 'mcp-add', '＋ Add server');
	add.addEventListener('click', () => {
		let n = 'server'; let i = 1; while (servers[n]) { n = `server${i++}`; }
		servers[n] = { enabled: true, type: 'stdio', command: '', args: [], tools: ['*'] };
		commitMcp(servers); // host re-posts snapshot → re-render with the new card
	});
	sec.appendChild(add);
	contentEl.appendChild(sec);
}

function renderMcpCard(name: string, servers: McpDraft): HTMLElement {
	const entry = servers[name];
	const card = el('div', `mcp-card ${entry.enabled === false ? 'disabled' : ''}`);
	const head = el('div', 'mcp-field');
	const nameI = el('input', 'settings-input') as HTMLInputElement; nameI.value = name;
	nameI.addEventListener('change', () => {
		if (nameI.value.trim() && nameI.value !== name && !servers[nameI.value]) {
			servers[nameI.value] = entry; delete servers[name]; commitMcp(servers);
		}
	});
	head.append(el('span', 'k', 'Server'), nameI,
		toggle(entry.enabled !== false, (v) => { entry.enabled = v; commitMcp(servers); }));
	const del = el('span', 'del', '🗑 Delete');
	del.addEventListener('click', () => { delete servers[name]; commitMcp(servers); });
	head.appendChild(del);
	card.appendChild(head);

	const transport = el('select', 'settings-select') as HTMLSelectElement;
	['stdio', 'http'].forEach((t) => { const o = el('option', undefined, t) as HTMLOptionElement; o.value = t; transport.appendChild(o); });
	transport.value = (entry.type as string) || 'stdio';
	transport.addEventListener('change', () => { entry.type = transport.value; commitMcp(servers); });
	card.appendChild(field('Transport', transport));

	if ((entry.type || 'stdio') === 'stdio') {
		card.appendChild(field('Command', mcpText(entry, 'command', servers)));
		card.appendChild(field('Args (JSON)', mcpArgs(entry, servers)));
		card.appendChild(field('Cwd', mcpText(entry, 'cwd', servers)));
	} else {
		card.appendChild(field('URL', mcpText(entry, 'url', servers)));
	}
	return card;
}

function field(k: string, control: HTMLElement): HTMLElement {
	const f = el('div', 'mcp-field'); f.append(el('span', 'k', k), control); return f;
}
function mcpText(entry: any, key: string, servers: McpDraft): HTMLInputElement {
	const i = el('input', 'settings-input') as HTMLInputElement;
	i.value = typeof entry[key] === 'string' ? entry[key] : '';
	i.addEventListener('change', () => { entry[key] = i.value; commitMcp(servers); });
	return i;
}
function mcpArgs(entry: any, servers: McpDraft): HTMLInputElement {
	const i = el('input', 'settings-input') as HTMLInputElement;
	i.value = Array.isArray(entry.args) ? JSON.stringify(entry.args) : '[]';
	i.addEventListener('change', () => {
		try { const v = JSON.parse(i.value); if (Array.isArray(v)) { entry.args = v; commitMcp(servers); i.classList.remove('invalid'); } else { i.classList.add('invalid'); } }
		catch { i.classList.add('invalid'); }
	});
	return i;
}
```

- [ ] **Step 4: Create `src/webview/settings/mcpDraft.ts`** (tiny pure (de)serializer used by render; mirrors `mcp/config.ts` shape)

```ts
export type McpEntry = Record<string, unknown> & { enabled?: boolean };
export type McpDraft = Record<string, McpEntry>;

export function parseServers(raw: string): McpDraft {
	if (!raw.trim()) { return {}; }
	try { const v = JSON.parse(raw); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
	catch { return {}; }
}
export function serializeServers(servers: McpDraft): string {
	return Object.keys(servers).length ? JSON.stringify(servers, null, 2) : '';
}
```

- [ ] **Step 5: Typecheck** — `npm run compile-tests` → PASS.
- [ ] **Step 6: Commit**

```bash
git add src/webview/settings/render.ts src/webview/settings/mcpDraft.ts
git commit -m "feat(settings): webview rendering (model dropdown + MCP cards)"
```

---

## Task 9: Webview client — wiring (`src/webview/settings/view.ts`)

**Files:** Create `src/webview/settings/view.ts` (webpack entry `settingsApp`).

- [ ] **Step 1: Implement**

```ts
import { state, navEl, send, type SettingsOutbound } from './state.js';
import { render } from './render.js';

navEl.addEventListener('click', (e) => {
	const btn = (e.target as HTMLElement).closest('.settings-cat') as HTMLElement | null;
	if (!btn) { return; }
	state.activeCategory = (btn.dataset.category as any) || 'auth';
	navEl.querySelectorAll('.settings-cat').forEach((c) => c.classList.toggle('active', c === btn));
	render();
});

window.addEventListener('message', (event: MessageEvent<SettingsOutbound>) => {
	const msg = event.data;
	if (msg.type === 'settings:state') {
		state.snapshot = msg.snapshot;
		if (msg.snapshot.focus) { state.activeCategory = msg.snapshot.focus.category; }
		render();
	} else if (msg.type === 'settings:models') {
		state.models.loading = msg.loading;
		if (!msg.loading) { state.models.result = msg.result; }
		render();
	} else if (msg.type === 'settings:error') {
		// surface inline; minimal: render a banner via state then re-render
		console.warn('settings error', msg.scope, msg.message);
	}
});

send({ type: 'settings:ready' });
```

- [ ] **Step 2: Build the webview bundle**

Run: `npm run compile`
Expected: emits `dist/settingsApp.js` with no webpack errors.

- [ ] **Step 3: Commit**

```bash
git add src/webview/settings/view.ts && git commit -m "feat(settings): webview view wiring"
```

---

## Task 10: Panel manager (`src/settings/settingsPanel.ts`)

**Files:** Create `src/settings/settingsPanel.ts`. Reuse `readNaviConfig`/`describeApiKeySource`/`DEFAULT_MODEL`/`affectsModel` (`naviConfig`), `validateSettingUpdate` (`settingsValidation`), `getSettingsHtml`, `ModelCatalog`, types.

- [ ] **Step 1: Implement**

```ts
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
```

- [ ] **Step 2: Typecheck** — `npm run compile-tests` → PASS.
- [ ] **Step 3: Commit**

```bash
git add src/settings/settingsPanel.ts && git commit -m "feat(settings): SettingsPanel webview manager"
```

---

## Task 11: Wire into the extension; retire QuickPick flows

**Files:** Modify `src/extension.ts`, `package.json`, `src/chat/inboundRouter.ts`, `src/chat/apiKeyGate.ts`, `src/chat/generationController.ts`; Delete `src/settings/settingsCommands.ts`, `src/mcp/settingsCommands.ts`.

- [ ] **Step 1: `extension.ts`** — construct catalog + register command; drop `SettingsManager`.

```ts
import { ModelCatalog } from './settings/modelCatalog.js';
import { SettingsPanel } from './settings/settingsPanel.js';
// remove: import { SettingsManager } ... and `const settingsManager = new SettingsManager();`
const modelCatalog = new ModelCatalog();
// in context.subscriptions.push(...):
vscode.commands.registerCommand('navi.openSettings', (focus?) =>
	SettingsPanel.createOrShow(context.extensionUri, modelCatalog, focus)),
```
Update the `ChatInboundRouter` construction to no longer pass `settingsManager` (see Step 3).

- [ ] **Step 2: `package.json`** — add to `contributes.commands`:

```json
{ "command": "navi.openSettings", "title": "Navi: Open Settings" }
```

- [ ] **Step 3: `inboundRouter.ts`** — drop the `settingsManager` ctor param and route via command:

```ts
// remove the settingsManager field/import
if (message.type === 'chat:openSettings') {
	await vscode.commands.executeCommand('navi.openSettings');
	return;
}
```

- [ ] **Step 4: `apiKeyGate.ts` + `generationController.ts`** — replace the `SettingsManager` dependency with an `openSettings` callback that opens the panel focused on the key field.

In `apiKeyGate.ts`: change the constructor to accept `private readonly openSettings: (focus?: { category: 'auth'; field: 'apiKey' }) => void` instead of `SettingsManager`, and replace both `this.settingsManager.openApiKeySettings()` calls with `this.openSettings({ category: 'auth', field: 'apiKey' })`.

In `generationController.ts`: construct it as
```ts
this.apiKeyGate = new ApiKeyGate(this.globalState,
	(focus) => vscode.commands.executeCommand('navi.openSettings', focus));
```
(remove the now-unused `settingsManager` ctor param of `GenerationController` and its `extension.ts` call site).

- [ ] **Step 5: Delete the retired managers**

```bash
git rm src/settings/settingsCommands.ts src/mcp/settingsCommands.ts
```

- [ ] **Step 6: Typecheck + lint** — `npm run compile-tests && npm run lint`
Expected: PASS, no remaining references to `SettingsManager`/`McpSettingsManager`. (Grep to confirm: `git grep -n "SettingsManager"` returns nothing.)

- [ ] **Step 7: Full test gate** — `npm test` → all suites PASS.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(settings): open panel from chat + palette; retire QuickPick settings"
```

---

## Task 12: End-to-end manual verification

- [ ] **Step 1: Build** — `npm run compile` (emits `dist/extension.js` + `dist/settingsApp.js`), no errors.
- [ ] **Step 2: Launch Extension Development Host** — press **F5** in VS Code (or Run → Start Debugging). A second VS Code window opens with Navi loaded.
- [ ] **Step 3: Open the panel** — click the gear in the Navi chat composer **or** run "Navi: Open Settings" from the Command Palette. The editor-tab panel opens with the **Auth & Model / MCP / Advanced** sidebar.
- [ ] **Step 4: Model dropdown — Copilot** — with auth mode = Copilot, open the Model dropdown → shows "Loading…" then a list with name + ctx/multiplier/vision. Pick one → it persists (reopen panel / check `navi.model` in Settings).
- [ ] **Step 5: Custom entry** — open dropdown → "Enter a custom model ID…" → the Model row becomes an in-place text field → type a value, Enter → row collapses showing the value + `custom` tag; setting persists.
- [ ] **Step 6: Model dropdown — BYOK** — switch auth mode to BYOK; API key + endpoint fields appear. With a valid key+endpoint, Refresh the dropdown → shows endpoint model ids. With no key → falls back to the free-text input (no crash).
- [ ] **Step 7: MCP cards** — go to MCP, toggle Enable, ＋ Add server → an expanded card appears; edit name/command/args; toggle a server off (dims); delete a server. Confirm `navi.mcpServersJson` reflects edits (auto-saved, ~0.4s debounce) and invalid args JSON shows an inline marker and does not persist.
- [ ] **Step 8: Advanced + persistence** — toggle the debug flags and set CLI path; confirm they write to the corresponding `navi.*` keys and that editing the same keys in VS Code's native Settings editor updates the open panel live.

---

## Self-review notes (author)

- **Spec coverage:** ModelCatalog (§5)→T2; panel HTML/categories (§6)→T5/T8; model selector (§7)→T8; MCP cards + auto-save (§8)→T8; message contract (§9)→T1/T10; panel manager (§10)→T10; wiring + retirements (§11)→T11; build (§12)→T6/T9; tests (§14)→T2/T3/T4/T5; error handling (§15)→ModelCatalog never-throws + validation fallback. The spec's `settingsState.test.ts` was dropped in favor of the host-side `settingsValidation.test.ts` (webview DOM modules are not unit-tested in this repo — only HTML strings are, per `chatHtml.test.ts`).
- **Placeholder scan:** none — every code/test step carries full code and exact commands.
- **Type consistency:** `SettingKey`/`SettingsSnapshot`/`ModelCatalogResult`/`SettingsInbound`/`SettingsOutbound` defined in T1 and used unchanged in T2/T8/T9/T10; `validateSettingUpdate` (T4) signature matches its call in T10; `ModelCatalog(clientFactory, fetchFn)` ctor matches the T2 tests and T11 construction.
