// App settings (issue #2): one JSON file in app data, so far only the global
// hotkey. A missing or corrupt file, or a hotkey the file cannot vouch for,
// falls back to the default — never a crash on launch.
import { readFileSync } from "node:fs";
import { writeJsonAtomic } from "./json-file.js";

/** The hotkey the ticket proposes; summoned from anywhere. */
export const DEFAULT_HOTKEY = "CommandOrControl+Shift+D";

export interface AppSettings {
  /** Electron accelerator, or null when the hotkey is disabled. */
  hotkey: string | null;
}

/** Canonical Electron modifier names, by their lowercase accelerator part. */
const MODIFIER_ALIASES: Record<string, string> = {
  commandorcontrol: "CommandOrControl",
  cmdorctrl: "CommandOrControl",
  command: "CommandOrControl",
  cmd: "CommandOrControl",
  control: "Control",
  ctrl: "Control",
  alt: "Alt",
  option: "Alt",
  altgr: "AltGr",
  super: "Super",
  meta: "Meta",
  shift: "Shift",
};

/** Key names an accelerator may end with (besides letters and digits). */
const KEY_ALIASES: Record<string, string> = Object.fromEntries(
  [
    "Space",
    "Tab",
    "Backspace",
    "Delete",
    "Insert",
    "Return",
    "Enter",
    "Up",
    "Down",
    "Left",
    "Right",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "Escape",
    "Esc",
    "Plus",
    "Minus",
    "Comma",
    "Period",
  ].map((key) => [key.toLowerCase(), key])
);

/**
 * Validates and canonicalises an Electron accelerator, e.g. "cmd+shift+d"
 * → "CommandOrControl+Shift+D". Returns null when the app must not register
 * it: no parts, no modifier, no key, or an unknown part.
 */
export function validateAccelerator(text: string): string | null {
  const parts = text.trim().split("+").filter((part) => part !== "");
  if (parts.length < 2) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index] ?? "";
    const isLast = index === parts.length - 1;
    const modifier = MODIFIER_ALIASES[part.toLowerCase()];
    if (modifier !== undefined) {
      if (isLast || seen.has(modifier)) return null;
      seen.add(modifier);
      out.push(modifier);
      continue;
    }
    const key = canonicalKey(part);
    if (key === null || !isLast) return null;
    out.push(key);
  }
  return out.length >= 2 ? out.join("+") : null;
}

function canonicalKey(part: string): string | null {
  if (/^[a-z]$/i.test(part)) return part.toUpperCase();
  if (/^[0-9]$/.test(part)) return part;
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/i.test(part)) return part.toUpperCase();
  return KEY_ALIASES[part.toLowerCase()] ?? null;
}

/**
 * Loads settings; anything the file cannot vouch for falls back to the
 * default hotkey. An explicit null (disabled) is kept.
 */
export function loadSettings(file: string): AppSettings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { hotkey: DEFAULT_HOTKEY };
  }
  if (typeof parsed !== "object" || parsed === null) return { hotkey: DEFAULT_HOTKEY };
  const raw = (parsed as Record<string, unknown>).hotkey;
  if (raw === null) return { hotkey: null };
  if (typeof raw !== "string") return { hotkey: DEFAULT_HOTKEY };
  const hotkey = validateAccelerator(raw);
  return { hotkey: hotkey ?? DEFAULT_HOTKEY };
}

export function saveSettings(file: string, settings: AppSettings): void {
  writeJsonAtomic(file, settings);
}
