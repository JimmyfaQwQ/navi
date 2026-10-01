import * as assert from 'assert';
import { SYSTEM_PROMPT, loadPrompt, withWorkingDirectory } from '../prompts/index.js';
import { DELEGATE_AGENTS, EXCLUDED_BUILTIN_AGENTS } from '../agent/agents/builtinAgents.js';
import { TOOL_NAMES } from '../agent/tools/names.js';
import type { ChatFocusTarget } from '../types/chat';

function target(overrides: Partial<ChatFocusTarget> = {}): ChatFocusTarget {
	return {
		id: 'focus-1',
		sessionId: 'thread-1',
		path: 'src/a.ts',
		startLine: 10,
		endLine: 20,
		title: 'Guard empty input',
		instruction: 'Return early when input is empty.',
		updatedAt: 0,
		...overrides
	};
}

suite('prompts', () => {
	test('system prompt references every Navi tool by its registered name', () => {
		assert.strictEqual(loadPrompt('system'), SYSTEM_PROMPT);
		for (const toolName of Object.values(TOOL_NAMES)) {
			assert.ok(SYSTEM_PROMPT.includes(`\`${toolName}\``), `system prompt should reference ${toolName}`);
		}
	});

	test('system prompt only delegates to agents the session allows', () => {
		for (const agentName of Object.values(DELEGATE_AGENTS)) {
			assert.ok(SYSTEM_PROMPT.includes(`\`${agentName}\``), `system prompt should name ${agentName}`);
		}
		for (const excluded of EXCLUDED_BUILTIN_AGENTS) {
			assert.ok(!SYSTEM_PROMPT.includes(`\`${excluded}\``), `system prompt should not name excluded agent ${excluded}`);
		}
		// Retired agents must not linger in the prompt.
		for (const retired of ['code_explorer', 'planning_agent', 'critic']) {
			assert.ok(!SYSTEM_PROMPT.includes(retired), `system prompt should not mention ${retired}`);
		}
	});

	test('withWorkingDirectory injects the cwd and is a no-op without one', () => {
		const withCwd = withWorkingDirectory('SYSTEM BODY', 'E:/navi');
		assert.ok(withCwd.startsWith('SYSTEM BODY'));
		assert.ok(withCwd.includes('E:/navi'));
		assert.match(withCwd, /Shell: /);
		assert.strictEqual(withWorkingDirectory('SYSTEM BODY', undefined), 'SYSTEM BODY');
	});

	test('focus-action prompts carry region ids and locations', () => {
		const targets = [target(), target({ id: 'focus-2', path: 'src/b.ts', startLine: 3, endLine: 4, title: '', instruction: '' })];

		const review = loadPrompt('focusAction', { targets, action: 'review' });
		assert.strictEqual(review.preview, 'Review my work in 2 focus regions');
		assert.match(review.prompt, /\[focus-1\] src\/a\.ts:10-20/);
		assert.match(review.prompt, /\[focus-2\] src\/b\.ts:3-4/);
		assert.match(review.prompt, /Instruction: Return early when input is empty\./);
		// Empty title / instruction lines are omitted rather than printed as "None".
		assert.ok(!review.prompt.includes('None'));

		const help = loadPrompt('focusAction', { targets: [target()], action: 'help' });
		assert.strictEqual(help.preview, 'Help me with 1 focus region');
		assert.match(help.prompt, /\[focus-1\] src\/a\.ts:10-20/);
	});

	test('button messages identify their origin so they do not switch the reply language', () => {
		const review = loadPrompt('focusAction', { targets: [target()], action: 'review' });
		const help = loadPrompt('focusAction', { targets: [target()], action: 'help' });
		assert.match(review.prompt, /Sent from the Focus panel's Review button/);
		assert.match(help.prompt, /Sent from the Focus panel's Help button/);
		assert.match(SYSTEM_PROMPT, /sent from the Focus panel/);
	});
});
