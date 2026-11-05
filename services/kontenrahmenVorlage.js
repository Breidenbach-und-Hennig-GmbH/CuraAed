'use strict';

// Standard-Kontenrahmen für eine kleine WEG – übernommen aus der Summen- und
// Saldenliste eines typischen HausPerfekt-Objekts (8 Einheiten, BJ 2025).
// Im Ausdruck abgeschnittene Bezeichnungen wurden sinngemäß vervollständigt,
// objektbezogene Angaben (z. B. Sparkonto-Nummer) entfernt.
// Kontoart: S = Sachkonto, B = Bankkonto, A = (lt. Liste bei „Offene Forderungen Rücklage").
const STANDARD_WEG = [
  [1200, 'S', 'Heizkosten Gesamtobjekt'],
  [1210, 'S', 'Schornsteinfeger'],
  [1220, 'S', 'Wartungen'],
  [1230, 'S', 'Ablesekosten'],
  [1390, 'S', 'Wasser'],
  [1391, 'S', 'Kanal'],
  [1392, 'S', 'Wasser lt. Zähler'],
  [1393, 'S', 'Kanal lt. Zähler'],
  [1400, 'S', 'Müllgebühren'],
  [1410, 'S', 'Straßenreinigung Winterdienst'],
  [1500, 'S', 'Allgemeinstrom'],
  [1600, 'S', 'Pflege der Außenanlagen'],
  [1800, 'S', 'Wartung Feuerschutzeinrichtung'],
  [1890, 'S', 'Dachwartung / Reinigung'],
  [2100, 'S', 'Gebäudeversicherung'],
  [2200, 'S', 'Haftpflichtversicherung'],
  [4000, 'S', 'Verwalter-Honorar'],
  [4400, 'S', 'Kontoführungskosten Bankkonten'],
  [5000, 'S', 'Reparaturen: Gebäude Gesamtobjekt'],
  [5600, 'S', 'Geräteanschaffungen'],
  [6600, 'S', 'Zuführung zur Rücklage Gesamtobjekt'],
  [6900, 'S', 'Sonstige Bewirtschaftungskosten'],
  [6910, 'S', 'CO2-Kosten Vermieter'],
  [8100, 'B', 'WEG Girokonto 1'],
  [8110, 'B', 'Zuwachssparen (Rücklagenkonto)'],
  [8600, 'S', 'Rücklagen Gesamtobjekt'],
  [9250, 'S', 'SK: Instandhaltungsrücklage'],
  [9311, 'S', 'SK: Betriebskosten-VZ (Eigentümer)'],
  [9399, 'S', 'SK: autom. Sollst. AR-Ergebnis Vorjahr'],
  [9401, 'S', 'AGK Verbindlichkeiten allgemein'],
  [9413, 'S', 'AGK Abgerechnete Sachkonten'],
  [9430, 'S', 'AGK Forderungen nächstes Jahr'],
  [9431, 'S', 'AGK Verbindlichkeiten nächstes Jahr'],
  [9433, 'S', 'AGK Ford. (Verbindlich.) Vorjahr'],
  [9435, 'S', 'AGK Verb. (Forderungen) Vorjahr'],
  [9900, 'S', 'IBK: Behördengebühren'],
  [9901, 'S', 'IBK: EVL Strom / Wasser / Gas'],
  [9910, 'S', 'IBK: Sturmschaden Rollo'],
  [9920, 'S', 'IBK: Sammelkonto für Rücklagen-Zinsen'],
  [9930, 'A', 'IBK: Offene Forderungen Rücklage'],
  [9991, 'S', 'IBK: Umbuchungen von Bank zu Bank'],
  [9993, 'S', 'IBK: Sammelbuchungen aus Personenkonten'],
  [9995, 'S', 'IBK: MCV (Maschinelles Clearing-Verfahren)'],
];

module.exports = { STANDARD_WEG };
