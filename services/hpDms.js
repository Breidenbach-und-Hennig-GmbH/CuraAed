'use strict';

const { HpMobileError } = require('./hausperfektMobile');
const crypto = require('node:crypto');
const MAX_BYTES = 64 * 1024 * 1024;
const text = value => typeof value === 'string' ? value : '';
const id = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
function unwrap(value) { return value && !Array.isArray(value) && value.data && !Array.isArray(value.data) ? value.data : value; }
function datei(raw) {
  if (!raw || typeof raw !== 'object' || !id(raw.id)) throw new HpMobileError('HP hat einen ungültigen Dateieintrag geliefert.', 502);
  return {
    id: id(raw.id), containerId: id(raw.container_id), archivnummer: raw.document_container?.hp_id ?? null,
    dateinummer: raw.hp_id ?? null, titel: text(raw.file_notes) || text(raw.document_container?.comment) || text(raw.file_original_name),
    dateiname: text(raw.file_original_name), dokumentart: text(raw.document_type?.display_label) || text(raw.document_type?.name),
    datum: Number.isFinite(raw.ts) && raw.ts > 0 && raw.ts <= 253402300799 ? new Date(raw.ts * 1000).toISOString().slice(0, 10) : null,
    sachbearbeiter: text(raw.poc), buchungsjahr: raw.posting_year || null, groesse: Number(raw.file_size) || 0,
    seiten: Number(raw.pages) || 0, oeffentlich: raw.is_public === true,
  };
}
function zuordnung(art, item) {
  const building = art === 'units' ? item.building : item;
  const address = building?.address;
  const ort = [address?.street, [address?.zip, address?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  let name = text(item.name) || text(item.heading) || text(item.subject) || text(item.comment) || text(item.description);
  if (art === 'persons') name = [item.firstname, item.lastname].filter(Boolean).join(' ');
  if (art === 'buildings') name = ort || text(item.search);
  if (art === 'units') name = [item.position, ort || text(item.building?.search)].filter(Boolean).join(' · ') || text(item.searchstring);
  return { id: id(item.id), hpNummer: item.hp_id ?? null, objektNummer: art === 'units' ? item.building?.hp_id ?? null : null, name: name || 'HP-Eintrag ' + item.id };
}
const RELATIONS = { buildings: 'Liegenschaften', units: 'Einheiten', persons: 'Personen', craftsman_tasks: 'Handwerkeraufträge', records: 'Akten', cis: 'Z.I.S.', tasks: 'Wiedervorlagen', notes: 'Notizen' };

async function liste(client, { seite = 1, suche = '' } = {}) {
  if (!Number.isSafeInteger(seite) || seite < 1 || seite > 1000000 || typeof suche !== 'string' || suche.length > 200) throw new HpMobileError('Ungültige DMS-Suche oder Seitenauswahl.', 400);
  const result = await client.dmsListe({ page: seite, search: suche.trim() });
  const rows = Array.isArray(result) ? result : result?.data;
  if (!Array.isArray(rows)) throw new HpMobileError('Die HP-Dokumentliste konnte nicht gelesen werden.', 502);
  const meta = result.meta || {};
  return { dokumente: rows.map(datei), seite, gesamt: Number.isSafeInteger(meta.total) ? meta.total : null,
    weitere: Number.isSafeInteger(meta.last_page) ? seite < meta.last_page : rows.length === 25 };
}
async function details(client, fileId) {
  const raw = unwrap(await client.holen('documents', fileId));
  if (!raw || id(raw.id) !== id(fileId) || !id(raw.container_id)) throw new HpMobileError('HP hat einen ungültigen Dokumentverweis geliefert.', 502);
  const container = unwrap(await client.dmsContainer(raw.container_id));
  if (!container || id(container.id) !== id(raw.container_id)) throw new HpMobileError('HP hat eine ungültige Archivzuordnung geliefert.', 502);
  const files = Array.isArray(container.document_files) ? container.document_files : [raw];
  if (files.some(f => id(f.container_id) !== id(container.id))) throw new HpMobileError('HP hat widersprüchliche Dateizuordnungen geliefert.', 502);
  return { dokument: datei({ ...raw, document_container: container }), archivTitel: text(container.comment),
    dateien: files.map(f => datei({ ...f, document_container: container })),
    zuordnungen: Object.entries(RELATIONS).map(([key, titel]) => {
      const items = Array.isArray(container[key]) ? container[key] : [];
      return { art: key, titel, gesamt: Number(container[key + '_count']) || items.length, eintraege: items.map(item => zuordnung(key, item)) };
    }) };
}
async function download(client, fileId) {
  const raw = unwrap(await client.holen('documents', fileId));
  if (!raw || id(raw.id) !== id(fileId)) throw new HpMobileError('HP hat einen ungültigen Dokumentverweis geliefert.', 502);
  if (Number(raw.file_size) > MAX_BYTES) throw new HpMobileError('Dateien über 64 MB bitte direkt in HP-Mobile herunterladen.', 413);
  const bytes = await client.dmsDatei(fileId, MAX_BYTES);
  if (Number(raw.file_size) > 0 && bytes.length !== Number(raw.file_size)) throw new HpMobileError('Die Dateigröße stimmt nicht mit HP überein. Bitte erneut versuchen.', 502);
  for (const [algorithm, field, length] of [['md5', 'file_checksum_md5', 32], ['sha1', 'file_checksum_sha1', 40]]) {
    const checksum = text(raw[field]).toLowerCase();
    if (new RegExp('^[a-f0-9]{' + length + '}$').test(checksum) && crypto.createHash(algorithm).update(bytes).digest('hex') !== checksum) throw new HpMobileError('Die Dateiübertragung konnte nicht bestätigt werden. Bitte erneut versuchen.', 502);
  }
  let name = text(raw.file_original_name).replace(/[\\/\x00-\x1f\x7f]/g, '_').slice(0, 180);
  if (!name || /^\.+$/.test(name)) name = 'HP-Dokument-' + fileId;
  return { bytes, name };
}
module.exports = { liste, details, download, MAX_BYTES };
