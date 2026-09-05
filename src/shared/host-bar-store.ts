// Bar persistence (issue #1, item 4; token added by issue #8): the Host bar
// survives relaunches as a JSON file in app data. Entries are (kind, port,
// label) plus an attached Host's launch token; anything the file cannot vouch
// for is dropped, and a missing or corrupt file means an empty bar — never a
// crash on launch.
import { readFileSync } from "node:fs";
import { writeJsonAtomic } from "./json-file.js";

export type HostKind = "spawn" | "attach";

export interface BarEntry {
  id: string;
  kind: HostKind;
  port: number;
  label: string;
  /**
   * The attached Host's launch token (issue #8). Only an Attach entry may
   * carry one: a Spawned Host mints a fresh token each launch, so a stored
   * spawn token would always be stale fiction.
   */
  token?: string;
}

const MAX_TOKEN_LENGTH = 512;

function attachToken(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const token = raw.trim();
  if (token === "" || token.length > MAX_TOKEN_LENGTH) return undefined;
  return token;
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
  const token = entry.kind === "attach" ? attachToken(entry.token) : undefined;
  return { id: entry.id, kind: entry.kind, port: entry.port, label: entry.label, ...(token === undefined ? {} : { token }) };
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
  writeJsonAtomic(file, entries);
}
