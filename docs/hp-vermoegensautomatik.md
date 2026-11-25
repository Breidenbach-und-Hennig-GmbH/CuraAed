# Vermögensstatus: automatische Verarbeitung in CuraAed

Die CuraAed-Seite verarbeitet vollständige, normalisierte HP-Abrechnungsstände automatisch und speichert die erzeugten Excel-Dateien unveränderlich. Sie fragt HausPerfekt **nicht** ab. Es gibt keinen Hintergrundlauf, keine neuen Zugangsschlüssel und keine Änderung an der HP-Anlage.

Die Live-Abholung und der Adapter vom nativen HP-Datenmodell sind noch nicht angeschlossen. Zuerst müssen der Datenbankzugang und die fachliche Freigabe eines Abrechnungslaufs geklärt werden. Insbesondere sind `Abrechnung_abschlies`, `StapelErz` und ein Druckdatum allein keine verifizierte Freigabe. Der Diagnosebericht ist kein vollständiger Vermögensstand und wird nicht als solcher importiert.

## Bedienung

Objekt → Kontenrahmen → Vermögensstatus → **HP-Automatik · alle Objekte**. Das Fenster zeigt ein Buchungsjahr, eine Suche per Objektnummer/Name und rechts die schmale Knopfleiste. Alle angemeldeten Benutzer können die Übersicht und fertige Excel-Dateien sehen. Nur Administratoren dürfen Exportstände einlesen.

Nach Eingang eines vollständigen freigegebenen Stands erfolgen Prüfung und Excel-Erzeugung ohne weitere manuelle Betragseingabe. Mehrere Dateien werden in Gruppen von höchstens 20 verarbeitet. Fehler werden je Stand angezeigt; fehlerfreie andere Objekte bleiben davon unabhängig. ZIP enthält die aktuell fertigen Stände des gewählten Jahres. Ist der neueste Stand eines Objekts unvollständig, ist dessen früherer Bericht weiterhin ausdrücklich als **Vorherige Excel** abrufbar, jedoch nicht unbemerkt im aktuellen Paket enthalten.

## Vertrag für den künftigen HP-Adapter

Dies ist ein CuraAed-Übergabeformat, kein bereits verfügbarer nativer HausPerfekt-Export. Pro Objekt/Jahr wird eine JSON-Datei `curaaed-hp-vermoegensstand-v1` übergeben (maximal 256 KB).

- `verbindung_id`: vorhandene CuraAed-HP-Quellenkennung. Keine Zugangsdaten.
- `datenbank`: exakte Datenbankkennung dieser Quelle.
- `objektnummer`, `jahr`, `laufnummer`: positive ganzzahlige HP-Kennungen.
- `stand_am`: UTC-Zeitpunkt des vollständigen Exports, z. B. `2026-03-17T10:00:00.000Z`.
- `zeitraum`: `von` und `bis`, genau das vollständige Kalenderjahr.
- `abschluss`: `bestaetigt` muss ausdrücklich boolean sein. Bei true sind `am`, `sha256` und `position` eines Quellnachweises vom Typ `abschluss` erforderlich. Der Adapter darf diesen Nachweis nicht aus einem beliebigen Druckkennzeichen erfinden.
- `quellen`: Liste mit `typ`, `name`, `sha256`. Typen: `abrechnung`, `konten`, `abgrenzungen`, `vermoegen`, `abschluss`. SHA-256 als 64 kleingeschriebene Hex-Zeichen. Abrechnung und Konten sind erforderlich.
- `konten`: vollständiger relevanter Kontenbestand mit `konto`, `art` (`S`, `B`, `A`), `bezeichnung`, `saldo_cents` und für Girokonten `eb_cents`. Geldbeträge sind ganze Cent mit Soll-minus-Haben-Vorzeichen; keine gerundeten Fließkomma-Salden.
- `kontorollen`: Arrays `giro_konto`, `spar_konto`, `ruecklage_konto`. Mehrere Konten je Rolle sind möglich. Ein explizit leeres Array bedeutet, dass diese Rolle nicht vorhanden ist; Giro muss belegt sein. Ein Konto darf keiner zweiten Rolle zugeordnet sein. Nicht zugeordnete Bankkonten mit Saldo sperren die Fertigstellung.
- `werte`: die übrigen Felder aus `lib/vermoegensstatusFelder.json`, als belegte EUR-Beträge. Giro-/Spar-/Rücklagenbestände und Giro-Anfangsbestand werden aus den Konten berechnet. Bereits mitgelieferte widersprüchliche Beträge werden abgewiesen.
- `nachweise`: je verwendetem nicht abgeleitetem Feld bzw. Kontorolle ein Objekt mit `sha256` einer mitgelieferten Quelle und `position` (konkretes Feld, Zeile oder Position). Auch eine belegte Null braucht einen Nachweis.

Fehlende Vermögenswerte und Abgrenzungen bleiben fehlend. Der optionale Sicherheitseinbehalt darf ausdrücklich unbekannt bleiben. Es werden keine Nullwerte aus Leerstellen, Standardkontonummern oder Vorjahreswerten geraten.

## Prüfung und Speicherung

Die Zuordnung erfolgt nur über vorhandene Kombinationen aus Quellenkennung, Datenbank und HP-Objektnummer. Es entstehen keine neuen Objekte oder Konten. Ein wiederholt eingehender gleicher Stand erzeugt keine zweite Version. Ältere und zum selben Zeitpunkt widersprüchliche Stände werden nicht als neue fertige Berichte ausgegeben. Alle Eingänge mit gültiger Objektzuordnung sind mit Quellen, Prüfergebnis und Benutzer nachvollziehbar gespeichert.

Giroabgleich und Vorlagenabstimmung müssen null sein. Der bereits übernommene Vorjahrsrest bleibt separat sichtbar. Die Rundungsdifferenz zwischen Kontenergebnis und verteilten Eigentümerguthaben bleibt separat ausgewiesen. Fehlende lokale CuraAed-Buchungen werden nicht als bestätigter Nullsaldo oder erfolgreicher Kontenabgleich dargestellt. Die bisherigen manuell geprüften Berichte werden nicht überschrieben. Es entstehen keine Buchungen oder Vorschüsse.

## Schnittstellen

- `GET /api/vermoegensstatus/hp-staende?jahr=2025`: Übersicht; ausdrücklich `live_abholung:false`.
- `POST /api/vermoegensstatus/hp-staende`: nur angemeldete Administratoren; `{ "staende": [ ... ] }` mit 1–20 Ständen. Ergebnisse pro Objekt.
- `GET /api/vermoegensstatus/hp-staende/excel/:id`: fertige, unveränderliche Excel-Version.
- `GET /api/vermoegensstatus/hp-staende/paket?jahr=2025`: ZIP mit den aktuell fertigen Objektberichten, begrenzt auf 64 MB; größere Bestände einzeln herunterladen.

Die Schnittstellen verwenden die vorhandene Anmeldung. Ein späterer autonomer Connector braucht eine gesondert freigegebene, eng begrenzte Authentifizierung. Vorhandene Adress- oder Objektimportschlüssel werden hierfür nicht umgewidmet.
