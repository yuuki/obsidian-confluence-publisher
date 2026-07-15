import type { Token, TokensList } from 'marked';

export interface WikiLinkToken {
	type: 'obsidian-wikilink';
	raw: string;
	target: string;
	heading: string | null;
	alias: string | null;
	embed: boolean;
}

export interface ImageEmbedToken {
	type: 'obsidian-image';
	raw: string;
	target: string;
	width: number | null;
	alt: string | null;
}

export interface CalloutToken {
	type: 'obsidian-callout';
	raw: string;
	calloutType: string;
	title: string | null;
	folded: boolean | null;
	tokens: Token[];
}

export interface ParsedMarkdown {
	tokens: TokensList;
	imageTokens: ImageEmbedToken[];
}
