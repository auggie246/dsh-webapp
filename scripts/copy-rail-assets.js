// Copies static rail assets into dist after tsc. The rail ships as plain
// HTML/CSS/JS on purpose: it is small DOM glue, not typed logic.
const { copyFileSync, mkdirSync } = require("node:fs");
const path = require("node:path");

mkdirSync(path.join(__dirname, "..", "dist", "rail"), { recursive: true });
copyFileSync(
  path.join(__dirname, "..", "src", "rail", "rail.html"),
  path.join(__dirname, "..", "dist", "rail", "rail.html")
);
copyFileSync(
  path.join(__dirname, "..", "src", "rail", "rail.css"),
  path.join(__dirname, "..", "dist", "rail", "rail.css")
);
console.log("rail assets copied to dist/rail");
