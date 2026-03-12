import { App, PluginSettingTab, Setting, Plugin } from 'obsidian';

export interface ConfluenceDestination {
	label: string;
	spaceKey: string;
	parentPageId: string;
}

export interface ConfluencePublisherSettings {
	confluenceUrl: string;
	destinations: ConfluenceDestination[];
	authType: 'pat' | 'basic';
	token: string;
	username: string;
	password: string;
	stripFrontmatter: boolean;
	titleSource: 'frontmatter' | 'filename';
}

export const DEFAULT_SETTINGS: ConfluencePublisherSettings = {
	confluenceUrl: '',
	destinations: [],
	authType: 'pat',
	token: '',
	username: '',
	password: '',
	stripFrontmatter: true,
	titleSource: 'frontmatter',
};

/** Migrate legacy settings that had spaceKey/parentPageId at top level. */
export function migrateSettings(data: Record<string, unknown>): ConfluencePublisherSettings {
	const settings = Object.assign({}, DEFAULT_SETTINGS, data) as ConfluencePublisherSettings & {
		spaceKey?: string;
		parentPageId?: string;
	};
	if (!settings.destinations) {
		settings.destinations = [];
	}
	// Migrate old single spaceKey/parentPageId to destinations[0]
	if (settings.spaceKey && settings.parentPageId && settings.destinations.length === 0) {
		settings.destinations.push({
			label: settings.spaceKey,
			spaceKey: settings.spaceKey,
			parentPageId: settings.parentPageId,
		});
	}
	delete settings.spaceKey;
	delete settings.parentPageId;
	return settings;
}

export class ConfluenceSettingTab extends PluginSettingTab {
	private plugin: Plugin & { settings: ConfluencePublisherSettings };
	private authContainerEl: HTMLElement | null = null;

	constructor(
		app: App,
		plugin: Plugin & { settings: ConfluencePublisherSettings },
	) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Confluence Publisher Settings' });

