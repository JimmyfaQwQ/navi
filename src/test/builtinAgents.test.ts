import * as assert from 'assert';
import {
	DELEGATE_AGENTS,
	EXCLUDED_BUILTIN_AGENTS,
	EXCLUDED_BUILTIN_TOOLS,
	delegateDisplayName,
	isReviewAgent
} from '../agent/agents/builtinAgents.js';

suite('built-in agent policy', () => {
	test('agents that can edit files are excluded, delegates are not', () => {
		for (const writer of ['task', 'general-purpose']) {
			assert.ok(EXCLUDED_BUILTIN_AGENTS.includes(writer), `${writer} should be excluded`);
		}
		for (const delegate of Object.values(DELEGATE_AGENTS)) {
			assert.ok(!EXCLUDED_BUILTIN_AGENTS.includes(delegate), `${delegate} should stay available`);
		}
	});

	test('the main agent cannot write files', () => {
		assert.deepStrictEqual(EXCLUDED_BUILTIN_TOOLS, ['create', 'edit', 'apply_patch']);
	});

	test('review delegates are classified as reviews', () => {
		assert.strictEqual(isReviewAgent('code-review'), true);
		assert.strictEqual(isReviewAgent('security-review'), true);
		assert.strictEqual(isReviewAgent('explore'), false);
		assert.strictEqual(isReviewAgent(undefined), false);
	});

	test('display name fallbacks', () => {
		assert.strictEqual(delegateDisplayName('explore'), 'Explore Agent');
		assert.strictEqual(delegateDisplayName('unknown'), undefined);
	});
});
