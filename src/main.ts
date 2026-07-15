import { randomUUID } from 'crypto';
import { Notice, Plugin, TFile } from 'obsidian';
import {
	ConfluencePublisherSettings,
	ConfluenceDestination,
	DEFAULT_SETTINGS,
	ConfluenceSettingTab,
} from './settings';
import { loadMigratedSettings } from './domain/settings';
import { validateDestination, validatePublishFiles } from './domain/validation';
import { FileSelectModal } from './ui/file-select-modal';
import { DestinationSelectModal } from './ui/destination-select-modal';
import { ProgressModal } from './ui/progress-modal';
import { Publisher } from './publisher';
import { ObsidianNoteRepository, type NoteFileRef } from './obsidian/note-repository';
import { ConfluenceRepository } from './confluence/repository';
import { NodeHttpTransport, validateConfluenceBaseUrl } from './confluence/transport';

export default class ConfluencePublisherPlugin extends Plugin {
	settings: ConfluencePublisherSettings = DEFAULT_SETTINGS;
	private activePublish: AbortController | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new ConfluenceSettingTab(this.app, this));

		this.addCommand({
			id: 'publish-selected',
			name: 'Publish selected notes to Confluence',
			callback: () => {
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
				if (file === null || file.extension.toLowerCase() !== 'md') return false;
				if (!checking) this.selectDestinationAndPublish([file]);
				return true;
			},
		});

		this.addCommand({
			id: 'update-published',
			name: 'Update already published notes',
			callback: () => this.selectDestination((destination) => {
				void this.updatePublished(destination);
			}),
		});
	}

	private async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = await loadMigratedSettings(
			data,
			randomUUID,
			(settings) => this.saveData(settings),
		);
	}

	private selectDestinationAndPublish(files: TFile[]): void {
		if (files.length === 0) {
			new Notice('No files selected.');
			return;
		}
		this.selectDestination((destination) => this.runPublish(files, destination));
	}

	private selectDestination(onChoose: (destination: ConfluenceDestination) => void): void {
		if (this.activePublish !== null) {
			new Notice('A Confluence publish is already running.');
			return;
		}
		const destinations = this.settings.destinations.filter((destination) =>
			validateDestination(destination).length === 0,
		);
		if (destinations.length === 0) {
			new Notice('Please configure a complete Confluence destination in settings.');
			return;
		}
		if (destinations.length === 1) {
			onChoose(destinations[0]);
			return;
		}
		new DestinationSelectModal(this.app, destinations, onChoose).open();
	}

	private async updatePublished(destination: ConfluenceDestination): Promise<void> {
		try {
			const notes = new ObsidianNoteRepository(this.app);
			const files = await notes.listPublicationCandidates(destination.id);
			if (files.length === 0) {
				new Notice('No notes are published to this destination.');
				return;
			}
			await this.runPublish(files, destination);
		} catch (error) {
			new Notice(`Unable to scan published notes: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private async runPublish(
		files: NoteFileRef[],
		destination: ConfluenceDestination,
	): Promise<void> {
		if (this.activePublish !== null) {
			new Notice('A Confluence publish is already running.');
			return;
		}

		const errors = [
			...validateDestination(destination),
			...validatePublishFiles(files),
		];
		if (errors.length > 0) {
			new Notice(errors.join('\n'));
			return;
		}

		try {
			validateConfluenceBaseUrl(this.settings.confluenceUrl);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
			return;
		}

		const controller = new AbortController();
		this.activePublish = controller;
		const progressModal = new ProgressModal(this.app, () => controller.abort());
		progressModal.open();

		try {
			const publisher = this.createPublisher();
			for await (const event of publisher.publish(files, destination, controller.signal)) {
				progressModal.handleEvent(event);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Publishing failed: ${message}`);
			progressModal.handleEvent({
				type: 'failed', title: null, phase: 'preflight', error: message,
			});
			progressModal.handleEvent({ type: 'complete', succeeded: 0, failed: files.length });
		} finally {
			this.activePublish = null;
		}
	}

	private createPublisher(): Publisher {
		const authorization = this.authorizationHeader();
		const transport = new NodeHttpTransport({
			baseUrl: this.settings.confluenceUrl,
			headers: { Authorization: authorization, Accept: 'application/json' },
		});
		return new Publisher({
			notes: new ObsidianNoteRepository(this.app),
			repository: new ConfluenceRepository(transport),
			settings: this.settings,
		});
	}

	private authorizationHeader(): string {
		if (this.settings.authType === 'pat') {
			if (this.settings.token.length === 0) {
				throw new Error('Please set your Personal Access Token in settings.');
			}
			return `Bearer ${this.settings.token}`;
		}
		if (this.settings.username.length === 0 || this.settings.password.length === 0) {
			throw new Error('Please set username and password in settings.');
		}
		return `Basic ${Buffer.from(`${this.settings.username}:${this.settings.password}`).toString('base64')}`;
	}
}
