import { state, send, contentEl, navEl, type SettingsSnapshot, type ModelChoice } from './state.js';
import { parseServers, serializeServers, type McpDraft } from './mcpDraft.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag: string, cls?: string, text?: string): HTMLElement {
	const e = document.createElement(tag);
	if (cls) { e.className = cls; }
	if (text !== undefined) { e.textContent = text; }
	return e;
}

function icon(paths: string[], cls = 'navi-icon'): SVGSVGElement {
	const svg = document.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('class', cls);
	svg.setAttribute('viewBox', '0 0 16 16');
	svg.setAttribute('fill', 'none');
	svg.setAttribute('aria-hidden', 'true');
	paths.forEach((d) => {
		const p = document.createElementNS(SVG_NS, 'path');
		p.setAttribute('d', d);
		p.setAttribute('stroke', 'currentColor');
		p.setAttribute('stroke-width', '1.3');
		p.setAttribute('stroke-linecap', 'round');
		p.setAttribute('stroke-linejoin', 'round');
		svg.appendChild(p);
	});
	return svg;
}
const ICON_CHEVRON = ['M4.5 6.5L8 10l3.5-3.5'];
const ICON_CHECK = ['M3.5 8.5l3 3 6-7'];
const ICON_TRASH = ['M3.5 4.5h9', 'M6.5 4.5V3h3v1.5', 'M5 4.5l.5 8h5l.5-8'];
const ICON_PLUS = ['M8 3.5v9', 'M3.5 8h9'];

let idSeq = 0;
function nextId(prefix: string): string { idSeq += 1; return `${prefix}-${idSeq}`; }

// A settings row: label + optional description on the left, control on the right.
function row(labelText: string, control: HTMLElement, description?: string): HTMLElement {
	const r = el('div', 'settings-row');
	const text = el('div', 'settings-row-text');
	const id = nextId('ctl');
	const label = el('label', 'settings-row-label', labelText) as HTMLLabelElement;
	const focusable = control.matches('input, select, button') ? control : control.querySelector<HTMLElement>('input, select, button');
	if (focusable) {
		focusable.id = focusable.id || id;
		label.htmlFor = focusable.id;
	}
	text.appendChild(label);
	if (description) { text.appendChild(el('div', 'settings-row-desc', description)); }
	const ctl = el('div', 'settings-row-control');
	ctl.appendChild(control);
	r.append(text, ctl);
	return r;
}

function switchControl(value: boolean, onChange: (v: boolean) => void, label?: string): HTMLButtonElement {
	const b = el('button', 'navi-switch') as HTMLButtonElement;
	b.type = 'button';
	b.setAttribute('role', 'switch');
	b.setAttribute('aria-checked', String(value));
	if (label) { b.setAttribute('aria-label', label); }
	b.appendChild(el('span', 'navi-switch-thumb'));
	b.addEventListener('click', () => onChange(!value));
	return b;
}

function textInput(value: string, onCommit: (v: string) => void, opts: { password?: boolean; placeholder?: string } = {}): HTMLInputElement {
	const i = el('input', 'settings-input') as HTMLInputElement;
	i.type = opts.password ? 'password' : 'text';
	i.value = value;
	i.spellcheck = false;
	if (opts.placeholder) { i.placeholder = opts.placeholder; }
	i.addEventListener('change', () => onCommit(i.value));
	return i;
}

function sectionHeader(title: string, description: string): HTMLElement {
	const h = el('header', 'settings-section-header');
	h.append(el('h1', 'settings-section-title', title), el('p', 'settings-section-desc', description));
	return h;
}

function group(title?: string): HTMLElement {
	const g = el('section', 'settings-group');
	if (title) { g.appendChild(el('h2', 'settings-group-title', title)); }
	return g;
}

// --- top-level render dispatch ---
export function render(): void {
	navEl.querySelectorAll<HTMLElement>('.settings-cat').forEach((c) => {
		const active = c.dataset.category === state.activeCategory;
		c.classList.toggle('active', active);
		if (active) { c.setAttribute('aria-current', 'page'); } else { c.removeAttribute('aria-current'); }
	});
	contentEl.replaceChildren();
	const inner = el('div', 'settings-inner');
	contentEl.appendChild(inner);
	if (state.error) {
		const banner = el('div', 'settings-banner');
		banner.setAttribute('role', 'alert');
		banner.appendChild(el('span', undefined, state.error));
		const dismiss = el('button', 'navi-btn ghost', 'Dismiss') as HTMLButtonElement;
		dismiss.type = 'button';
		dismiss.addEventListener('click', () => { state.error = ''; render(); });
		banner.appendChild(dismiss);
		inner.appendChild(banner);
	}
	if (!state.snapshot) { inner.appendChild(el('p', 'settings-loading', 'Loading settings…')); return; }
	if (state.activeCategory === 'auth') { renderAuth(inner, state.snapshot); }
	else if (state.activeCategory === 'mcp') { renderMcp(inner, state.snapshot); }
	else { renderAdvanced(inner, state.snapshot); }
}

