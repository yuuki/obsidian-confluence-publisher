import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { verifyVersions } from './verify-version.mjs';

const scriptPath = fileURLToPath(new URL('./verify-version.mjs', import.meta.url));
const currentVersion = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version as string;

describe('verifyVersions', () => {
  it('accepts matching package, manifest, and v-prefixed tag versions', () => {
    expect(() => verifyVersions({
      packageVersion: '0.1.0',
      lockfileVersion: '0.1.0',
      lockfileRootPackageVersion: '0.1.0',
      manifestVersion: '0.1.0',
      tag: 'v0.1.0',
    })).not.toThrow();
  });

  it('uses the package version when no tag is provided', () => {
    expect(() => verifyVersions({
      packageVersion: '0.1.0',
      lockfileVersion: '0.1.0',
      lockfileRootPackageVersion: '0.1.0',
      manifestVersion: '0.1.0',
    })).not.toThrow();
  });

  it('rejects a manifest mismatch', () => {
    expect(() => verifyVersions({
      packageVersion: '0.1.0',
      lockfileVersion: '0.1.0',
      lockfileRootPackageVersion: '0.1.0',
      manifestVersion: '0.1.1',
      tag: 'v0.1.0',
    })).toThrow('Version mismatch: package=0.1.0, lockfile=0.1.0, lockfileRootPackage=0.1.0, manifest=0.1.1, tag=0.1.0');
  });

  it('rejects a tag mismatch after removing one leading v', () => {
    expect(() => verifyVersions({
      packageVersion: '0.1.0',
      lockfileVersion: '0.1.0',
      lockfileRootPackageVersion: '0.1.0',
      manifestVersion: '0.1.0',
      tag: 'v0.2.0',
    })).toThrow('Version mismatch: package=0.1.0, lockfile=0.1.0, lockfileRootPackage=0.1.0, manifest=0.1.0, tag=0.2.0');
  });

  it('rejects a lockfile top-level version mismatch', () => {
    expect(() => verifyVersions({
      packageVersion: '0.1.0',
      lockfileVersion: '0.1.1',
      lockfileRootPackageVersion: '0.1.0',
      manifestVersion: '0.1.0',
      tag: 'v0.1.0',
    })).toThrow();
  });

  it('rejects a lockfile root package version mismatch', () => {
    expect(() => verifyVersions({
      packageVersion: '0.1.0',
      lockfileVersion: '0.1.0',
      lockfileRootPackageVersion: '0.1.1',
      manifestVersion: '0.1.0',
      tag: 'v0.1.0',
    })).toThrow();
  });

  it('reads repository versions and the release tag when run directly', () => {
    const output = execFileSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: { ...process.env, RELEASE_TAG: `v${currentVersion}` },
    });

    expect(output).toBe(`Version ${currentVersion} is consistent.\n`);
  });

  it('ignores the pull request merge ref when run directly', () => {
    const env: NodeJS.ProcessEnv = { ...process.env, GITHUB_REF_NAME: '1/merge' };
    delete env.RELEASE_TAG;

    const output = execFileSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env,
    });

    expect(output).toBe(`Version ${currentVersion} is consistent.\n`);
  });

  it('fails direct execution when the release tag is inconsistent', () => {
    expect(() => execFileSync(process.execPath, [scriptPath], {
      stdio: 'pipe',
      env: { ...process.env, RELEASE_TAG: 'v0.2.0' },
    })).toThrow();
  });
});
