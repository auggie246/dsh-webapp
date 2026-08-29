// Port handling shared by the Host bar flow: the user types a port for
// Attach, and bar entries carry ports from the file.
export function parsePortText(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const port = Number(trimmed);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;
  return port;
}
