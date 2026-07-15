import { describe, expect, it } from 'vitest';
import type { ProgressEvent } from '../publisher';
import { createCancelHandler, initialProgressState, reduceProgress } from './progress-state';

const eventsAfterCompletion: ProgressEvent[] = [
	{ type: 'planned', total: 99 },
	{ type: 'page-created', title: 'Late' },
	{ type: 'attachment-created', title: 'Late', filename: 'late.png' },
	{ type: 'attachment-updated', title: 'Late', filename: 'late.png' },
	{ type: 'page-updated', title: 'Late' },
	{ type: 'failed', title: 'Late', phase: 'content-update', error: 'late failure' },
	{ type: 'cancelled', succeeded: 0, failed: 1 },
	{ type: 'complete', succeeded: 0, failed: 1 },
];

describe('progress state', () => {
	it('counts completed pages rather than internal phases', () => {
		const planned = reduceProgress(initialProgressState(), { type: 'planned', total: 2 });
		const created = reduceProgress(planned, { type: 'page-created', title: 'One' });
		const attached = reduceProgress(created, {
			type: 'attachment-created', title: 'One', filename: 'image.png',
		});
		const updated = reduceProgress(attached, { type: 'page-updated', title: 'One' });

		expect(updated.label).toBe('Publishing 1 / 2 pages...');
		expect(updated.completedPages).toBe(1);
	});

	it('counts only content update failures as completed pages', () => {
		const planned = reduceProgress(initialProgressState(), { type: 'planned', total: 2 });
		const resolutionFailure = reduceProgress(planned, {
			type: 'failed', title: 'One', phase: 'page-resolution', error: 'failed',
		});
		const contentFailure = reduceProgress(resolutionFailure, {
			type: 'failed', title: 'Two', phase: 'content-update', error: 'failed',
		});

		expect(contentFailure.completedPages).toBe(1);
	});

	it('keeps cancellation terminal when complete arrives later', () => {
		const cancelled = reduceProgress(initialProgressState(), {
			type: 'cancelled', succeeded: 0, failed: 0,
		});
		const completed = reduceProgress(cancelled, { type: 'complete', succeeded: 0, failed: 0 });

		expect(completed.done).toBe(true);
		expect(completed.cancelled).toBe(true);
		expect(completed.label).toBe('Publishing cancelled.');
	});

	it.each(eventsAfterCompletion)('keeps completion terminal after $type', (event) => {
		const completed = reduceProgress(
			reduceProgress(initialProgressState(), { type: 'planned', total: 2 }),
			{ type: 'complete', succeeded: 2, failed: 0 },
		);

		expect(reduceProgress(completed, event)).toBe(completed);
	});

	it('invokes cancellation only once', () => {
		let calls = 0;
		const cancel = createCancelHandler(() => calls++);

		cancel();
		cancel();

		expect(calls).toBe(1);
	});
});
