import { App, TFile, parseYaml, stringifyYaml } from 'obsidian';
import { ConfluenceClient } from './confluence/client';
import { ImageRef, ProgressEvent } from './confluence/types';
import { ConfluencePublisherSettings } from './settings';
import { preprocessObsidianSyntax } from './converter/obsidian-syntax';
import { markdownToStorageFormat } from './converter/markdown-to-storage';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

interface PageEntry {
	file: TFile;
	title: string;
	frontmatter: Record<string, unknown>;
	body: string;
	confluenceId: string | null;
}

function getMimeType(ext: string): string {
	const map: Record<string, string> = {
		png: 'image/png',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		gif: 'image/gif',
		svg: 'image/svg+xml',
		webp: 'image/webp',
	};
	return map[ext.toLowerCase()] || 'application/octet-stream';
}

export class Publisher {
	private client: ConfluenceClient;
	private settings: ConfluencePublisherSettings;
	private app: App;

	constructor(app: App, settings: ConfluencePublisherSettings) {
		this.app = app;
		this.settings = settings;
		this.client = new ConfluenceClient(
			settings.confluenceUrl,
			settings.authType,
			settings.token,
			settings.username,
			settings.password,
		);
	}

	async *publish(files: TFile[], spaceKey: string, parentPageId: string): AsyncGenerator<ProgressEvent> {
		yield { type: 'start', total: files.length };

		// --- Parse all files ---
		const entries: PageEntry[] = [];
		for (const file of files) {
			const raw = await this.app.vault.cachedRead(file);
			const { frontmatter, body } = this.parseFrontmatter(raw);
			const title = this.resolveTitle(file, frontmatter);
			const existingId = (frontmatter['confluence-page-id'] as string) || null;
			entries.push({ file, title, frontmatter, body, confluenceId: existingId });
		}

		// --- Pass 1: Create or find pages ---
		const titleToPath = new Map<string, string>();
		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];
			try {
				if (entry.confluenceId) {
					// Already published — will update in pass 2
					titleToPath.set(entry.title, entry.file.path);
					yield { type: 'page_created', title: entry.title, index: i };
					continue;
				}

				const existingId = await this.client.findPageByTitle(
					spaceKey,
					entry.title,
				);

				if (existingId) {
					entry.confluenceId = existingId;
				} else {
					const page = await this.client.createPage(
						spaceKey,
						parentPageId,
						entry.title,
						'<p>Importing from Obsidian...</p>',
					);
					entry.confluenceId = page.id;
				}

				titleToPath.set(entry.title, entry.file.path);
				yield { type: 'page_created', title: entry.title, index: i };
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				yield { type: 'error', title: entry.title, error: msg };
				entry.confluenceId = null; // mark as failed
			}
		}

		// Build mapping: file path -> confluence title (for wikilink resolution)
		// Obsidian's getFirstLinkpathDest() already resolves aliases internally,
		// so we only need the file path → title mapping here.
		const publishedFiles = new Map<string, string>();
		for (const entry of entries) {
			if (entry.confluenceId) {
				publishedFiles.set(entry.file.path, entry.title);
			}
		}

		// --- Pass 2: Convert content, upload images, update pages ---
		let succeeded = 0;
		let failed = 0;
		let skipped = 0;

		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];
			if (!entry.confluenceId) {
				skipped++;
				continue;
			}

			try {
				// Preprocess Obsidian syntax
				const { content: preprocessed, images } =
					await preprocessObsidianSyntax(
						entry.body,
						entry.file,
						this.app,
						publishedFiles,
						spaceKey,
					);

				// Convert to Confluence storage format
				const storageBody = markdownToStorageFormat(preprocessed);

				// Upload images (skip already-uploaded ones)
				const { uploaded } = await this.uploadImages(entry.confluenceId, images);
				for (const filename of uploaded) {
					yield { type: 'image_uploaded', filename };
				}

				// Get current version for update
				const currentPage = await this.client.getPage(entry.confluenceId);
				await this.client.updatePage(
					entry.confluenceId,
					entry.title,
					storageBody,
					currentPage.version.number,
				);

				// Write confluence-page-id back to frontmatter
				const webui = currentPage._links?.webui
					?? `/pages/viewpage.action?pageId=${entry.confluenceId}`;
				await this.writeFrontmatterId(
					entry.file,
					entry.confluenceId,
					webui,
				);

				succeeded++;
				yield { type: 'page_updated', title: entry.title, index: i };
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				failed++;
				yield { type: 'error', title: entry.title, error: msg };
			}
		}

		yield { type: 'complete', succeeded, failed, skipped };
	}

	private parseFrontmatter(raw: string): {
		frontmatter: Record<string, unknown>;
		body: string;
	} {
		const match = raw.match(FRONTMATTER_RE);
		if (!match) {
			return { frontmatter: {}, body: raw };
		}
		try {
			const fm = parseYaml(match[1]) || {};
			const body = raw.slice(match[0].length);
			return { frontmatter: fm as Record<string, unknown>, body };
		} catch {
			return { frontmatter: {}, body: raw };
		}
	}

	private resolveTitle(
		file: TFile,
		frontmatter: Record<string, unknown>,
	): string {
		let title: string;
		if (
			this.settings.titleSource === 'frontmatter' &&
			typeof frontmatter['title'] === 'string' &&
			frontmatter['title'].trim()
		) {
			title = frontmatter['title'].trim();
		} else {
			title = file.basename;
		}
		return title;
	}

	private async uploadImages(
		pageId: string,
		images: ImageRef[],
	): Promise<{ uploaded: string[]; skipped: string[] }> {
		const uploaded: string[] = [];
		const skipped: string[] = [];

		// Fetch existing attachments once to avoid redundant uploads
		let existing: Set<string>;
		try {
			existing = await this.client.getAttachmentFilenames(pageId);
		} catch {
			existing = new Set();
		}

		for (const img of images) {
			if (!img.resolvedPath) continue;
			const file = this.app.vault.getAbstractFileByPath(img.resolvedPath);
			if (!file || !(file instanceof TFile)) continue;

			if (existing.has(img.filename)) {
				console.log(`[confluence-publisher] Skipping already uploaded: ${img.filename}`);
				skipped.push(img.filename);
				continue;
			}

			try {
				const data = await this.app.vault.readBinary(file);
				const mimeType = getMimeType(file.extension);
				await this.client.uploadAttachment(
					pageId,
					img.filename,
					data,
					mimeType,
				);
				uploaded.push(img.filename);
			} catch (e) {
				console.warn(
					`Failed to upload attachment ${img.filename}:`,
					e,
				);
			}
		}
		return { uploaded, skipped };
	}

	private async writeFrontmatterId(
		file: TFile,
		pageId: string,
		webui: string,
	): Promise<void> {
		const raw = await this.app.vault.read(file);
		const confluenceUrl = `${this.settings.confluenceUrl}${webui}`;

		const match = raw.match(FRONTMATTER_RE);
		if (match) {
			try {
				const fm = (parseYaml(match[1]) || {}) as Record<string, unknown>;
				fm['confluence-page-id'] = pageId;
				fm['confluence-url'] = confluenceUrl;
				const newFm = `---\n${stringifyYaml(fm)}---\n`;
				const newContent = newFm + raw.slice(match[0].length);
				await this.app.vault.modify(file, newContent);
			} catch {
				// If YAML parsing fails, don't modify
			}
		} else {
			// No frontmatter — prepend one
			const fm = {
				'confluence-page-id': pageId,
				'confluence-url': confluenceUrl,
			};
			const newContent = `---\n${stringifyYaml(fm)}---\n${raw}`;
			await this.app.vault.modify(file, newContent);
		}
	}
}