		this.addConnectionSection(containerEl);
		this.addDestinationsSection(containerEl);
		this.addAuthSection(containerEl);
		this.addPublishingSection(containerEl);
	}

	private addConnectionSection(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: 'Connection' });

		new Setting(containerEl)
			.setName('Confluence URL')
			.setDesc(
				'Base URL of your Confluence Server/DC instance (e.g. https://confluence.example.com)',
			)
			.addText((text) =>
				text
					.setPlaceholder('https://confluence.example.com')
					.setValue(this.plugin.settings.confluenceUrl)
					.onChange(async (value) => {
						this.plugin.settings.confluenceUrl = value.replace(
							/\/+$/,
							'',
						);
						await this.plugin.saveData(this.plugin.settings);
					}),
			);
	}

	private destinationsContainerEl: HTMLElement | null = null;

	private addDestinationsSection(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: 'Destinations' });
		containerEl.createEl('p', {
			text: 'Configure one or more publish targets. You will choose a destination each time you publish.',
			cls: 'setting-item-description',
		});

		this.destinationsContainerEl = containerEl.createDiv();
		this.renderDestinations();

		new Setting(containerEl)
			.addButton((btn) =>
				btn
					.setButtonText('Add destination')
					.setCta()
					.onClick(async () => {
						this.plugin.settings.destinations.push({
							label: '',
							spaceKey: '',
							parentPageId: '',
						});
						await this.plugin.saveData(this.plugin.settings);
						this.renderDestinations();
					}),
			);
	}

	private renderDestinations(): void {
		if (!this.destinationsContainerEl) return;
		this.destinationsContainerEl.empty();

		const dests = this.plugin.settings.destinations;
		for (let i = 0; i < dests.length; i++) {
			const dest = dests[i];
			const row = this.destinationsContainerEl.createDiv({
				cls: 'confluence-destination-row',
			});
			row.style.border = '1px solid var(--background-modifier-border)';
			row.style.borderRadius = '6px';
			row.style.padding = '8px 12px';
			row.style.marginBottom = '8px';

			new Setting(row)
				.setName('Label')
				.addText((text) =>
					text
						.setPlaceholder('e.g. Research Space')
						.setValue(dest.label)
						.onChange(async (value) => {
							dest.label = value.trim();
							await this.plugin.saveData(this.plugin.settings);
						}),
				);

			new Setting(row)
				.setName('Space key')
				.addText((text) =>
					text
						.setPlaceholder('RESEARCH')
						.setValue(dest.spaceKey)
						.onChange(async (value) => {
							dest.spaceKey = value.trim();
							await this.plugin.saveData(this.plugin.settings);
						}),
				);

			new Setting(row)
				.setName('Parent page ID')
				.addText((text) =>
					text
						.setPlaceholder('12345')
						.setValue(dest.parentPageId)
						.onChange(async (value) => {
							dest.parentPageId = value.trim();
							await this.plugin.saveData(this.plugin.settings);
						}),
				);

			new Setting(row)
				.addButton((btn) =>
					btn
						.setButtonText('Delete')
						.setWarning()
						.onClick(async () => {
							this.plugin.settings.destinations.splice(i, 1);
							await this.plugin.saveData(this.plugin.settings);
							this.renderDestinations();
						}),
				);
		}
	}

	private addAuthSection(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: 'Authentication' });

		new Setting(containerEl)
			.setName('Authentication type')
			.setDesc('Choose between Personal Access Token or Basic Auth')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('pat', 'Personal Access Token')
					.addOption('basic', 'Basic Auth (username/password)')
					.setValue(this.plugin.settings.authType)
					.onChange(async (value) => {
						this.plugin.settings.authType = value as
							| 'pat'
							| 'basic';
						await this.plugin.saveData(this.plugin.settings);
						this.renderAuthFields();
					}),
			);

		this.authContainerEl = containerEl.createDiv();
		this.renderAuthFields();
	}

	private renderAuthFields(): void {
		if (!this.authContainerEl) {
			return;
		}
		this.authContainerEl.empty();

		if (this.plugin.settings.authType === 'pat') {
			new Setting(this.authContainerEl)
				.setName('Personal Access Token')
				.setDesc(
					'Generate a PAT in your Confluence profile settings',
				)
				.addText((text) => {
					text.inputEl.type = 'password';
					text.inputEl.autocomplete = 'off';
					text.setPlaceholder('Enter your PAT')
						.setValue(this.plugin.settings.token)
						.onChange(async (value) => {
							this.plugin.settings.token = value;
							await this.plugin.saveData(this.plugin.settings);
						});
				});
		} else {
			new Setting(this.authContainerEl)
				.setName('Username')
				.setDesc('Your Confluence username')
				.addText((text) =>
					text
						.setPlaceholder('jdoe')
						.setValue(this.plugin.settings.username)
						.onChange(async (value) => {
							this.plugin.settings.username = value;
							await this.plugin.saveData(this.plugin.settings);
						}),
				);

			new Setting(this.authContainerEl)
				.setName('Password')
				.setDesc('Your Confluence password')
				.addText((text) => {
					text.inputEl.type = 'password';
					text.inputEl.autocomplete = 'off';
					text.setPlaceholder('Enter your password')
						.setValue(this.plugin.settings.password)
						.onChange(async (value) => {
							this.plugin.settings.password = value;
							await this.plugin.saveData(this.plugin.settings);
						});
				});
		}
	}

	private addPublishingSection(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: 'Publishing' });

		new Setting(containerEl)
			.setName('Strip frontmatter')
			.setDesc(
				'Remove YAML frontmatter from the note before publishing to Confluence',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.stripFrontmatter)
					.onChange(async (value) => {
						this.plugin.settings.stripFrontmatter = value;
						await this.plugin.saveData(this.plugin.settings);
					}),
			);

		new Setting(containerEl)
			.setName('Title source')
			.setDesc(
				'Determine the Confluence page title from frontmatter "title" field or the filename',
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('frontmatter', 'Frontmatter "title" field')
					.addOption('filename', 'Note filename')
					.setValue(this.plugin.settings.titleSource)
					.onChange(async (value) => {
						this.plugin.settings.titleSource = value as
							| 'frontmatter'
							| 'filename';
						await this.plugin.saveData(this.plugin.settings);
					}),
			);
	}
}
