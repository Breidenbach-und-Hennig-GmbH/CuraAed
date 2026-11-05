'use strict';
/* Erzeugt lib/blz-daten.json aus der Bankleitzahlendatei der Deutschen Bundesbank
   (Festformat, ISO-8859-1, 168 Zeichen je Satz). Quelle (vierteljährlich neu):
   https://www.bundesbank.de/de/aufgaben/unbarer-zahlungsverkehr/serviceangebot/bankleitzahlen/download-bankleitzahlen-602592
   Aufruf: node tools/blz-aktualisieren.js /pfad/blz-aktuell-txt-data.txt */
const fs = require('fs');
const path = require('path');

const datei = process.argv[2];
if (!datei) { console.error('Aufruf: node tools/blz-aktualisieren.js <blz-aktuell-txt-data.txt>'); process.exit(1); }
const text = fs.readFileSync(datei, 'latin1');
const banken = {};
let zeilen = 0;
for (const roh of text.split(/\r?\n/)) {
  if (roh.length < 160) continue;
  zeilen++;
  const feld = (von, bis) => roh.slice(von - 1, bis).trim();
  if (feld(9, 9) !== '1') continue; // nur Hauptsätze der Zahlungsdienstleister
  const blz = feld(1, 8);
  if (!/^\d{8}$/.test(blz)) continue;
  banken[blz] = [feld(10, 67), feld(73, 107), feld(140, 150), feld(151, 152), feld(160, 160) === '1' ? 1 : 0, feld(161, 168).replace(/^0+$/, '')];
}
const ziel = path.join(__dirname, '..', 'lib', 'blz-daten.json');
fs.writeFileSync(ziel, JSON.stringify({
  quelle: 'Deutsche Bundesbank – Bankleitzahlendatei',
  stand: new Date().toISOString().slice(0, 10),
  felder: ['name', 'ort', 'bic', 'pruefmethode', 'geloescht', 'nachfolge_blz'],
  banken,
}));
console.log(`${Object.keys(banken).length} Bankleitzahlen aus ${zeilen} Sätzen → ${ziel}`);
