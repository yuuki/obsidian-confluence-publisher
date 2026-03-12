import { App, Modal } from 'obsidian';
import { ProgressEvent } from '../confluence/types';

export class ProgressModal extends Modal {
	private progressBar: HTMLProgressElement;
	private statusEl: HTMLElement;
	private logEl: HTMLElement;
	private closeBtn: HTMLButtonElement;
	private total = 0;
	private current = 0;

	constructor(app: App) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('confluence-progress');

		contentEl.createEl('h2', { text: 'Publishing to Confluence' });

		this.statusEl = contentEl.createDiv({ cls: 'confluence-progress-status' });
		this.statusEl.textContent = 'Preparing...';

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

		this.closeBtn = contentEl.createEl('button', {
			text: 'Close',
			cls: 'mod-cta',
		});
		this.closeBtn.style.marginTop = '12px';
		this.closeBtn.disabled = true;
		this.closeBtn.addEventListener('click', () => this.close());
	}

	handleEvent(event: ProgressEvent): void {
		switch (event.type) {
			case 'start':
				this.total = event.total * 2; // 2 passes: create + update
				this.current = 0;
				this.statusEl.textContent = `Publishing 0 / ${event.total} pages...`;
				break;

			case 'page_created':
				this.current++;
				this.updateProgress();
				this.appendLog('created', event.title);
				break;

			case 'image_uploaded':
				this.appendLog('image', event.filename);
				break;

			case 'page_updated':
				this.current++;
				this.updateProgress();
				this.appendLog('updated', event.title);
				break;

			case 'error':
				this.appendLog('error', `${event.title}: ${event.error}`);
				break;

			case 'complete':
				this.statusEl.textContent =
					`Done — ${event.succeeded} succeeded, ${event.failed} failed, ${event.skipped} skipped`;
				this.progressBar.value = 100;
				this.closeBtn.disabled = false;
				break;
		}
	}

	private updateProgress(): void {
		if (this.total > 0) {
			this.progressBar.value = Math.round((this.current / this.total) * 100);
		}
		this.statusEl.textContent = `Publishing ${this.current} / ${this.total} pages...`;
	}

	private appendLog(
		kind: 'created' | 'updated' | 'image' | 'error',
		message: string,
	): void {
		const line = this.logEl.createDiv({ cls: 'confluence-log-line' });
		const icon = { created: '\u2795', updated: '\u2705', image: '\uD83D\uDDBC', error: '\u274C' }[kind];
		line.style.padding = '2px 0';
		if (kind === 'error') {
			line.style.color = 'var(--text-error, #e53e3e)';
		}
		line.textContent = `${icon} ${message}`;
		this.logEl.scrollTop = this.logEl.scrollHeight;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