function update(key: string, value: string | boolean): void {
	send({ type: 'settings:update', key: key as any, value });
}

function renderAuth(root: HTMLElement, s: SettingsSnapshot): void {
	root.appendChild(sectionHeader('Auth & model', 'How Navi connects to a language model, and which model it uses.'));

	const conn = group();
	const seg = el('div', 'segmented');
	seg.setAttribute('role', 'radiogroup');
	seg.setAttribute('aria-label', 'Sign-in method');
	(['copilot', 'byok'] as const).forEach((mode) => {
		const active = s.authMode === mode;
		const b = el('button', `seg${active ? ' active' : ''}`, mode === 'copilot' ? 'GitHub Copilot' : 'Own API key') as HTMLButtonElement;
		b.type = 'button';
		b.setAttribute('role', 'radio');
		b.setAttribute('aria-checked', String(active));
		b.addEventListener('click', () => { if (!active) { update('authMode', mode); } });
		seg.appendChild(b);
	});
	conn.appendChild(row('Sign in with', seg, s.authMode === 'copilot'
		? 'Uses your GitHub Copilot subscription.'
		: 'Connects to any OpenAI-compatible endpoint.'));

	if (s.authMode === 'byok') {
		conn.appendChild(row('API key', textInput(s.apiKeyConfigured ? '********' : '',
			(v) => update('apiKey', v), { password: true, placeholder: 'sk-…' }), s.apiKeySource));
		conn.appendChild(row('API endpoint', textInput(s.apiBaseUrl, (v) => update('apiBaseUrl', v),
			{ placeholder: 'https://api.openai.com/v1' }), 'Base URL of the OpenAI-compatible API.'));
	}
	conn.appendChild(row('Model', renderModelControl(s), `The default is ${s.defaultModel}.`));
	conn.appendChild(row('Stream replies', switchControl(s.streaming, (v) => update('streaming', v)),
		'Show replies as they are written instead of all at once.'));
	root.appendChild(conn);
}

function renderAdvanced(root: HTMLElement, s: SettingsSnapshot): void {
	root.appendChild(sectionHeader('Advanced', 'Troubleshooting options. You usually don\'t need to change these.'));
	const cli = group('Copilot CLI');
	cli.appendChild(row('CLI path', textInput(s.copilotCliPath, (v) => update('copilotCliPath', v), { placeholder: 'Detected automatically' }),
		'Set this only if Navi can\'t find the Copilot CLI on its own.'));
	root.appendChild(cli);

	const debug = group('Debug logging');
	debug.appendChild(row('Log CLI launch arguments', switchControl(s.debugCopilotCliArgs, (v) => update('debugCopilotCliArgs', v)),
		'Writes the full launch command to the “Navi Copilot CLI” output channel.'));
	debug.appendChild(row('Log agent reply flow', switchControl(s.debugAgentReplyFlow, (v) => update('debugAgentReplyFlow', v)),
		'Writes session events, tool calls and errors to the “Navi Agent Flow” output channel.'));
	debug.appendChild(row('Open the log automatically', switchControl(s.debugAgentReplyFlowReveal, (v) => update('debugAgentReplyFlowReveal', v)),
		'Brings the “Navi Agent Flow” channel forward whenever it gets a new entry.'));
	root.appendChild(debug);
}

function renderModelControl(s: SettingsSnapshot): HTMLElement {
	const wrap = el('div', 'model-control');
	const inList = state.models.result?.models.some((m) => m.id === s.model) ?? false;
	const current = state.models.result?.models.find((m) => m.id === s.model);
	const field = el('button', 'settings-input model-field') as HTMLButtonElement;
	field.type = 'button';
	field.setAttribute('aria-haspopup', 'listbox');
	field.setAttribute('aria-expanded', String(state.models.open));
	field.appendChild(el('span', 'model-field-value', current?.label || s.model));
	if (!inList && state.models.result) { field.appendChild(el('span', 'tag', 'custom')); }
	field.appendChild(icon(ICON_CHEVRON, 'model-field-chevron'));
	field.addEventListener('click', () => {
		state.models.open = !state.models.open;
		if (state.models.open && !state.models.result) { send({ type: 'settings:fetchModels' }); }
		render();
	});
	wrap.appendChild(field);
	if (state.models.open) { wrap.appendChild(renderModelPopover(s)); }
	return wrap;
}

