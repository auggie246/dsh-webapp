// Bar persistence (issue #1, item 4): the Host bar survives relaunches as a
// JSON file in app data. Entries are (kind, port, label); anything the file
// cannot vouch for is dropped, and a missing or corrupt file means an empty
// bar — never a crash on launch.
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export type HostKind = "spawn" | "attach";

export interface BarEntry {
  id: string;
  kind: HostKind;
  port: number;
  label: string;
}

export function validateBarEntry(raw: unknown): BarEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.id !== "string" || entry.id === "") return null;
  if (entry.kind !== "spawn" && entry.kind !== "attach") return null;
  // A Spawn entry may hold port 0: its OS-picked port is only known after
  // the first URL line. An Attach entry must name a real port.
  const minPort = entry.kind === "spawn" ? 0 : 1;
  if (
    typeof entry.port !== "number" ||
    !Number.isInteger(entry.port) ||
    entry.port < minPort ||
    entry.port > 65_535
  ) {
    return null;
  }
  if (typeof entry.label !== "string" || entry.label === "") return null;
  return { id: entry.id, kind: entry.kind, port: entry.port, label: entry.label };
}

export function loadHostBar(file: string): BarEntry[] {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const entries: BarEntry[] = [];
  for (const raw of parsed) {
    const entry = validateBarEntry(raw);
    if (entry) entries.push(entry);
  }
  return entries;
}

export function saveHostBar(file: string, entries: BarEntry[]): void {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${JSON.stringify(entries, null, 2)}\n`);
  renameSync(temp, file);
}
