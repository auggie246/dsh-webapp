// Copies static rail assets into dist after tsc. The rail ships as plain
// HTML/CSS/JS on purpose: it is small DOM glue, not typed logic.
const { copyFileSync, mkdirSync } = require("node:fs");
const path = require("node:path");

mkdirSync(path.join(__dirname, "..", "dist", "rail"), { recursive: true });
for (const name of ["rail.html", "rail.css", "rail.js"]) {
  copyFileSync(
    path.join(__dirname, "..", "src", "rail", name),
    path.join(__dirname, "..", "dist", "rail", name)
  );
}
console.log("rail assets copied to dist/rail");
