import {
	T,
	vscode,
	focusSummary,
	focusList,
	focusPrevBtn,
	focusNextBtn,
	focusReviewSelectedBtn,
	focusHelpSelectedBtn,
	focusSelectionLabel,
	focusFooter,
	state
} from './state.js';

export function getSelectedTargetIds(): string[] {
	return state.focusTargets
		.filter((target) => state.selectedTargetIds.has(target.id))
		.map((target) => target.id);
}

export function refreshFooter(): void {
	const selectedCount = getSelectedTargetIds().length;
	const totalCount = state.focusTargets.length;
	focusReviewSelectedBtn.disabled = selectedCount === 0;
	focusHelpSelectedBtn.disabled = selectedCount === 0;
	focusReviewSelectedBtn.setAttribute('aria-label', `Review ${selectedCount} of ${totalCount} selected regions`);
	focusHelpSelectedBtn.setAttribute('aria-label', `Get help on ${selectedCount} of ${totalCount} selected regions`);
	if (focusSelectionLabel) {
		focusSelectionLabel.textContent = selectedCount === 0 ? T.selectionNone : T.selectionCount(selectedCount);
	}
	focusFooter?.classList.toggle('has-selection', selectedCount > 0);
	focusFooter?.classList.toggle('hidden', totalCount === 0);
}

function renderEmpty(): void {
	const empty = document.createElement('div');
	empty.className = 'focus-empty';
	const title = document.createElement('p');
	title.className = 'focus-empty-title';
	title.textContent = T.emptyTitle;
	const body = document.createElement('p');
	body.className = 'focus-empty-body';
	body.textContent = T.emptyBody;
	empty.append(title, body);
	focusList.appendChild(empty);
}

function actionButton(label: string, className: string, ariaLabel: string, type: string, targetId: string): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = `focus-target-action ${className}`;
	button.textContent = label;
	button.setAttribute('aria-label', ariaLabel);
	button.addEventListener('click', () => {
		vscode.postMessage({ type, sessionId: state.currentSessionId, focusTargetId: targetId });
	});
	return button;
}

export function render(): void {
	focusList.innerHTML = '';
	state.selectedTargetIds = new Set(
		Array.from(state.selectedTargetIds).filter((id) => state.focusTargets.some((target) => target.id === id))
	);
	if (!Array.isArray(state.focusTargets) || state.focusTargets.length === 0) {
		focusSummary.textContent = T.emptySummary;
		focusPrevBtn.disabled = true;
		focusNextBtn.disabled = true;
		renderEmpty();
		refreshFooter();
		return;
	}

	focusSummary.textContent = T.summary(state.focusTargets.length, state.activeIndex + 1);
	focusPrevBtn.disabled = state.focusTargets.length <= 1;
	focusNextBtn.disabled = state.focusTargets.length <= 1;

	state.focusTargets.forEach((target, index) => {
		const card = document.createElement('div');
		card.className = 'focus-target-card';
		if (index === state.activeIndex) {
			card.classList.add('focus-target-card-active');
			card.setAttribute('aria-current', 'true');
		}

		// Waypoint number: regions are an ordered route that Prev / Next walks through.
		const marker = document.createElement('span');
		marker.className = 'focus-target-index';
		marker.textContent = String(index + 1);
		marker.setAttribute('aria-hidden', 'true');

		const main = document.createElement('div');
		main.className = 'focus-target-main';

		const topRow = document.createElement('div');
		topRow.className = 'focus-target-top-row';

		const title = document.createElement('div');
		title.className = 'focus-target-title';
		title.textContent = target.title || T.untitledRegion;
		if (!target.title) {
			title.classList.add('untitled');
		}

		const toggleWrap = document.createElement('label');
		toggleWrap.className = 'focus-target-checkbox-wrap';
		toggleWrap.title = 'Select';

		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.className = 'focus-target-checkbox';
		checkbox.checked = state.selectedTargetIds.has(target.id);
		checkbox.setAttribute('aria-label', `Select ${title.textContent}`);
		checkbox.addEventListener('change', () => {
			if (checkbox.checked) {
				state.selectedTargetIds.add(target.id);
			} else {
				state.selectedTargetIds.delete(target.id);
			}
			card.classList.toggle('selected', checkbox.checked);
			refreshFooter();
		});
		card.classList.toggle('selected', checkbox.checked);

		toggleWrap.appendChild(checkbox);
		topRow.appendChild(title);
		topRow.appendChild(toggleWrap);

		const location = document.createElement('div');
		location.className = 'focus-target-location';
		const lines = target.startLine === target.endLine ? `${target.startLine}` : `${target.startLine}–${target.endLine}`;
		location.textContent = `${target.path}:${lines}`;
		location.title = target.path;

		const instruction = document.createElement('div');
		instruction.className = 'focus-target-instruction';
		instruction.textContent = target.instruction || T.defaultInstruction;

		const actionRow = document.createElement('div');
		actionRow.className = 'focus-target-action-row';

		const titleLabel = title.textContent || T.untitledRegion;
		const locationLabel = `${target.path}, lines ${target.startLine} to ${target.endLine}`;

		actionRow.append(
			actionButton(T.jump, 'focus-target-jump', T.jumpAria(titleLabel, locationLabel), 'focus:revealById', target.id),
			actionButton(T.help, 'focus-help-btn', T.helpAria(titleLabel), 'focus:helpById', target.id),
			actionButton(T.review, 'focus-review-btn', T.reviewAria(titleLabel), 'focus:reviewById', target.id)
		);
		main.append(topRow, location, instruction, actionRow);
		card.append(marker, main);
		focusList.appendChild(card);
	});
	refreshFooter();
}
