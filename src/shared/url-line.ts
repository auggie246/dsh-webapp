// The spawn contract (issue #1, confirmed by prototype issue #4; extended by
// issue #8): `dsh web` prints exactly this line to stdout. Since DSH
// 0.1.2-rc.1 the URL carries the Host's launch token as its `token` query
// parameter, and a LAN suffix may follow when the Host binds 0.0.0.0. Only a
// loopback URL counts as a Host address.
const URL_LINE = /^dsh web: (\S+)/;
const TOKEN_QUERY = "token";

export interface WebUrl {
  /** The full URL as the Host printed it, launch token included when present. */
  url: string;
  port: number;
  /** The `token` query parameter; absent on a pre-authentication Host. */
  token?: string;
}

export function parseDshWebLine(line: string): WebUrl | null {
  const candidate = URL_LINE.exec(line.trim())?.[1];
  if (!candidate) return null;
  const parsed = parseLoopbackUrl(candidate);
  if (!parsed) return null;
  return {
    url: hostWebUrl(parsed.port, parsed.token),
    port: parsed.port,
    ...(parsed.token === undefined ? {} : { token: parsed.token }),
  };
}

/**
 * The loopback rule shared by the stdout contract and the paste-to-attach
 * input (issue #8): an http URL on `127.0.0.1` with a real port, and the
 * launch token when the Host printed one.
 */
export function parseLoopbackUrl(candidate: string): { port: number; token?: string } | null {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") return null;
  const port = Number.parseInt(url.port, 10);
  if (!Number.isInteger(port) || port <= 0) return null;
  const token = url.searchParams.get(TOKEN_QUERY) ?? undefined;
  return { port, ...(token === undefined ? {} : { token }) };
}

/**
 * Build the loopback URL of a Host, the inverse of the parse: the plain
 * origin when the Host predates launch tokens, the token'd URL otherwise.
 */
export function hostWebUrl(port: number, token?: string): string {
  const base = `http://127.0.0.1:${port}`;
  return token === undefined ? base : `${base}/?${TOKEN_QUERY}=${encodeURIComponent(token)}`;
}
