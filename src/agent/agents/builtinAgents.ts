/**
 * Navi's sub-agent policy. The main agent does exploration, planning and
 * review itself; it delegates (through the Task tool's `agent_type`) only to
 * these built-in Copilot CLI agents, each kept for one narrow scenario:
 *
 * - `explore`: several independent investigation threads at once.
 * - `code-review`: an independent, fresh-context review of a large or risky diff.
 * - `security-review`: only when the user asks for one.
 *
 * Every other built-in agent is excluded from the session. `task` and
 * `general-purpose` can edit files and run builds, which would break Navi's
 * rule that the user writes the code.
 */
export const DELEGATE_AGENTS = {
	explore: 'explore',
	codeReview: 'code-review',
	securityReview: 'security-review'
} as const;

export type DelegateAgentName = (typeof DELEGATE_AGENTS)[keyof typeof DELEGATE_AGENTS];

/** Built-in agents hidden from the session (runtime 1.0.90 agent set). */
export const EXCLUDED_BUILTIN_AGENTS = ['task', 'general-purpose', 'rubber-duck', 'research'];

/**
 * Built-in tools the main agent must not have: Navi guides, the user writes.
 * The runtime picks a tool set per model: Claude models edit with
 * `create` / `edit`, GPT models with `apply_patch`. Delegates above are
 * read-only, so this keeps every file change in the user's hands.
 */
export const EXCLUDED_BUILTIN_TOOLS = ['create', 'edit', 'apply_patch'];

const DISPLAY_NAMES: Record<DelegateAgentName, string> = {
	explore: 'Explore Agent',
	'code-review': 'Code Review Agent',
	'security-review': 'Security Review Agent'
};

/** Whether a sub-agent run is a review-style delegation. */
export function isReviewAgent(agentName: string | undefined): boolean {
	return agentName === DELEGATE_AGENTS.codeReview || agentName === DELEGATE_AGENTS.securityReview;
}

/** Fallback display name when the runtime does not supply one. */
export function delegateDisplayName(agentName: string | undefined): string | undefined {
	return agentName && agentName in DISPLAY_NAMES ? DISPLAY_NAMES[agentName as DelegateAgentName] : undefined;
}
