const { existsSync } = require("node:fs");
const path = require("node:path");

const required = [
  "dist/main/main.js",
  "dist/preload/host-bar-preload.js",
  "dist/host-bar/host-bar.html",
  "dist/host-bar/host-bar.css",
  "dist/host-bar/host-bar.js",
];

for (const file of required) {
  if (!existsSync(path.join(__dirname, "..", file))) {
    throw new Error(`package input is missing: ${file}`);
  }
}
