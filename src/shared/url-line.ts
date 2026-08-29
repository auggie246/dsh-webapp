// The spawn contract (issue #1, confirmed by prototype issue #4): `dsh web`
// prints exactly this line to stdout. A LAN suffix may follow when the Host
// binds 0.0.0.0. Only a loopback URL counts as a Host address.
const URL_LINE = /^dsh web: (http:\/\/127\.0\.0\.1:(\d+))/;

export interface WebUrl {
  url: string;
  port: number;
}

export function parseDshWebLine(line: string): WebUrl | null {
  const match = URL_LINE.exec(line.trim());
  const portText = match?.[2];
  if (!match?.[1] || !portText) return null;
  const port = Number.parseInt(portText, 10);
  if (!Number.isInteger(port) || port <= 0) return null;
  return { url: match[1], port };
}
