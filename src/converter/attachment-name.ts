import { createHash } from 'crypto';

export function attachmentNameForPath(vaultPath: string): string {
	const normalizedPath = vaultPath.replace(/\\/g, '/');
	const basename = normalizedPath.slice(normalizedPath.lastIndexOf('/') + 1);
	const dot = basename.lastIndexOf('.');
	const stem = dot > 0 ? basename.slice(0, dot) : basename;
	const extension = dot > 0 ? basename.slice(dot).toLowerCase() : '';
	const safeStem = stem
		.replace(/[^A-Za-z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'attachment';
	const digest = createHash('sha256').update(normalizedPath).digest('hex').slice(0, 12);

	return `${safeStem}-${digest}${extension}`;
}
