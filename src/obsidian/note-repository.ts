import { parseYaml, type App, type TFile } from 'obsidian';
import {
	readLegacyPublication,
	readPublication,
	writePublication as updatePublicationFrontmatter,
} from '../domain/publication-metadata';
import type { NoteInput, PublicationRecord } from '../domain/publication';

const FRONTMATTER_START_RE = /^---\r?\n/;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m;

export interface NoteFileRef {
	path: string;
	basename: string;
	extension: string;
}

export interface NoteRepository {
	read(file: NoteFileRef): Promise<NoteInput>;
	listMarkdownFiles(): NoteFileRef[];
	listPublished(destinationId: string): Promise<Array<{
		path: string;
		title: string;
		record: PublicationRecord;
	}>>;
	listPublicationCandidates(destinationId: string): Promise<NoteFileRef[]>;
	resolveLink(target: string, sourcePath: string): string | null;
	readBinary(path: string): Promise<ArrayBuffer>;
	writePublication(file: NoteFileRef, record: PublicationRecord): Promise<void>;
}

export function parseNoteSource(path: string, basename: string, raw: string): NoteInput {
	if (FRONTMATTER_START_RE.test(raw) && !FRONTMATTER_RE.test(raw)) {
		throw new Error(`Invalid YAML frontmatter in ${path}.`);
	}
	const match = FRONTMATTER_RE.exec(raw);
	if (match === null) return { path, basename, raw, frontmatter: {}, body: raw };

	let parsed: unknown;
	try {
		parsed = parseYaml(match[1]);
	} catch (error) {
		const detail = error instanceof Error ? ` ${error.message}` : '';
		throw new Error(`Invalid YAML frontmatter in ${path}.${detail}`);
	}
	if (parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed))) {
		throw new Error(`YAML frontmatter in ${path} must be an object.`);
	}
	return {
		path,
		basename,
		raw,
		frontmatter: (parsed ?? {}) as Record<string, unknown>,
		body: raw.slice(match[0].length),
	};
}

export function selectPublishContent(note: NoteInput, stripFrontmatter: boolean): string {
	return stripFrontmatter ? note.body : note.raw;
}

export class ObsidianNoteRepository implements NoteRepository {
	constructor(private readonly app: App) {}

	async read(file: NoteFileRef): Promise<NoteInput> {
		const obsidianFile = this.getFile(file.path);
		return parseNoteSource(file.path, file.basename, await this.app.vault.cachedRead(obsidianFile));
	}

	listMarkdownFiles(): NoteFileRef[] {
		return this.app.vault.getMarkdownFiles().map(toFileRef);
	}

	async listPublished(destinationId: string): Promise<Array<{
		path: string;
		title: string;
		record: PublicationRecord;
	}>> {
		const published: Array<{ path: string; title: string; record: PublicationRecord }> = [];
		for (const file of this.listMarkdownFiles()) {
			const note = await this.read(file);
			const record = readPublication(note.frontmatter, destinationId);
			if (record !== null) {
				const title = typeof note.frontmatter.title === 'string' && note.frontmatter.title.trim()
					? note.frontmatter.title.trim()
					: note.basename;
				published.push({ path: note.path, title, record });
			}
		}
		return published;
	}

	async listPublicationCandidates(destinationId: string): Promise<NoteFileRef[]> {
		const candidates: NoteFileRef[] = [];
		for (const file of this.listMarkdownFiles()) {
			const note = await this.read(file);
			if (
				readPublication(note.frontmatter, destinationId) !== null
				|| readLegacyPublication(note.frontmatter) !== null
			) candidates.push(file);
		}
		return candidates;
	}

	resolveLink(target: string, sourcePath: string): string | null {
		return this.app.metadataCache.getFirstLinkpathDest(target, sourcePath)?.path ?? null;
	}

	async readBinary(path: string): Promise<ArrayBuffer> {
		return this.app.vault.readBinary(this.getFile(path));
	}

	async writePublication(file: NoteFileRef, record: PublicationRecord): Promise<void> {
		const obsidianFile = this.getFile(file.path);
		await this.app.fileManager.processFrontMatter(obsidianFile, (frontmatter) => {
			const next = updatePublicationFrontmatter(frontmatter, record);
			for (const key of Object.keys(frontmatter)) delete frontmatter[key];
			Object.assign(frontmatter, next);
		});
	}

	private getFile(path: string): TFile {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file === null || !('extension' in file)) {
			throw new Error(`Vault file not found: ${path}`);
		}
		return file as TFile;
	}
}

function toFileRef(file: TFile): NoteFileRef {
	return { path: file.path, basename: file.basename, extension: file.extension };
}
