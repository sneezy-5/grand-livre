// generate-icons.js
// Script à lancer une seule fois en local (`node scripts/generate-icons.js`)
// pour produire les icônes PWA dans public/icons/. Aucune dépendance
// d'image : encodeur PNG minimal écrit à la main avec seulement zlib
// (DEFLATE) + un CRC32 fait main — cohérent avec le reste du projet, qui
// évite systématiquement les librairies quand quelques lignes suffisent.
//
// Le glyph reprend le favicon/masthead existant (carré + 3 barres
// horizontales décroissantes) avec une simplification délibérée : coins
// carrés et barres à bouts droits, pour n'avoir besoin d'aucun
// anti-aliasing (tests de rectangle exacts uniquement) — iOS/Android
// appliquent de toute façon leur propre masque de coins à l'icône installée.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const TEAL = [0x1f, 0x6f, 0x5c, 255];
const CREAM = [0xef, 0xed, 0xe4, 255];

// Mêmes proportions que le viewBox 100x100 du favicon/masthead existant :
// barres à y=34/50/66, épaisseur 6 (donc de y-3 à y+3), largeurs 24-76/24-76/24-58.
const BARS = [
  { y: 34, xStart: 24, xEnd: 76 },
  { y: 50, xStart: 24, xEnd: 76 },
  { y: 66, xStart: 24, xEnd: 58 }
];
const BAR_HALF_HEIGHT = 3;

function buildPixels(size) {
  const scale = size / 100;
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) buf.set(TEAL, i * 4);

  BARS.forEach((bar) => {
    const yTop = Math.round((bar.y - BAR_HALF_HEIGHT) * scale);
    const yBottom = Math.round((bar.y + BAR_HALF_HEIGHT) * scale);
    const xLeft = Math.round(bar.xStart * scale);
    const xRight = Math.round(bar.xEnd * scale);
    for (let y = yTop; y < yBottom; y++) {
      for (let x = xLeft; x < xRight; x++) {
        const idx = (y * size + x) * 4;
        buf.set(CREAM, idx);
      }
    }
  });

  return buf;
}

function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(size) {
  const pixels = buildPixels(size);
  const rowBytes = size * 4;
  const rows = [];
  for (let y = 0; y < size; y++) {
    rows.push(Buffer.concat([Buffer.from([0]), pixels.subarray(y * rowBytes, (y + 1) * rowBytes)]));
  }
  const raw = Buffer.concat(rows);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

const outDir = path.join(__dirname, "..", "public", "icons");
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon-180.png", 180]
];

targets.forEach(([name, size]) => {
  fs.writeFileSync(path.join(outDir, name), encodePng(size));
  console.log(`Écrit : public/icons/${name} (${size}x${size})`);
});
