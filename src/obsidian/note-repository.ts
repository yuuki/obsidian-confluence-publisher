import { parseYaml, type App, type TFile } from 'obsidian';
import {
	readLegacyPublication,
	readPublication,
	writePublication as updatePublicationFrontmatter,
} from '../domain/publication-metadata';
import {
	isSameDestination,
	type DestinationSnapshot,
	type NoteInput,
	type PublicationRecord,
} from '../domain/publication';

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
	listPublished(
		destination: DestinationSnapshot,
		titleSource: PublicationTitleSource,
	): Promise<Array<{
		path: string;
		title: string;
		record: PublicationRecord;
	}>>;
	listPublicationCandidates(destinationId: string): Promise<NoteFileRef[]>;
	resolveLink(target: string, sourcePath: string): string | null;
	readBinary(path: string): Promise<ArrayBuffer>;
	writePublication(file: NoteFileRef, record: PublicationRecord): Promise<void>;
}

export type PublicationTitleSource = 'frontmatter' | 'filename';

export class InvalidFrontmatterError extends Error {
	constructor(readonly path: string, message?: string) {
		super(`Invalid YAML frontmatter in ${path}.${message ? ` ${message}` : ''}`);
		this.name = 'InvalidFrontmatterError';
	}
}

export function parseNoteSource(path: string, basename: string, raw: string): NoteInput {
	if (FRONTMATTER_START_RE.test(raw) && !FRONTMATTER_RE.test(raw)) {
		throw new InvalidFrontmatterError(path);
	}
	const match = FRONTMATTER_RE.exec(raw);
	if (match === null) return { path, basename, raw, frontmatter: {}, body: raw };

	let parsed: unknown;
	try {
		parsed = parseYaml(match[1]);
	} catch (error) {
		throw new InvalidFrontmatterError(path, error instanceof Error ? error.message : undefined);
	}
	if (parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed))) {
		throw new InvalidFrontmatterError(path, 'Frontmatter must be an object.');
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

export function resolveNoteTitle(note: Pick<NoteInput, 'basename' | 'frontmatter'>, titleSource: PublicationTitleSource): string {
	const title = note.frontmatter.title;
	return titleSource === 'frontmatter' && typeof title === 'string' && title.trim()
		? title.trim()
		: note.basename;
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

	async listPublished(
		destination: DestinationSnapshot,
		titleSource: PublicationTitleSource,
	): Promise<Array<{
		path: string;
		title: string;
		record: PublicationRecord;
	}>> {
		const published: Array<{ path: string; title: string; record: PublicationRecord }> = [];
		for (const file of this.listMarkdownFiles()) {
			const note = await this.readForVaultScan(file);
			if (note === null) continue;
			const record = readPublication(note.frontmatter, destination.destinationId);
			if (record !== null && isSameDestination(record, destination)) {
				published.push({ path: note.path, title: resolveNoteTitle(note, titleSource), record });
			}
		}
		return published;
	}

	async listPublicationCandidates(destinationId: string): Promise<NoteFileRef[]> {
		const candidates: NoteFileRef[] = [];
		for (const file of this.listMarkdownFiles()) {
			const note = await this.readForVaultScan(file);
			if (note === null) continue;
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

	private async readForVaultScan(file: NoteFileRef): Promise<NoteInput | null> {
		try {
			return await this.read(file);
		} catch (error) {
			if (error instanceof InvalidFrontmatterError) return null;
			throw error;
		}
	}
}

function toFileRef(file: TFile): NoteFileRef {
	return { path: file.path, basename: file.basename, extension: file.extension };
}