function popoverAction(text: string, onClick: () => void): HTMLElement {
	const b = el('button', 'model-action', text) as HTMLButtonElement;
	b.type = 'button';
	b.addEventListener('click', onClick);
	return b;
}

function renderModelPopover(s: SettingsSnapshot): HTMLElement {
	const pop = el('div', 'model-popover');
	if (state.models.loading) { pop.appendChild(el('div', 'model-status', 'Loading models…')); return pop; }
	const result = state.models.result;
	if (result && !result.ok) {
		pop.appendChild(el('div', 'model-status error', result.error || 'Couldn\'t load the model list.'));
		pop.appendChild(customInputRow(s));   // free-text fallback
		return pop;
	}
	const list = el('div', 'model-list');
	list.setAttribute('role', 'listbox');
	(result?.models ?? []).forEach((m: ModelChoice) => {
		const selected = m.id === s.model;
		const item = el('button', `model-item${m.disabled ? ' disabled' : ''}${selected ? ' selected' : ''}`) as HTMLButtonElement;
		item.type = 'button';
		item.setAttribute('role', 'option');
		item.setAttribute('aria-selected', String(selected));
		item.disabled = !!m.disabled;
		const check = el('span', 'model-item-check');
		if (selected) { check.appendChild(icon(ICON_CHECK)); }
		item.append(check, el('span', 'model-item-label', m.label));
		if (m.detail) { item.appendChild(el('span', 'meta', m.detail)); }
		if (!m.disabled) {
			item.addEventListener('click', () => { state.models.open = false; update('model', m.id); });
		}
		list.appendChild(item);
	});
	pop.appendChild(list);
	const actions = el('div', 'model-actions');
	actions.append(
		popoverAction('Use a custom model ID…', () => openInPlaceCustom(s)),
		popoverAction('Refresh list', () => { state.models.result = null; state.models.loading = true; send({ type: 'settings:fetchModels', force: true }); render(); }),
		popoverAction(`Reset to default (${s.defaultModel})`, () => { state.models.open = false; send({ type: 'settings:resetModel' }); })
	);
	pop.appendChild(actions);
	return pop;
}

// In-place custom entry: swap the model picker for a text input + Save/Cancel.
function openInPlaceCustom(s: SettingsSnapshot): void {
	state.models.open = false;
	render();
	const control = contentEl.querySelector('.model-control')?.parentElement;
	if (!control) { return; }
	control.replaceChildren(customInputRow(s, true));
}

function customInputRow(s: SettingsSnapshot, autofocus = false): HTMLElement {
	const box = el('div', 'model-custom');
	const input = el('input', 'settings-input') as HTMLInputElement;
	input.value = s.model;
	input.spellcheck = false;
	input.setAttribute('aria-label', 'Custom model ID');
	const save = () => { if (input.value.trim()) { update('model', input.value.trim()); } };
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') { e.preventDefault(); save(); }
		if (e.key === 'Escape') { render(); }
	});
	const saveBtn = el('button', 'navi-btn', 'Save') as HTMLButtonElement;
	saveBtn.type = 'button';
	saveBtn.addEventListener('click', save);
	const cancelBtn = el('button', 'navi-btn ghost', 'Cancel') as HTMLButtonElement;
	cancelBtn.type = 'button';
	cancelBtn.addEventListener('click', () => render());
	box.append(input, saveBtn, cancelBtn);
	if (autofocus) { setTimeout(() => input.focus(), 0); }
	return box;
}

let mcpDebounce: ReturnType<typeof setTimeout> | undefined;
function commitMcp(servers: McpDraft): void {
	if (mcpDebounce) { clearTimeout(mcpDebounce); }
	mcpDebounce = setTimeout(() => update('mcpServersJson', serializeServers(servers)), 400);
}

function renderMcp(root: HTMLElement, s: SettingsSnapshot): void {
	root.appendChild(sectionHeader('MCP servers', 'Give Navi extra tools by connecting Model Context Protocol servers.'));
	const top = group();
	top.appendChild(row('Use MCP servers', switchControl(s.mcpEnabled, (v) => update('mcpEnabled', v)),
		'Load tools from the servers below when a chat starts.'));
	root.appendChild(top);

	const servers = parseServers(s.mcpServersJson);
	const names = Object.keys(servers);
	const list = group(names.length ? `Servers (${names.length})` : 'Servers');
	list.classList.add('mcp-list');
	if (!s.mcpEnabled) { list.classList.add('muted'); }
	if (names.length === 0) {
		list.appendChild(el('p', 'mcp-empty', 'No servers yet. Add one to give Navi more tools.'));
	}
	names.forEach((name) => list.appendChild(renderMcpCard(name, servers)));
	const add = el('button', 'mcp-add') as HTMLButtonElement;
	add.type = 'button';
	add.append(icon(ICON_PLUS), el('span', undefined, 'Add server'));
	add.addEventListener('click', () => {
		let n = 'server'; let i = 1; while (servers[n]) { n = `server${i++}`; }
		servers[n] = { enabled: true, type: 'stdio', command: '', args: [], tools: ['*'] };
		commitMcp(servers); // host re-posts snapshot → re-render with the new card
	});
	list.appendChild(add);
	root.appendChild(list);
}

