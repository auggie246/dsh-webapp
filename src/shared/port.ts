// Port handling shared by the Host bar flow: the user types a port for
// Attach, and bar entries carry ports from the file.
import { parseLoopbackUrl } from "./url-line.js";

export function parsePortText(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const port = Number(trimmed);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;
  return port;
}

export interface AttachInput {
  port: number;
  /** The launch token of a pasted authenticated URL (issue #8). */
  token?: string;
}

/**
 * What the user may paste into "Add Host at port or URL…": a bare port, the
 * authenticated URL a 0.1.2-rc.1 Host prints, or the whole `dsh web:` line.
 * The `(LAN: …)` suffix of a pasted line is ignored.
 */
export function parseAttachInput(text: string): AttachInput | null {
  let candidate = text.trim();
  if (candidate.startsWith("dsh web:")) {
    candidate = candidate.slice("dsh web:".length).trim();
  }
  if (/^\d+$/.test(candidate)) {
    const port = parsePortText(candidate);
    return port === null ? null : { port };
  }
  const first = candidate.split(/\s+/)[0] ?? "";
  const parsed = parseLoopbackUrl(first);
  if (!parsed) return null;
  return {
    port: parsed.port,
    ...(parsed.token === undefined ? {} : { token: parsed.token }),
  };
}
