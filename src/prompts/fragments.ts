/** Reusable prompt building blocks. */

/** Markdown horizontal-rule separator used between prompt sections. */
export const SECTION_RULE = '\n\n---\n\n';

/** Join non-empty section bodies with the standard separator. */
export function composeSections(...sections: Array<string | undefined | null>): string {
	return sections.filter((section): section is string => Boolean(section)).join(SECTION_RULE);
}

/**
 * Append an environment note so the agent knows its cwd and shell.
 *
 * The main agent uses `systemMessage: { mode: 'replace' }`, which makes the CLI
 * emit our content verbatim with no environment block, so we add one. A no-op
 * when no workspace is open.
 */
export function withWorkingDirectory(prompt: string, cwd: string | undefined): string {
	if (!cwd) {
		return prompt;
	}
	const shell = process.platform === 'win32' ? 'PowerShell' : 'a POSIX shell';
	return `${prompt}${SECTION_RULE}## Environment

- Working directory: \`${cwd}\`
- Shell: ${shell}
- Paths are relative to the working directory; build absolute paths from it when you call file tools or cite locations.`;
}
