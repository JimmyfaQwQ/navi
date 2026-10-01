import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { createGetErrorsTool } from '../agent/tools/getErrorsTool.js';

// Build paths with the host's separator so the tests pass on Windows and POSIX runners.
const workspaceRoot = path.resolve('/workspace/navi');
const uriAt = (...segments: string[]) => ({ fsPath: path.join(...segments) }) as vscode.Uri;

suite('createGetErrorsTool', () => {
	test('lists workspace diagnostics and returns severity summary', async () => {
		const diagnostics = [
			[
				uriAt(workspaceRoot, 'src', 'a.ts'),
				[
					{
						range: new vscode.Range(0, 0, 0, 4),
						severity: vscode.DiagnosticSeverity.Error,
						message: 'Type mismatch',
						source: 'ts'
					},
					{
						range: new vscode.Range(2, 1, 2, 5),
						severity: vscode.DiagnosticSeverity.Warning,
						message: 'Unused variable',
						source: 'eslint'
					}
				] as readonly vscode.Diagnostic[]
			],
			[
				uriAt(path.resolve('/workspace/other'), 'b.ts'),
				[
					{
						range: new vscode.Range(1, 0, 1, 3),
						severity: vscode.DiagnosticSeverity.Error,
						message: 'Outside workspace',
						source: 'ts'
					}
				] as readonly vscode.Diagnostic[]
			]
		] as ReadonlyArray<[vscode.Uri, readonly vscode.Diagnostic[]]>;

		const tool = createGetErrorsTool({
			resolveWorkspaceRoot: () => workspaceRoot,
			getAllDiagnostics: () => diagnostics
		});

		const result = JSON.parse(await tool.func('')) as {
			ok: boolean;
			summary: { total: number; error: number; warning: number; info: number; hint: number };
			diagnostics: Array<{ path: string; line: number; severity: string }>;
		};

		assert.strictEqual(result.ok, true);
		assert.deepStrictEqual(result.summary, {
			total: 2,
			error: 1,
			warning: 1,
			info: 0,
			hint: 0
		});
		assert.strictEqual(result.diagnostics.length, 2);
		assert.strictEqual(result.diagnostics[0].path, 'src/a.ts');
		assert.strictEqual(result.diagnostics[0].line, 1);
		assert.strictEqual(result.diagnostics[0].severity, 'error');
	});

	test('supports filtering diagnostics by filePaths input', async () => {
		const diagnostics = [
			[
				uriAt(workspaceRoot, 'src', 'a.ts'),
				[
					{
						range: new vscode.Range(0, 0, 0, 2),
						severity: vscode.DiagnosticSeverity.Error,
						message: 'A error'
					}
				] as readonly vscode.Diagnostic[]
			],
			[
				uriAt(workspaceRoot, 'src', 'b.ts'),
				[
					{
						range: new vscode.Range(1, 0, 1, 2),
						severity: vscode.DiagnosticSeverity.Warning,
						message: 'B warning'
					}
				] as readonly vscode.Diagnostic[]
			]
		] as ReadonlyArray<[vscode.Uri, readonly vscode.Diagnostic[]]>;

		const tool = createGetErrorsTool({
			resolveWorkspaceRoot: () => workspaceRoot,
			getAllDiagnostics: () => diagnostics
		});

		const result = JSON.parse(await tool.func('{"filePaths":["src/b.ts"]}')) as {
			summary: { total: number; warning: number };
			diagnostics: Array<{ path: string; message: string }>;
		};

		assert.strictEqual(result.summary.total, 1);
		assert.strictEqual(result.summary.warning, 1);
		assert.strictEqual(result.diagnostics[0].path, 'src/b.ts');
		assert.strictEqual(result.diagnostics[0].message, 'B warning');
	});
});