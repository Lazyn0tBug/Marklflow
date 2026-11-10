import {readdir, stat} from 'node:fs/promises';
import {join} from 'node:path';

/**
 * The end-to-end suite runs against the production build in dist/, not against the sources.
 * A build older than the sources therefore tests the previous code and reports it as current,
 * so the suite refuses to start until the build is refreshed.
 */
const BUILD_INPUTS = ['src', 'index.html', 'vite.config.ts', 'bun.lock'];
const newest = (times: readonly number[]) => (times.length ? Math.max(...times) : 0);

export async function newestTime(path: string): Promise<number> {
  const info = await stat(path).catch(() => null);
  if (!info) return 0;
  if (info.isFile()) return info.mtimeMs;
  const entries = await readdir(path, {withFileTypes: true});
  return newest(await Promise.all(entries.map((entry) => newestTime(join(path, entry.name)))));
}

export interface BuildFreshness {
  built: number;
  source: number;
}

/** The newest build time and the newest source time, both in epoch milliseconds. */
export async function inspectBuild(
  buildDir: string,
  sourceInputs: readonly string[],
): Promise<BuildFreshness> {
  return {
    built: await newestTime(buildDir),
    source: newest(await Promise.all(sourceInputs.map(newestTime))),
  };
}

/** Why the build cannot be trusted, or undefined when it is fresh. */
export function staleReason(freshness: BuildFreshness): string | undefined {
  if (!freshness.built)
    return 'dist/ has no build output: run `bun run build` before the end-to-end suite.';
  if (freshness.source > freshness.built)
    return (
      'dist/ is older than the sources (source ' +
      new Date(freshness.source).toISOString() +
      ', build ' +
      new Date(freshness.built).toISOString() +
      '): run `bun run build` before the end-to-end suite.'
    );
  return undefined;
}

export default async function checkFreshBuild(): Promise<void> {
  const reason = staleReason(await inspectBuild('dist', BUILD_INPUTS));
  if (reason) throw new Error(reason);
}

if (process.argv[1]?.endsWith('check-fresh-build.ts')) await checkFreshBuild();
