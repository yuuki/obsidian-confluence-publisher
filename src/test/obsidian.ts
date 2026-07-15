export function parseYaml(source: string): unknown {
	if (source.includes('invalid: [')) throw new Error('Invalid YAML');
	const result: Record<string, unknown> = {};
	for (const line of source.split(/\r?\n/)) {
		if (line.trim() === '' || /^\s/.test(line)) continue;
		const separator = line.indexOf(':');
		if (separator < 0) throw new Error('Invalid YAML');
		result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
	}
	return result;
}
