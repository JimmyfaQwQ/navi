import type { ChatFocusTarget } from '../types/chat';
import { SYSTEM_PROMPT, buildFocusActionPrompt, type FocusAction } from './main.js';

export { SYSTEM_PROMPT, buildFocusActionPrompt } from './main.js';
export type { FocusAction } from './main.js';
export { SECTION_RULE, composeSections, withWorkingDirectory } from './fragments.js';

export type FocusActionContext = { targets: ChatFocusTarget[]; action: FocusAction };

/** Single entry point for loading prompts. */
export function loadPrompt(id: 'system'): string;
export function loadPrompt(id: 'focusAction', ctx: FocusActionContext): { preview: string; prompt: string };
export function loadPrompt(
	id: 'system' | 'focusAction',
	ctx?: FocusActionContext
): string | { preview: string; prompt: string } {
	if (id === 'system') {
		return SYSTEM_PROMPT;
	}
	if (!ctx) {
		throw new Error('loadPrompt("focusAction") requires a focus-action context.');
	}
	return buildFocusActionPrompt(ctx.targets, ctx.action);
}
