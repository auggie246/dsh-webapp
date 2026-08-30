// Atomic JSON persistence shared by the app's stores: write to a sibling
// temp file, then rename over the target, so a crash mid-write never leaves
// a half-written file behind.
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";

export function writeJsonAtomic(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temp, file);
}
