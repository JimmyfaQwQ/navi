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
