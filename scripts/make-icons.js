// Generates the app icons as committed PNGs — no image toolchain needed.
// - assets/icon.png            512×512 dock/app icon
// - assets/trayTemplate.png    16×16 menu-bar icon (black + alpha)
// - assets/trayTemplate@2x.png 32×32 the same, for Retina
// The glyph is a terminal prompt: a chevron plus an underscore cursor.
// Rerun with: node scripts/make-icons.js
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { execFileSync } = require("node:child_process");
const { deflateSync } = require("node:zlib");
const path = require("node:path");

// --- minimal PNG encoder (RGBA, no filtering) -------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- glyph geometry ----------------------------------------------------------
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Coverage in [0,1] of the glyph (chevron + cursor) at a point.
function glyphCoverage(px, py, s) {
  const scale = s / 512; // geometry is authored at 512
  const x = px / scale;
  const y = py / scale;
  const w = 58 / 2;
  const d1 = distToSegment(x, y, 150, 150, 258, 258);
  const d2 = distToSegment(x, y, 258, 258, 150, 366);
  const d3 = distToSegment(x, y, 300, 366, 392, 366);
  const d = Math.min(d1, d2, d3) - w;
  return Math.max(0, Math.min(1, 0.5 - d / 2)); // ~1px soft edge at 512
}

// Coverage in [0,1] of a rounded square at a point.
function roundedSquareCoverage(px, py, s, radius) {
  const inset = s * 0.04; // small transparent margin
  const size = s - inset * 2;
  const r = radius * (size / 512);
  const x = px - inset;
  const y = py - inset;
  const dx = Math.max(r - x, 0, x - (size - r));
  const dy = Math.max(r - y, 0, y - (size - r));
  const dist = Math.hypot(dx, dy) - r;
  return Math.max(0, Math.min(1, 0.5 - dist / 2));
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Supersample 2×2 for clean edges at small sizes.
      let plate = 0;
      let glyph = 0;
      for (const [ox, oy] of [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ]) {
        const px = x + ox;
        const py = y + oy;
        plate += roundedSquareCoverage(px, py, size, 100);
        glyph += glyphCoverage(px, py, size);
      }
      plate /= 4;
      glyph /= 4;
      // Plate: deep slate; glyph: near-white, both premultiplied by hand here
      // (PNG stores straight alpha, so just scale channels).
      const plateA = plate;
      const glyphA = glyph;
      const r = Math.round(30 * plateA + 235 * glyphA);
      const g = Math.round(32 * plateA + 236 * glyphA);
      const b = Math.round(38 * plateA + 240 * glyphA);
      rgba[i] = Math.min(255, r);
      rgba[i + 1] = Math.min(255, g);
      rgba[i + 2] = Math.min(255, b);
      rgba[i + 3] = Math.round(255 * Math.max(plateA, glyphA));
    }
  }
  return encodePng(size, size, rgba);
}

// Template icon: black glyph, alpha carries the shape (macOS tints it).
function renderTemplate(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let glyph = 0;
      for (const [ox, oy] of [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ]) {
        glyph += glyphCoverage(x + ox, y + oy, size);
      }
      const alpha = Math.round(255 * (glyph / 4));
      rgba[i] = 0;
      rgba[i + 1] = 0;
      rgba[i + 2] = 0;
      rgba[i + 3] = alpha;
    }
  }
  return encodePng(size, size, rgba);
}

function writeIco(file) {
  const image = renderIcon(256);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = 0;
  header[7] = 0;
  header[8] = 0;
  header[9] = 0;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(image.length, 14);
  header.writeUInt32LE(22, 18);
  writeFileSync(file, Buffer.concat([header, image]));
}

function writeIcns(file) {
  if (process.platform !== "darwin") return;
  const temporary = mkdtempSync(path.join(tmpdir(), "dsh-desktop-icon-"));
  const iconset = path.join(temporary, "DSH Desktop.iconset");
  mkdirSync(iconset);
  try {
    for (const size of [16, 32, 128, 256, 512]) {
      writeFileSync(path.join(iconset, `icon_${size}x${size}.png`), renderIcon(size));
      writeFileSync(path.join(iconset, `icon_${size}x${size}@2x.png`), renderIcon(size * 2));
    }
    execFileSync("iconutil", ["-c", "icns", iconset, "-o", file]);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

const outDir = path.join(__dirname, "..", "assets");
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "icon.png"), renderIcon(512));
writeIco(path.join(outDir, "icon.ico"));
writeIcns(path.join(outDir, "icon.icns"));
writeFileSync(path.join(outDir, "trayTemplate.png"), renderTemplate(16));
writeFileSync(path.join(outDir, "trayTemplate@2x.png"), renderTemplate(32));
console.log("icons written to assets/");
