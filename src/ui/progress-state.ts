import type { ProgressEvent } from '../publisher';

export interface ProgressState {
	totalPages: number;
	completedPages: number;
	succeeded: number;
	failed: number;
	done: boolean;
	cancelled: boolean;
	label: string;
}

export function initialProgressState(): ProgressState {
	return {
		totalPages: 0,
		completedPages: 0,
		succeeded: 0,
		failed: 0,
		done: false,
		cancelled: false,
		label: 'Preparing...',
	};
}

export function createCancelHandler(onCancel: () => void): () => void {
	let cancelled = false;
	return () => {
		if (cancelled) return;
		cancelled = true;
		onCancel();
	};
}

export function reduceProgress(state: ProgressState, event: ProgressEvent): ProgressState {
	if (state.done) return state;

	switch (event.type) {
		case 'planned':
			return runningState(state, { totalPages: event.total });
		case 'page-updated':
			return runningState(state, {
				completedPages: Math.min(state.completedPages + 1, state.totalPages),
			});
		case 'failed':
			if (event.phase !== 'content-update') return state;
			return runningState(state, {
				completedPages: Math.min(state.completedPages + 1, state.totalPages),
			});
		case 'cancelled':
			return {
				...state,
				succeeded: event.succeeded,
				failed: event.failed,
				done: true,
				cancelled: true,
				label: 'Publishing cancelled.',
			};
		case 'complete':
			return {
				...state,
				completedPages: state.totalPages,
				succeeded: event.succeeded,
				failed: event.failed,
				done: true,
				label: `Done — ${event.succeeded} succeeded, ${event.failed} failed`,
			};
		case 'page-created':
		case 'attachment-created':
		case 'attachment-updated':
			return state;
	}
}

function runningState(
	state: ProgressState,
	changes: Partial<Pick<ProgressState, 'totalPages' | 'completedPages'>>,
): ProgressState {
	const next = { ...state, ...changes };
	return {
		...next,
		label: `Publishing ${next.completedPages} / ${next.totalPages} pages...`,
	};
}
