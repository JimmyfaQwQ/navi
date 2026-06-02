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
