import { Plugin, TFile, Notice } from 'obsidian';
import {
	ConfluencePublisherSettings,
	ConfluenceDestination,
	DEFAULT_SETTINGS,
	ConfluenceSettingTab,
	migrateSettings,
} from './settings';
import { FileSelectModal } from './ui/file-select-modal';
import { DestinationSelectModal } from './ui/destination-select-modal';
import { ProgressModal } from './ui/progress-modal';
import { Publisher } from './publisher';

export default class ConfluencePublisherPlugin extends Plugin {
	settings: ConfluencePublisherSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addSettingTab(new ConfluenceSettingTab(this.app, this));

		this.addCommand({
			id: 'publish-selected',
			name: 'Publish selected notes to Confluence',
			callback: () => {
				if (!this.validateSettings()) return;
				new FileSelectModal(this.app, (files) =>
					this.selectDestinationAndPublish(files),
				).open();
			},
		});

		this.addCommand({
			id: 'publish-current',
			name: 'Publish current note to Confluence',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (checking) return true;
				if (!this.validateSettings()) return true;
				this.selectDestinationAndPublish([file]);
				return true;
			},
		});

		this.addCommand({
			id: 'update-published',
			name: 'Update already published notes',
			callback: async () => {
				if (!this.validateSettings()) return;
				const publishedFiles = this.findPublishedFiles();
				if (publishedFiles.length === 0) {
					new Notice('No published notes found (no confluence-page-id in frontmatter)');
					return;
				}
				this.selectDestinationAndPublish(publishedFiles);
			},
		});
	}

	private async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = data ? migrateSettings(data) : { ...DEFAULT_SETTINGS };
	}

	private validateSettings(): boolean {
		const s = this.settings;
		if (!s.confluenceUrl) {
			new Notice('Please configure Confluence URL in settings.');
			return false;
		}
		if (s.destinations.length === 0) {
			new Notice('Please add at least one destination in settings.');
			return false;
		}
		if (s.authType === 'pat' && !s.token) {
			new Notice('Please set your Personal Access Token in settings.');
			return false;
		}
		if (s.authType === 'basic' && (!s.username || !s.password)) {
			new Notice('Please set username and password in settings.');
			return false;
		}
		return true;
	}

	private selectDestinationAndPublish(files: TFile[]): void {
		if (files.length === 0) {
			new Notice('No files selected.');
			return;
		}

		const dests = this.settings.destinations;

		// Skip selection modal if only one destination
		if (dests.length === 1) {
			this.runPublish(files, dests[0]);
			return;
		}

		new DestinationSelectModal(this.app, dests, (dest) => {
			this.runPublish(files, dest);
		}).open();
	}

	private async runPublish(files: TFile[], destination: ConfluenceDestination): Promise<void> {
		const progressModal = new ProgressModal(this.app);
		progressModal.open();

		const publisher = new Publisher(this.app, this.settings);
		try {
			for await (const event of publisher.publish(
				files,
				destination.spaceKey,
				destination.parentPageId,
			)) {
				progressModal.handleEvent(event);
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Publishing failed: ${msg}`);
			progressModal.handleEvent({
				type: 'complete',
				succeeded: 0,
				failed: files.length,
				skipped: 0,
			});
		}
	}

	private findPublishedFiles(): TFile[] {
		const files: TFile[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (cache?.frontmatter?.['confluence-page-id']) {
				files.push(file);
			}
		}
		return files;
	}
}
