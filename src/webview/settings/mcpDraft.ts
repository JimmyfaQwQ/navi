export type McpEntry = Record<string, unknown> & { enabled?: boolean };
export type McpDraft = Record<string, McpEntry>;

export function parseServers(raw: string): McpDraft {
	if (!raw.trim()) { return {}; }
	try { const v = JSON.parse(raw); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
	catch { return {}; }
}
export function serializeServers(servers: McpDraft): string {
	return Object.keys(servers).length ? JSON.stringify(servers, null, 2) : '';
}
