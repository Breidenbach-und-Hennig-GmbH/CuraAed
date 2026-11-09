'use strict';

// Vorbereitete Statusauswertung, noch nicht an einen Objektimport angeschlossen.
// Belegt in HPSERVSD: 4010 => FI_beendet=0, 4020 => 737424 / 31.12.2019.
// Der Connector muss die Datenbankbindung und den vorhandenen FI_Obj-Satz prüfen.
// Kein COALESCE(...,0): eine fehlende FiBu-Zuordnung ist kein aktiver Status.
const DAY_MS=86400000;
const FIRST_DAY_MS=-62135596800000; // 0001-01-01T00:00:00.000Z
const MAX_ORDINAL=3652059; // 9999-12-31

function ordinalDatum(value) {
  if(!Number.isInteger(value)||value<1||value>MAX_ORDINAL) throw new RangeError('Ungültiges HP-Ordinaldatum.');
  return new Date(FIRST_DAY_MS+(value-1)*DAY_MS).toISOString().slice(0,10);
}

function pruefeStichtag(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'0001-01-01') throw new RangeError('Gültigen Stichtag als JJJJ-MM-TT angeben.');
  const date=new Date(value+'T00:00:00.000Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value) throw new RangeError('Ungültiger Stichtag.');
}

/** Keine automatische Änderung oder Löschung. Stichtag muss der Aufrufer fachlich festlegen. */
function bewerteObjektstatus(fiBeendet,stichtag) {
  pruefeStichtag(stichtag);
  if(!Number.isInteger(fiBeendet)||fiBeendet<0||fiBeendet>MAX_ORDINAL) {
    return {status:'unklar',beendet_am:null,importierbar:false,grund:'HP-Beendigungswert fehlt oder ist ungültig.'};
  }
  if(fiBeendet===0) return {status:'aktiv',beendet_am:null,importierbar:true,grund:null};
  const datum=ordinalDatum(fiBeendet);
  if(datum<stichtag) return {status:'beendet',beendet_am:datum,importierbar:false,grund:null};
  // Ob HP eine heutige/künftige Beendigung bereits ausschließt, ist noch nicht geprüft.
  return {status:'beendigungsdatum_zu_pruefen',beendet_am:datum,importierbar:false,grund:'HP-Beendigungsdatum liegt am oder nach dem Stichtag; fachliche Regel prüfen.'};
}

module.exports={ordinalDatum,bewerteObjektstatus};
