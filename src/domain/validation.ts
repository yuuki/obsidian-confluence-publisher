import type { Destination } from './publication';

interface PublishFile {
	path: string;
	extension: string;
}

export function validateDestination(destination: Destination): string[] {
	const errors: string[] = [];
	if (destination.id.trim().length === 0) errors.push('Destination ID is required.');
	if (destination.spaceKey.trim().length === 0) errors.push('Space key is required.');
	if (destination.parentPageId.trim().length === 0) errors.push('Parent page ID is required.');
	return errors;
}

export function validatePublishFiles(files: PublishFile[]): string[] {
	if (files.length === 0) return ['Select at least one Markdown file.'];
	return files
		.filter((file) => file.extension.toLowerCase() !== 'md')
		.map((file) => `${file.path} is not a Markdown file.`);
}
