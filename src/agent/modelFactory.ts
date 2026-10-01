import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { CopilotClient, RuntimeConnection } from '@github/copilot-sdk';
import type { CopilotClientOptions, SessionConfig } from '@github/copilot-sdk';
import {
	resolveApiKey,
	resolveAuthMode,
	resolveBaseUrl,
	resolveCopilotCliPath,
	resolveDebugCopilotCliArgs
} from '../settings/naviConfig.js';

const cliDebugOutput = vscode.window.createOutputChannel('Navi Copilot CLI');
let hasShownCliPathWarning = false;

/**
 * Create a {@link CopilotClient}.
 *
 * The SDK launches its bundled runtime (`@github/copilot-sdk-<platform>`) by
 * default. `navi.copilotCliPath` overrides it with an explicit executable.
 *
 * - **copilot** mode: `useLoggedInUser` + optional `gitHubToken`
 *   obtained from `vscode.authentication`.
 * - **byok** mode: `useLoggedInUser: false`; BYOK credentials are
 *   passed at session-creation time via {@link resolveProvider}.
 */
export async function createCopilotClient(
	config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('navi')
): Promise<CopilotClient> {
	const authMode = resolveAuthMode(config);
	const debugCliArgs = resolveDebugCopilotCliArgs(config);
	const cliPath = resolveConfiguredCliPath(config);

	const options: CopilotClientOptions = {
		connection: cliPath ? RuntimeConnection.forStdio({ path: cliPath }) : undefined,
		workingDirectory: getActiveWorkspaceRoot(),
		logLevel: 'error'
	};

	if (authMode === 'copilot') {
		const gitHubToken = await acquireGitHubToken();
		options.gitHubToken = gitHubToken;
		options.useLoggedInUser = !gitHubToken;
	} else {
		// BYOK – no GitHub auth required
		options.useLoggedInUser = false;
	}

	const client = new CopilotClient(options);
	if (debugCliArgs) {
		logCopilotCliLaunch(options, cliPath);
	}
	return client;
}

/**
 * Returns the user-configured runtime path, or `undefined` to use the SDK's
 * bundled runtime. An invalid path is reported once and then ignored.
 */
function resolveConfiguredCliPath(config: vscode.WorkspaceConfiguration): string | undefined {
	const configured = resolveCopilotCliPath(config);
	if (!configured) {
		return undefined;
	}
	if (existsSync(configured)) {
		return configured;
	}
	cliDebugOutput.appendLine(`[resolve-cli] navi.copilotCliPath does not exist, using the bundled runtime instead: ${configured}`);
	if (!hasShownCliPathWarning) {
		hasShownCliPathWarning = true;
		void vscode.window.showWarningMessage(
			`Navi couldn't find the Copilot CLI at "${configured}", so it's using the bundled runtime. Clear navi.copilotCliPath or point it at an existing executable.`
		);
	}
	return undefined;
}

/**
 * Build the BYOK provider config for session creation.
 * Returns `undefined` in copilot mode (the SDK uses Copilot's own endpoint).
 */
export function resolveProvider(
	config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('navi')
): SessionConfig['provider'] | undefined {
	const authMode = resolveAuthMode(config);
	if (authMode === 'copilot') {
		return undefined;
	}

	const apiKey = resolveApiKey(config);
	if (!apiKey) {
		throw new Error('Missing API Key. Please configure navi.apiKey via Settings, or set the NAVI_API_KEY environment variable.');
	}

	return {
		type: 'openai',
		baseUrl: resolveBaseUrl(config),
		apiKey
	};
}

/**
 * Try to obtain a GitHub token via the VS Code authentication API.
 * Falls back to `GITHUB_TOKEN` env var.
 * Returns `undefined` when no token is available (the SDK will
 * fall back to `useLoggedInUser` / gh CLI auth).
 */
async function acquireGitHubToken(): Promise<string | undefined> {
	try {
		const session = await vscode.authentication.getSession('github', ['read:user'], {
			createIfNone: false,
			silent: true
		});
		if (session?.accessToken) {
			return session.accessToken;
		}
	} catch {
		// best-effort
	}
	return (process.env.GITHUB_TOKEN ?? '').trim() || undefined;
}

function logCopilotCliLaunch(options: CopilotClientOptions, cliPath: string | undefined): void {
	cliDebugOutput.appendLine(`[${new Date().toISOString()}] Copilot runtime launch`);
	cliDebugOutput.appendLine(`runtime: ${cliPath ?? `bundled (@github/copilot-sdk-${process.platform}-${process.arch})`}`);
	cliDebugOutput.appendLine(`COPILOT_CLI_PATH: ${process.env.COPILOT_CLI_PATH ?? '<unset>'}`);
	cliDebugOutput.appendLine(`workingDirectory: ${options.workingDirectory ?? process.cwd()}`);
	cliDebugOutput.appendLine(`logLevel: ${options.logLevel ?? '<runtime default>'}`);
	cliDebugOutput.appendLine(
		`auth: hasGitHubToken=${Boolean(options.gitHubToken)}, useLoggedInUser=${options.useLoggedInUser ?? true}`
	);
	cliDebugOutput.appendLine('---');
	cliDebugOutput.show(true);
}

function getActiveWorkspaceRoot(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