function renderMcpCard(name: string, servers: McpDraft): HTMLElement {
	const entry = servers[name];
	const enabled = entry.enabled !== false;
	const card = el('div', `mcp-card${enabled ? '' : ' disabled'}`);

	const head = el('div', 'mcp-card-head');
	const nameI = el('input', 'mcp-name') as HTMLInputElement;
	nameI.value = name;
	nameI.spellcheck = false;
	nameI.setAttribute('aria-label', 'Server name');
	nameI.addEventListener('change', () => {
		if (nameI.value.trim() && nameI.value !== name && !servers[nameI.value]) {
			servers[nameI.value] = entry; delete servers[name]; commitMcp(servers);
		}
	});
	const spacer = el('span', 'mcp-card-spacer');
	const sw = switchControl(enabled, (v) => { entry.enabled = v; commitMcp(servers); }, `Enable ${name}`);
	const del = el('button', 'navi-icon-btn mcp-delete') as HTMLButtonElement;
	del.type = 'button';
	del.title = 'Delete server';
	del.setAttribute('aria-label', `Delete ${name}`);
	del.appendChild(icon(ICON_TRASH));
	del.addEventListener('click', () => { delete servers[name]; commitMcp(servers); });
	head.append(nameI, spacer, sw, del);
	card.appendChild(head);

	const body = el('div', 'mcp-card-body');
	const transport = el('select', 'settings-select') as HTMLSelectElement;
	[['stdio', 'Local process (stdio)'], ['http', 'Remote (HTTP)']].forEach(([value, label]) => {
		const o = el('option', undefined, label) as HTMLOptionElement; o.value = value; transport.appendChild(o);
	});
	transport.value = (entry.type as string) || 'stdio';
	transport.addEventListener('change', () => { entry.type = transport.value; commitMcp(servers); });
	body.appendChild(field('Transport', transport));

	if ((entry.type || 'stdio') === 'stdio') {
		body.appendChild(field('Command', mcpText(entry, 'command', servers, 'npx')));
		body.appendChild(field('Arguments', mcpArgs(entry, servers), 'JSON array'));
		body.appendChild(field('Working directory', mcpText(entry, 'cwd', servers, 'Workspace root')));
	} else {
		body.appendChild(field('URL', mcpText(entry, 'url', servers, 'https://')));
	}
	card.appendChild(body);
	return card;
}

function field(k: string, control: HTMLElement, hint?: string): HTMLElement {
	const f = el('div', 'mcp-field');
	const id = nextId('mcp');
	control.id = id;
	const label = el('label', 'k', k) as HTMLLabelElement;
	label.htmlFor = id;
	f.append(label, control);
	if (hint) { f.appendChild(el('span', 'mcp-hint', hint)); }
	return f;
}
function mcpText(entry: any, key: string, servers: McpDraft, placeholder?: string): HTMLInputElement {
	const i = el('input', 'settings-input') as HTMLInputElement;
	i.value = typeof entry[key] === 'string' ? entry[key] : '';
	i.spellcheck = false;
	if (placeholder) { i.placeholder = placeholder; }
	i.addEventListener('change', () => { entry[key] = i.value; commitMcp(servers); });
	return i;
}
function mcpArgs(entry: any, servers: McpDraft): HTMLInputElement {
	const i = el('input', 'settings-input mono') as HTMLInputElement;
	i.value = Array.isArray(entry.args) ? JSON.stringify(entry.args) : '[]';
	i.spellcheck = false;
	i.addEventListener('change', () => {
		try {
			const v = JSON.parse(i.value);
			if (Array.isArray(v)) { entry.args = v; commitMcp(servers); i.classList.remove('invalid'); i.removeAttribute('aria-invalid'); }
			else { i.classList.add('invalid'); i.setAttribute('aria-invalid', 'true'); }
		} catch { i.classList.add('invalid'); i.setAttribute('aria-invalid', 'true'); }
	});
	return i;
}
