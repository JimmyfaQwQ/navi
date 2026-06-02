import { state, send, contentEl, type SettingsSnapshot, type ModelChoice } from './state.js';
import type { ModelCatalogResult } from './state.js';
import { parseServers, serializeServers, type McpDraft } from './mcpDraft.js';

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
