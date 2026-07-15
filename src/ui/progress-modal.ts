import { App, Modal } from 'obsidian';
import type { ProgressEvent } from '../publisher';
import {
	createCancelHandler,
	initialProgressState,
	reduceProgress,
	type ProgressState,
} from './progress-state';

export class ProgressModal extends Modal {
	private progressBar!: HTMLProgressElement;
	private statusEl!: HTMLElement;
	private logEl!: HTMLElement;
	private actionBtn!: HTMLButtonElement;
	private state: ProgressState = initialProgressState();
	private readonly cancel: () => void;

	constructor(app: App, onCancel: () => void) {
		super(app);
		this.cancel = createCancelHandler(onCancel);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('confluence-progress');
		contentEl.createEl('h2', { text: 'Publishing to Confluence' });

		this.statusEl = contentEl.createDiv({ cls: 'confluence-progress-status' });
		this.statusEl.textContent = this.state.label;

		this.progressBar = contentEl.createEl('progress', {
			cls: 'confluence-progress-bar',
		});
		this.progressBar.max = 100;
		this.progressBar.value = 0;
		this.progressBar.style.width = '100%';
		this.progressBar.style.height = '8px';

		this.logEl = contentEl.createDiv({ cls: 'confluence-progress-log' });
		this.logEl.style.maxHeight = '300px';
		this.logEl.style.overflowY = 'auto';
		this.logEl.style.marginTop = '12px';
		this.logEl.style.fontSize = '0.85em';

		this.actionBtn = contentEl.createEl('button', {
			text: 'Cancel',
			cls: 'mod-cta',
		});
		this.actionBtn.style.marginTop = '12px';
		this.actionBtn.addEventListener('click', () => {
			if (this.state.done) this.close();
			else this.cancel();
		});
	}

	handleEvent(event: ProgressEvent): void {
		this.appendEvent(event);
		this.state = reduceProgress(this.state, event);
		this.statusEl.textContent = this.state.label;
		this.progressBar.value = progressPercent(this.state);
		if (this.state.done) this.actionBtn.textContent = 'Close';
	}

	private appendEvent(event: ProgressEvent): void {
		switch (event.type) {
			case 'page-created':
				this.appendLog('created', event.title);
				break;
			case 'attachment-created':
			case 'attachment-updated':
				this.appendLog('image', event.filename);
				break;
			case 'page-updated':
				this.appendLog('updated', event.title);
				break;
			case 'failed':
				this.appendLog('error', `${event.title ?? 'Publish'}: ${event.error}`);
				break;
			case 'planned':
			case 'cancelled':
			case 'complete':
				break;
		}
	}

	private appendLog(
		kind: 'created' | 'updated' | 'image' | 'error',
		message: string,
	): void {
		const line = this.logEl.createDiv({ cls: 'confluence-log-line' });
		const icon = { created: '\u2795', updated: '\u2705', image: '\uD83D\uDDBC', error: '\u274C' }[kind];
		line.style.padding = '2px 0';
		if (kind === 'error') line.style.color = 'var(--text-error, #e53e3e)';
		line.textContent = `${icon} ${message}`;
		this.logEl.scrollTop = this.logEl.scrollHeight;
	}

	onClose(): void {
		if (!this.state.done) this.cancel();
		this.contentEl.empty();
	}
}

function progressPercent(state: ProgressState): number {
	if (state.done) return 100;
	if (state.totalPages === 0) return 0;
	return Math.round((state.completedPages / state.totalPages) * 100);
}
