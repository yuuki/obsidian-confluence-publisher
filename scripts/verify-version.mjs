import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @param {{ packageVersion: string, manifestVersion: string, tag?: string }} versions
 */
export function verifyVersions({ packageVersion, manifestVersion, tag }) {
  const normalizedTag = tag ? tag.replace(/^v/, '') : packageVersion;
  if (packageVersion !== manifestVersion || packageVersion !== normalizedTag) {
    throw new Error(
      `Version mismatch: package=${packageVersion}, manifest=${manifestVersion}, tag=${normalizedTag}`,
    );
  }
}

function readJson(relativeUrl) {
  return JSON.parse(readFileSync(new URL(relativeUrl, import.meta.url), 'utf8'));
}

function main() {
  const packageJson = readJson('../package.json');
  const manifest = readJson('../manifest.json');
  verifyVersions({
    packageVersion: packageJson.version,
    manifestVersion: manifest.version,
    tag: process.env.GITHUB_REF_NAME,
  });
  process.stdout.write(`Version ${packageJson.version} is consistent.\n`);
}

const entryPoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (entryPoint === import.meta.url) main();
