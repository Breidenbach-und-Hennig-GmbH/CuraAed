'use strict';
const { mobileAktiv } = require('../lib/hpMobileBetrieb');

// Only CuraAed metadata. No token decryption, network or ERP connection.
async function bestandsbericht(db) {
  const quellen = await db.all(`SELECT s.id, s.subdomain, s.direkt_id,
    COUNT(f.datei_id) AS erfasst,
    SUM(CASE WHEN f.speicher_name IS NOT NULL AND f.speicher_name<>'' THEN 1 ELSE 0 END) AS als_gesichert_vermerkt,
    SUM(CASE WHEN f.datei_id IS NOT NULL AND (f.speicher_name IS NULL OR f.speicher_name='') THEN 1 ELSE 0 END) AS ohne_dateikopie,
    SUM(CASE WHEN f.fehler IS NOT NULL AND f.fehler<>'' THEN 1 ELSE 0 END) AS mit_fehlermeldung,
    SUM(CASE WHEN f.speicher_name IS NOT NULL AND f.speicher_name<>'' AND (f.sha256 IS NULL OR length(f.sha256)<>64) THEN 1 ELSE 0 END) AS ohne_pruefsumme
    FROM hp_dms_quellen s LEFT JOIN hp_dms_dateien f ON f.quelle_id=s.id
    GROUP BY s.id ORDER BY s.subdomain,s.id`);
  const summen = quellen.reduce((s, q) => {
    for (const key of Object.keys(s)) s[key] += Number(q[key]) || 0;
    return s;
  }, { erfasst: 0, als_gesichert_vermerkt: 0, ohne_dateikopie: 0, mit_fehlermeldung: 0, ohne_pruefsumme: 0 });
  const offeneAuftraege = await db.all(`SELECT quelle_id,status,seite,position FROM hp_dms_auftraege WHERE status<>'fertig' ORDER BY quelle_id`);
  return {
    erstellt_am: new Date().toISOString(), mobile_aktiv: mobileAktiv(),
    umfang: 'Alle in CuraAed erfassten HP-Archivquellen; keine Abfrage von HausPerfekt.',
    vollstaendigkeit_bestaetigt: false, dateien_physisch_geprueft: false,
    hinweis: 'Gesichert bedeutet hier nur: in der Datenbank vermerkt. Dateiprüfung und Vergleich mit dem vollständigen HP-Bestand stehen separat aus. Noch nicht erfasste Dokumente sind nicht mitgezählt.',
    summen, quellen, offene_auftraege: offeneAuftraege,
  };
}
module.exports = { bestandsbericht };
