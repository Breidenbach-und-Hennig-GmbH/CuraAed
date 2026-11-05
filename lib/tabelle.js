'use strict';

// Liest einfache Tabellen aus Excel (.xlsx, erstes Blatt) oder CSV – ohne Zusatzpakete.
// .xlsx ist ein ZIP-Archiv mit XML-Dateien; benötigt werden sharedStrings.xml und sheet1.xml.
const zlib = require('zlib');

const MAX_ENTPACKT = 30 * 1024 * 1024;

/** Einträge eines ZIP-Archivs über das zentrale Verzeichnis lesen. */
function zipEintraege(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Keine gültige Excel-Datei (ZIP-Verzeichnis fehlt).');
  const anzahl = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  const eintraege = {};
  for (let n = 0; n < anzahl; n++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error('Beschädigte Excel-Datei.');
    const methode = buf.readUInt16LE(pos + 10);
    const groesse = buf.readUInt32LE(pos + 20);
    const ungepackt = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const kommLen = buf.readUInt16LE(pos + 32);
    const lokal = buf.readUInt32LE(pos + 42);
    const name = buf.toString('utf8', pos + 46, pos + 46 + nameLen);
    eintraege[name] = { methode, groesse, ungepackt, lokal };
    pos += 46 + nameLen + extraLen + kommLen;
  }
  return {
    namen: Object.keys(eintraege),
    lesen(name) {
      const e = eintraege[name];
      if (!e) return null;
      if (e.ungepackt > MAX_ENTPACKT) throw new Error('Excel-Datei zu groß.');
      const start = e.lokal + 30 + buf.readUInt16LE(e.lokal + 26) + buf.readUInt16LE(e.lokal + 28);
      const daten = buf.subarray(start, start + e.groesse);
      if (e.methode === 0) return daten.toString('utf8');
      if (e.methode === 8) return zlib.inflateRawSync(daten, { maxOutputLength: MAX_ENTPACKT }).toString('utf8');
      throw new Error('Nicht unterstützte Excel-Komprimierung.');
    },
  };
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const xmlText = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENT[e] ?? m;
});
const texte = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1])).join('');
const spalteZuIndex = (s) => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

function xlsxZeilen(buf) {
  const zip = zipEintraege(buf);
  const shared = [];
  const ss = zip.lesen('xl/sharedStrings.xml');
  if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(texte(m[1]));
  const blattName = zip.namen.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!blattName) throw new Error('Die Excel-Datei enthält kein Tabellenblatt.');
  const blatt = zip.lesen(blattName);
  const zeilen = [];
  for (const rm of blatt.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const zeile = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attr = cm[1];
      const ref = (attr.match(/\br="([A-Z]+)\d+"/) || [])[1];
      const typ = (attr.match(/\bt="([^"]+)"/) || [])[1];
      const inhalt = cm[2] || '';
      let wert = '';
      if (typ === 'inlineStr') wert = texte(inhalt);
      else {
        const v = (inhalt.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (v !== undefined) wert = typ === 's' ? shared[Number(v)] ?? '' : xmlText(v);
      }
      zeile[ref ? spalteZuIndex(ref) : zeile.length] = wert;
    }
    zeilen.push(Array.from(zeile, (x) => x ?? ''));
  }
  return zeilen;
}

function csvZeilen(buf) {
  let text = buf.toString('utf8');
  if (text.includes('�')) text = buf.toString('latin1'); // Windows-Export (ANSI)
  text = text.replace(/^﻿/, '');
  const erste = text.split(/\r?\n/, 1)[0];
  const trenner = (erste.match(/;/g) || []).length >= (erste.match(/,/g) || []).length ? ';' : ',';
  const zeilen = [];
  let zeile = []; let feld = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { feld += '"'; i++; } else if (c === '"') inQ = false; else feld += c;
    } else if (c === '"') inQ = true;
    else if (c === trenner) { zeile.push(feld); feld = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      zeile.push(feld); zeilen.push(zeile); zeile = []; feld = '';
    } else feld += c;
  }
  if (feld || zeile.length) { zeile.push(feld); zeilen.push(zeile); }
  return zeilen;
}

/** Tabelle aus Datei-Inhalt: .xlsx (ZIP) oder CSV. */
function lesen(buf) {
  if (buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50) return xlsxZeilen(buf);
  return csvZeilen(buf);
}

module.exports = { lesen };
