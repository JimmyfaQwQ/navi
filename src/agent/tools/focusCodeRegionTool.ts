import * as path from 'path';
import type { ChatFocusTarget } from '../../types/chat';
import type { NaviTool } from '../naviTool';
import { errorResult, parseInput, successResult } from './_shared.js';
import { fileExists, getWorkspaceRoot } from './editorGateway.js';

/** Regions longer than this get a nudge back to the agent to narrow them. */
export const WIDE_REGION_LINES = 15;

export type FocusCodeRegionInput = {
	path?: string;
	startLine?: number;
	endLine?: number;
	title?: string;
	instruction?: string;
};

type FocusCodeRegionDeps = {
	getCurrentSessionId: () => string;
	focusRegion: (sessionId: string, input: FocusCodeRegionInput) => Promise<ChatFocusTarget>;
	resolveWorkspaceRoot?: () => string | undefined;
};

export function createFocusCodeRegionTool(deps: FocusCodeRegionDeps): NaviTool {
	const resolveWorkspaceRoot = deps.resolveWorkspaceRoot ?? getWorkspaceRoot;
	return {
		name: 'focus_user_code_region',
		description:
			'Highlight the exact lines the user should edit next and reveal them in the editor. ' +
				'Cover only the lines that change, usually 1-10; for new code, cover the line(s) where it goes. ' +
				'Use one region per edit site, even within the same function, instead of one region around the whole function. ' +
				'Put context (which function, why) in title and instruction, not in the highlighted range. ' +
				'Input JSON: {"path":"src/file.ts","startLine":42,"endLine":44,"title":"Clamp texture coordinates","instruction":"Clamp tx and ty to the texture bounds before get_pixel"}.',
		func: async (rawInput: string) => {
			const workspaceRoot = resolveWorkspaceRoot();
			if (!workspaceRoot) {
				return errorResult('No workspace folder is open.');
			}

			const input = parseInput<FocusCodeRegionInput>(rawInput, (text) => ({ path: text }));
			if (!input.path || !input.path.trim()) {
				return errorResult('Missing required field: path.');
			}

			const normalizedPath = normalizePath(input.path);
			const targetPath = resolvePathInsideWorkspace(workspaceRoot, normalizedPath);
			if (!targetPath) {
				return errorResult('Path is outside the workspace.');
			}

			const exists = await fileExists(targetPath);
			if (!exists) {
				return errorResult('File not found.');
			}

			const sessionId = deps.getCurrentSessionId();
			const focused = await deps.focusRegion(sessionId, {
				...input,
				path: normalizedPath
			});

			const lineCount = focused.endLine - focused.startLine + 1;
			return successResult({
				sessionId,
				focusTarget: focused,
				...(lineCount > WIDE_REGION_LINES
					? {
						note:
							`This region spans ${lineCount} lines. If the user edits only part of it, clear it ` +
							'and create narrower regions around the lines that actually change.'
					}
					: {})
			});
		}
	};
}

function resolvePathInsideWorkspace(workspaceRoot: string, requestedPath: string): string | undefined {
	const target = path.resolve(workspaceRoot, requestedPath);
	const relative = path.relative(workspaceRoot, target);
	if (relative.startsWith('..') || path.isAbsolute(relative)) {
		return undefined;
	}
	return target;
}

function normalizePath(inputPath: string): string {
	return inputPath.trim().replace(/\\/g, '/');
}
