import * as assert from 'assert';
import { parseMcpServerSettings, toEnabledMcpConnections } from '../mcp/config.js';

suite('MCP config', () => {
	test('skips disabled servers and strips the enabled flag', () => {
		const servers = parseMcpServerSettings(JSON.stringify({
			math: { enabled: true, type: 'stdio', command: 'npx', args: ['-y', 'server-math'] },
			docs: { enabled: false, type: 'http', url: 'https://example.com/mcp' }
		}));
		const connections = toEnabledMcpConnections(servers);
		assert.deepStrictEqual(Object.keys(connections), ['math']);
		assert.ok(!('enabled' in connections.math));
	});

	test('maps the legacy cwd field to workingDirectory', () => {
		const connections = toEnabledMcpConnections(parseMcpServerSettings(JSON.stringify({
			legacy: { type: 'stdio', command: 'node', cwd: 'tools' },
			current: { type: 'stdio', command: 'node', cwd: 'old', workingDirectory: 'new' }
		})));
		const legacy = connections.legacy as unknown as Record<string, unknown>;
		const current = connections.current as unknown as Record<string, unknown>;
		assert.strictEqual(legacy.workingDirectory, 'tools');
		assert.ok(!('cwd' in legacy));
		assert.strictEqual(current.workingDirectory, 'new');
		assert.ok(!('cwd' in current));
	});
});
