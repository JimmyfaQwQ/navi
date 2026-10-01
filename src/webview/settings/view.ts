import { state, navEl, send, type SettingsOutbound } from './state.js';
import { render } from './render.js';

navEl.addEventListener('click', (e) => {
	const btn = (e.target as HTMLElement).closest('.settings-cat') as HTMLElement | null;
	if (!btn) { return; }
	state.activeCategory = (btn.dataset.category as any) || 'auth';
	state.models.open = false;
	render();
});

window.addEventListener('message', (event: MessageEvent<SettingsOutbound>) => {
	const msg = event.data;
	if (msg.type === 'settings:state') {
		state.snapshot = msg.snapshot;
		state.error = '';
		if (msg.snapshot.focus) { state.activeCategory = msg.snapshot.focus.category; }
		render();
	} else if (msg.type === 'settings:models') {
		state.models.loading = msg.loading;
		if (!msg.loading) { state.models.result = msg.result; }
		render();
	} else if (msg.type === 'settings:error') {
		state.error = msg.message;
		render();
	}
});

send({ type: 'settings:ready' });

// Close the model picker on outside click or Escape.
document.addEventListener('mousedown', (e) => {
	if (state.models.open && !(e.target as HTMLElement).closest('.model-control')) {
		state.models.open = false;
		render();
	}
});
document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape' && state.models.open) {
		state.models.open = false;
		render();
	}
});
