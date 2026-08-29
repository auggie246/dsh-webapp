// Copies static Host bar assets into dist after tsc. The Host bar ships as
// plain HTML/CSS/JS on purpose: it is small DOM glue, not typed logic.
const { copyFileSync, mkdirSync } = require("node:fs");
const path = require("node:path");

mkdirSync(path.join(__dirname, "..", "dist", "host-bar"), { recursive: true });
for (const name of ["host-bar.html", "host-bar.css", "host-bar.js"]) {
  copyFileSync(
    path.join(__dirname, "..", "src", "host-bar", name),
    path.join(__dirname, "..", "dist", "host-bar", name)
  );
}
console.log("Host bar assets copied to dist/host-bar");
