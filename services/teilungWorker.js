'use strict';
// Separate process: untrusted PDFs, bounded memory and only bundled local OCR resources.
const fs = require('node:fs/promises'), path = require('node:path');
(async () => {
  const bytes = await fs.readFile(process.argv[2]);
  if (bytes.length > 25 * 1024 * 1024 || bytes.subarray(0, 5).toString() !== '%PDF-') throw Error('Bitte eine PDF bis 25 MB auswählen.');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'), base = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const loading = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true, cMapUrl: path.join(base, 'cmaps').replaceAll('\\', '/') + '/', cMapPacked: true, standardFontDataUrl: path.join(base, 'standard_fonts').replaceAll('\\', '/') + '/', wasmUrl: path.join(base, 'wasm').replaceAll('\\', '/') + '/' });
  let ocr, length = 0; const seiten = [];
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > 120) throw Error('Mehr als 120 Seiten. Bitte die Teilungserklärung in zusammengehörige Dokumente aufteilen.');
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n), content = await page.getTextContent(), rows = new Map();
      for (const item of content.items) {
        if (!item.str) continue;
        const y = Math.round(item.transform[5] / 3) * 3;
        if (!rows.has(y)) rows.set(y, []); rows.get(y).push(item);
      }
      let text = [...rows].sort((a, b) => b[0] - a[0]).map(([, r]) => r.sort((a, b) => a.transform[4] - b.transform[4]).map(x => x.str).join(' ')).join('\n'), confidence = null, methode = 'PDF-Text';
      if (text.replace(/\s/g, '').length < 150) {
        const canvas = require('@napi-rs/canvas');
        if (!ocr) { const { createWorker } = require('tesseract.js'), model = require('@tesseract.js-data/deu'); ocr = await createWorker('deu', 1, { langPath: model.langPath, cacheMethod: 'none', errorHandler: () => {} }); }
        const raw = page.getViewport({ scale: 2.2 }), scale = Math.min(2.2, 2.2 * Math.sqrt(3500000 / (raw.width * raw.height))), viewport = page.getViewport({ scale }), image = canvas.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvasContext: image.getContext('2d'), viewport }).promise;
        const r = await ocr.recognize(image.toBuffer('image/png')); text = r.data.text; confidence = r.data.confidence; methode = 'Lokale OCR';
      }
      length += text.length;
      if (length > 400000) throw Error('Der Dokumenttext ist zu umfangreich. Bitte in zusammengehörige Dokumente aufteilen.');
      seiten.push({ seite: n, text, methode, konfidenz: confidence });
      process.send?.({ fortschritt: n, gesamt: pdf.numPages }); page.cleanup();
    }
    process.send?.({ ergebnis: seiten });
  } finally { if (ocr) await ocr.terminate(); await loading.destroy(); }
})().catch(e => process.send?.({ fehler: /120 Seiten|zu umfangreich|PDF bis/.test(e.message) ? e.message : 'PDF konnte nicht vollständig gelesen werden. Bitte Verschlüsselung und Lesbarkeit prüfen.' }));
