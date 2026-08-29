// Where is `dsh`? (issue #1; prototype issue #4 finding.) A dock-launched app
// gets launchd's minimal PATH, so PATH probing alone fails. Strategy, in
// order: a configured absolute path (DSH_BIN today, a setting later), PATH
// probing, then nvm-aware resolution: the alias "default" (exact, v-prefixed,
// or version-prefix match) wins, otherwise the highest installed version.
// The prototype also proved the spawned child needs the resolved bin dir
// prepended to its PATH — see augmentChildPath.
import { accessSync, constants, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

export interface ResolveDshBinaryOptions {
  env?: NodeJS.ProcessEnv;
  home?: string;
}

export function resolveDshBinary(
  options: ResolveDshBinaryOptions = {}
): string | null {
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const configured = env.DSH_BIN?.trim();
  if (configured) return configured;
  const onPath = findOnPath(env.PATH ?? "");
  if (onPath) return onPath;
  return findInNvm(home);
}

function isExecutable(file: string): boolean {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findOnPath(pathVar: string): string | null {
  for (const dir of pathVar.split(delimiter)) {
    if (dir === "") continue;
    const candidate = join(dir, "dsh");
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

function findInNvm(home: string): string | null {
  const versionsDir = join(home, ".nvm", "versions", "node");
  let versions: string[];
  try {
    versions = readdirSync(versionsDir).filter((name) => /^v\d/.test(name));
  } catch {
    return null;
  }
  const usable = versions.filter((version) =>
    isExecutable(join(versionsDir, version, "bin", "dsh"))
  );
  if (usable.length === 0) return null;
  const alias = readDefaultAlias(join(home, ".nvm", "alias", "default"));
  const chosen = (alias && pickVersion(usable, alias)) ?? highest(usable);
  return chosen ? join(versionsDir, chosen, "bin", "dsh") : null;
}

function readDefaultAlias(file: string): string | null {
  try {
    const text = readFileSync(file, "utf8").trim();
    return text === "" ? null : text;
  } catch {
    return null;
  }
}

function pickVersion(versions: string[], want: string): string | null {
  return (
    versions.find((v) => v === want || v === `v${want}`) ??
    versions.find((v) => v.startsWith(`v${want}.`)) ??
    null
  );
}

function highest(versions: string[]): string | null {
  const sorted = [...versions].sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true })
  );
  return sorted[0] ?? null;
}

/**
 * The dsh launcher is a `#!/usr/bin/env node` script, so a spawned child
 * needs the resolved bin dir on its PATH or `env node` cannot find node
 * (launchd's minimal PATH hides every nvm dir). Augment, never replace.
 */
export function augmentChildPath(
  resolvedBinary: string,
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const binDir = join(resolvedBinary, "..");
  const current = env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin";
  return { ...env, PATH: `${binDir}:${current}` };
}
