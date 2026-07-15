interface PublishFile {
	path: string;
	extension: string;
}

export function validateDestination(destination: unknown): string[] {
	const value = isRecord(destination) ? destination : {};
	const errors: string[] = [];
	if (!isNonEmptyString(value.id)) errors.push('Destination ID is required.');
	if (!isNonEmptyString(value.spaceKey)) errors.push('Space key is required.');
	if (!isNonEmptyString(value.parentPageId)) errors.push('Parent page ID is required.');
	return errors;
}

export function validatePublishFiles(files: PublishFile[]): string[] {
	if (files.length === 0) return ['Select at least one Markdown file.'];
	return files
		.filter((file) => file.extension.toLowerCase() !== 'md')
		.map((file) => `${file.path} is not a Markdown file.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}
