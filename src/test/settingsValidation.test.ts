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
