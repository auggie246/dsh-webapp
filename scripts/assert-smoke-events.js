const { readFileSync } = require("node:fs");

const file = process.argv[2];
if (!file) throw new Error("usage: node scripts/assert-smoke-events.js <events.jsonl> [spawn|attach]");
const expectedKind = process.argv[3];
const events = readFileSync(file, "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const names = events.map((event) => event.event);
for (const event of ["app-ready", "host-ready", "quit-started", "quit-complete"]) {
  if (!names.includes(event)) throw new Error(`missing smoke event: ${event}`);
}
if (expectedKind) {
  const ready = events.find((event) => event.event === "host-ready");
  if (ready?.kind !== expectedKind) throw new Error(`expected ${expectedKind} Host, got ${ready?.kind}`);
}
if (names.indexOf("app-ready") > names.indexOf("host-ready") || names.indexOf("host-ready") > names.indexOf("quit-started")) {
  throw new Error("smoke events arrived out of order");
}
