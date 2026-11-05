'use strict';

const V = require('../lib/validation');

// Plaud-Aufnahmen → Zusammenfassung für den Telefoneingang.
// Anbieter: Mistral (EU, DSGVO) – Schlüssel nur aus der Projekt-Konfiguration
// (Secrets & Variables): MISTRAL_API_KEY. Optional: MISTRAL_ZUSAMMENFASSUNG_MODELL.
// Audiodateien werden nur im Arbeitsspeicher verarbeitet und nie gespeichert.

const API = 'https://api.mistral.ai/v1';
const TRANSKRIPTION_MODELL = 'voxtral-mini-latest';
const AUDIO = /\.(mp3|m4a|wav|ogg|opus|webm|aac|flac|mp4|amr)$/i;
const TEXT = /\.(txt|md|srt|vtt)$/i;
const MAX_TEXT = 200000;

function schluessel() {
  const k = process.env.MISTRAL_API_KEY;
  if (!k) throw new V.ValidationError('Die KI-Zusammenfassung ist noch nicht eingerichtet: Schlüssel MISTRAL_API_KEY fehlt in der Projekt-Konfiguration.', 503);
  return k;
}

function eingerichtet() {
  return !!process.env.MISTRAL_API_KEY;
}

async function anfrage(pfad, optionen, ms) {
  let res;
  try {
    res = await fetch(API + pfad, { ...optionen, signal: AbortSignal.timeout(ms) });
  } catch (e) {
    console.error(`[gespraech] Mistral ${pfad} nicht erreichbar:`, e.name === 'TimeoutError' ? 'Zeitüberschreitung' : e.message);
    throw new V.ValidationError('Der KI-Dienst ist gerade nicht erreichbar. Bitte später erneut versuchen.', 502);
  }
  if (!res.ok) {
    // Fehlertext des Anbieters nur ins Server-Log (ohne Schlüssel), dem Nutzer eine verständliche Meldung
    console.error(`[gespraech] Mistral ${pfad} antwortet ${res.status}:`, (await res.text().catch(() => '')).slice(0, 500));
    if (res.status === 401 || res.status === 403) throw new V.ValidationError('Der KI-Schlüssel (MISTRAL_API_KEY) wurde abgelehnt. Bitte in der Projekt-Konfiguration prüfen.', 502);
    if (res.status === 429) throw new V.ValidationError('Das Kontingent beim KI-Anbieter ist ausgeschöpft. Bitte später erneut versuchen.', 502);
    throw new V.ValidationError(`Der KI-Dienst meldet einen Fehler (${res.status}).`, 502);
  }
  return res.json();
}

async function transkribieren(datei) {
  const form = new FormData();
  form.append('file', new Blob([datei.buffer], { type: datei.mimetype || 'application/octet-stream' }), datei.originalname || 'aufnahme.mp3');
  form.append('model', TRANSKRIPTION_MODELL);
  form.append('language', 'de');
  const r = await anfrage('/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + schluessel() }, body: form }, 15 * 60 * 1000);
  return String(r.text || '').trim();
}

const ANWEISUNG = `Du bist Assistent in einer deutschen Hausverwaltung (WEG- und Mietverwaltung).
Fasse das folgende Gespräch für die Notiz „Telefoneingang" sachlich auf Deutsch zusammen.
Gliederung (nur Abschnitte mit Inhalt, kurze Stichpunkte, keine Einleitung):
Anliegen:
Vereinbarungen:
Rückruf / Aufgaben:
Regeln: Erfinde nichts. Namen, Daten, Beträge, Wohnungs- und Objektnummern genau übernehmen. Keine Bewertungen der Person.
Die erste Zeile ist ein kurzer Betreff (höchstens 80 Zeichen) ohne Überschrift davor.`;

async function zusammenfassen(text, kontext) {
  const r = await anfrage('/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + schluessel(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.MISTRAL_ZUSAMMENFASSUNG_MODELL || 'mistral-small-latest',
      temperature: 0.2,
      messages: [
        { role: 'system', content: ANWEISUNG },
        { role: 'user', content: (kontext ? `Bekannte Angaben: ${kontext}\n\n` : '') + 'Gespräch:\n' + text },
      ],
    }),
  }, 3 * 60 * 1000);
  const inhalt = r && r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
  if (!inhalt) throw new V.ValidationError('Der KI-Dienst hat keine Zusammenfassung geliefert.', 502);
  return String(inhalt).replace(/\*\*/g, '').trim();
}

/** SRT/VTT: Zeitstempel und Nummern entfernen, nur der gesprochene Text bleibt. */
function textAusDatei(buffer, name) {
  let t = buffer.toString('utf8').replace(/^﻿/, '');
  if (/\.(srt|vtt)$/i.test(name)) {
    t = t.split(/\r?\n/).filter((z) => z.trim() && !/^\d+$/.test(z.trim()) && !/-->/.test(z) && !/^WEBVTT/.test(z)).join('\n');
  }
  return t.trim().slice(0, MAX_TEXT);
}

/**
 * datei: multer-Datei (Arbeitsspeicher). modus: 'zusammenfassen' (KI) | 'uebernehmen' (Text unverändert, z. B. Plaud-Zusammenfassung).
 * Liefert { zusammenfassung, abschrift, quelle }.
 */
async function verarbeiten(datei, { modus = 'zusammenfassen', zustimmung, kontext } = {}) {
  if (!datei || !datei.buffer || !datei.buffer.length) throw new V.ValidationError('Keine Datei übermittelt.');
  const name = String(datei.originalname || '');
  const istAudio = AUDIO.test(name);
  const istText = TEXT.test(name);
  if (!istAudio && !istText) throw new V.ValidationError('Bitte eine Plaud-Aufnahme (mp3, m4a, wav …) oder einen Plaud-Export als Text (txt, md, srt) wählen.');
  if (istAudio && !V.bool(zustimmung)) {
    throw new V.ValidationError('Bitte bestätigen, dass der Gesprächspartner der Aufzeichnung zugestimmt hat (§ 201 StGB).');
  }
  const k = V.str(kontext, 500);
  if (istText) {
    const text = textAusDatei(datei.buffer, name);
    if (!text) throw new V.ValidationError('Die Textdatei ist leer.');
    if (modus === 'uebernehmen') return { zusammenfassung: text.slice(0, 4000), abschrift: null, quelle: 'text' };
    return { zusammenfassung: await zusammenfassen(text, k), abschrift: text, quelle: 'text' };
  }
  const abschrift = await transkribieren(datei);
  if (!abschrift) throw new V.ValidationError('In der Aufnahme wurde keine Sprache erkannt.');
  return { zusammenfassung: await zusammenfassen(abschrift, k), abschrift, quelle: 'audio' };
}

module.exports = { verarbeiten, eingerichtet, textAusDatei };
