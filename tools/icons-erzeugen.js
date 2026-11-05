'use strict';
/* Erzeugt die App-Symbole (PNG) für Startbildschirm/Manifest – ohne Zusatzpakete.
   Aufruf: node tools/icons-erzeugen.js */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const VIOLETT = [0x4a, 0x2a, 0x6e];
const WEISS = [0xff, 0xff, 0xff];
const ROSA = [0xf0, 0xa3, 0xb8];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(typ, daten) {
  const len = Buffer.alloc(4); len.writeUInt32BE(daten.length);
  const td = Buffer.concat([Buffer.from(typ), daten]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Farbe am Punkt (u, v) in 0..1: violetter Grund, Haus mit Dach und Fenstern. */
function farbe(u, v, rand) {
  const innen = (x0, y0, x1, y1) => u >= x0 && u <= x1 && v >= y0 && v <= y1;
  const s = rand; // Sicherheitsrand für „maskable"
  const k = (x) => s + x * (1 - 2 * s);
  // Dach (Dreieck)
  const dachSpitze = k(0.18), dachBasis = k(0.42);
  if (v >= dachSpitze && v <= dachBasis) {
    const t = (v - dachSpitze) / (dachBasis - dachSpitze);
    const halb = 0.36 * t * (1 - 2 * s);
    if (Math.abs(u - 0.5) <= halb) return ROSA;
  }
  // Hauskörper
  if (innen(k(0.2), dachBasis, k(0.8), k(0.82))) {
    // Fenster 3×2 und Tür
    const fx = [0.29, 0.45, 0.61].map(k), fy = [0.47, 0.58].map(k), fw = 0.1 * (1 - 2 * s), fh = 0.08 * (1 - 2 * s);
    for (const x of fx) for (const y of fy) if (innen(x, y, x + fw, y + fh)) return VIOLETT;
    if (innen(k(0.45), k(0.72), k(0.55), k(0.82)) && !innen(k(0.45), k(0.69), k(0.55), k(0.72))) return VIOLETT;
    return WEISS;
  }
  return VIOLETT;
}

function png(groesse, rand = 0) {
  const zeilen = [];
  for (let y = 0; y < groesse; y++) {
    const z = Buffer.alloc(1 + groesse * 3);
    for (let x = 0; x < groesse; x++) {
      const [r, g, b] = farbe((x + 0.5) / groesse, (y + 0.5) / groesse, rand);
      z[1 + x * 3] = r; z[2 + x * 3] = g; z[3 + x * 3] = b;
    }
    zeilen.push(z);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(groesse, 0); ihdr.writeUInt32BE(groesse, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(zeilen), { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ziel = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(ziel, { recursive: true });
for (const [name, g, rand] of [['icon-192.png', 192, 0.06], ['icon-512.png', 512, 0.06], ['icon-maskable-512.png', 512, 0.14], ['apple-touch-icon.png', 180, 0.08]]) {
  fs.writeFileSync(path.join(ziel, name), png(g, rand));
  console.log('geschrieben:', name);
}
