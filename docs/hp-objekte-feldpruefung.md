# HausPerfekt → CuraAed: Ergebnis der Strukturprüfung

Stand: 9. November 2026. Quelle ist der vom Benutzer bereitgestellte lokale Metadatenbericht für HPSERVSD, Format `curaaed-hp-metadata-v1`. Es wurden keine HP-Datensätze geändert. Der inzwischen implementierte lesende Objektimport ist in [hp-objektimport.md](hp-objektimport.md) beschrieben; Freigabe und erster Lauf auf dem HP-Server stehen noch aus.

Der Bericht enthält 1.044 Tabellen mit 14.451 Definitionen. Davon sind 2.376 Definitionen vom Typ 255; sie sind nicht als normale Datenfelder in die Vergleichsmatrix eingegangen. Für die angefragten Bereiche wurden 320 Felder aus 19 Tabellen gegen 14 lokale CuraAed-Tabellen einschließlich ausgeführter Datenbankmigrationen geprüft.

Die Dateien `HP-CuraAed-Feldmatrix.csv` und `.json` enthalten Feldnamen, HP-Typcode, Breite, Offset, mögliche lokale Zielfelder und Prüfhinweise. Ein passendes Zielfeld beweist weder identische Fachbedeutung noch einen bereits implementierten Abgleich. „Fehlt oder gesondert zu prüfen“ ist keine Anzahl zwingend neu anzulegender Spalten: darunter fallen auch Quellschlüssel, Ableitungen und fachlich noch ungeklärte Felder.

## Nachgewiesene Lücken im Ausgangsstand

Die folgende Tabelle und die lokale Feldmatrix beschreiben den Ausgangsstand vor Migration 5. Die inzwischen ergänzten Strukturen für Objekte, Einheiten, Konten und Jahresverteilung sind in [hp-datenstrukturen.md](hp-datenstrukturen.md) beschrieben. Das ist noch keine vollständige Masken- oder Importanbindung.

| Bereich | Beleg in HP | Konsequenz für CuraAed |
| --- | --- | --- |
| Objekte | `OB_Obj` führt zusätzliche Objektkennungen, Gebäudebezeichnung, zweite Straßenzeile, Team und Buchhalterkürzel. `FI_ObjBJ` führt Jahresperioden. | Quellbindung je Kundenbestand ergänzen; HP-Codes und Verantwortliche zuordnen; Jahresperioden separat abbilden. `archiviert` ersetzt keinen geprüften HP-Verwaltungsstatus. |
| Einheiten | `WG_Wohnung` enthält Gebäude-/Bauteilbezug, zusätzliche Nutzungsmerkmale sowie `gilt_bis_Datum`, `BindBis` und `Datum_Frei`. | Verbundschlüssel aus Objekt und Einheit, Gebäude-/Bauteilbezug, Status- und Gültigkeitsfelder fehlen. Datumscodierung und Leerwerte sind noch zu prüfen. |
| Personenfunktionen | `PF_PFkt` enthält `lfdNrDatensatz`, Inaktivitätsmerkmale, Firmen-/Kontobezüge und Optionszeiträume. | Lokale Rollen mit Beginn/Ende und `pfkt_code` reichen für eine verlustfreie Zuordnung nicht aus. Originalkennung und Status erhalten. |
| Personenkonten | `PK_Pkto` führt eigene Adress-/Einheitenbezüge, Kontoname und Aktenzeichen; `PK_Sollstellung` führt weitere Kontierungs-, Steuer-, Gültigkeits- und Änderungsfelder. | Direkte HP-Kontozuordnung ergänzen. Die lokale eindeutige Bindung eines Kontos an eine Rollen-Zuordnung muss gegen HP-Kardinalität geprüft werden. Keine automatischen Buchungen auslösen. |
| Verteilerschlüssel | `OB_VSchl.BJ`, `WG_VSchl.Buchungsjahr`, `PK_VSchl.BJ`; zusätzlich personenbezogene Zeit-/Jahresanteile in `PK_VSchlPers` und `PK_VSchlPersBJ`. | **Vor Import erforderlich:** Jahr in Schlüsselidentität und Anteilen erhalten. Eigene Kontenanteile und zeitabhängige Personenanteile ergänzen. Der aktuelle lokale Schlüssel `(Objekt, Kürzel)` würde mehrere Jahre zusammenfallen lassen. |
| Telefonnummern | `AD_TelNr` ist vorhanden, mit laufender Zeilennummer, Telefontext, Nummer, Bemerkung und Kurzwahl. | Lokale Telefonmaske existiert, HP-Übernahme noch nicht. Stabile Zeilenkennung und Zuordnung freier HP-Telefontexte ergänzen. |
| Bankverbindungen | `AD_Bankverb`, `OB_BV` und separate `AD_SEPA_Mandat` sind vorhanden. | HP-Bankkennung, Freigabe-/Aktivitätsstatus und mehrere Mandate je Bankverbindung erhalten. Ein einzelnes lokales Mandatsfeld ersetzt keine Mandatshistorie. |
| ZIS | `ORG_ZIS` führt Objekt-, Einheiten-, Adress-, Akten-, Konten- und weitere Bezüge; `Info` hat Typcode 13 und Breite 2402. | Allgemeine ZIS-Verknüpfung erforderlich: die lokale Pflichtadresse passt nicht zu reinen Objekt-/Akteneinträgen. Memoformat, Zeitpunkt, Originalkennung und Notizarten prüfen. |

## Nur aktuelle Objekte

Vom Benutzer benannte und am 9. November 2026 lesend in der HP-Oberfläche geprüfte Vergleichsobjekte:

- **4010:** unter „nur aktive“ gefunden; Spalte „Beendet am“ leer. Die Objektmaske zeigt kein Beendigungsdatum.
- **4020:** unter „nur beendete“ gefunden; Spalte „Beendet am“ zeigt `31.12.19`. Nach Öffnen bestätigt die Objektmaske in roter Schrift „Beendet am: 31.12.19“ (31. Dezember 2019).

Der anschließend vom Benutzer bereitgestellte Bericht `curaaed-hp-object-status-v1` bestätigt die Rohwerte für HPSERVSD (erstellt am 9. November 2026 um 20:04:33 UTC):

| Objekt | HP-Anzeige | `OB_Obj.anzeigen_ja_nein` (BIT) | `FI_Obj.FI_beendet` (INTEGER) |
| --- | --- | --- | --- |
| 4010 | aktiv, kein Enddatum | false | 0 |
| 4020 | beendet am 31.12.2019 | false | 737424 |

`anzeigen_ja_nein` unterscheidet die geprüften Status nicht und wird nicht als Aktivfilter verwendet. `FI_beendet` ist der durch beide Beispiele gestützte Status-/Datumsbezug. 737424 entspricht dem Gregorianischen Ordinaltag 31.12.2019 (Tag 1 = 01.01.0001), passend zur HP-Anzeige. Diese Zuordnung ist bei diesem Feld/Beispiel belegt, nicht pauschal für jedes INTEGER-Feld in HP.

`lib/hpObjektstatus.js` bereitet die Auswertung vor: exakt numerische 0 als aktiv; vergangenes gültiges Ordinaldatum als beendet; fehlende/falsch typisierte Werte sowie heutige/künftige Beendigungen bis zur fachlichen Klärung vom Import zurückstellen. Ein fehlender `FI_Obj`-Datensatz darf nicht durch `COALESCE(...,0)` als aktiv erscheinen. Die Auswertung verändert keine Daten und ist noch an keinen Live-Import angeschlossen. Beendigung am Stichtag, geplante Beendigung und abweichende Kundeninstallationen sind durch diese zwei Datensätze nicht verifiziert.

Die Suche funktioniert über „Suche“ und direkte Eingabe der Nummer mit Zifferntasten; Einfügen per Zwischenablage löst in dieser Liste keine Nummernsuche aus.

`OB_Obj.NICHT_VERWENDET` wird nicht als Enddatum interpretiert. `CON_OB_Obj.beendet_am` liegt in einer anderen Tabelle und ist ohne belegte Datenpflege keine verlässliche Grundlage für den Stammobjektfilter. Auch das Einheitenfeld `gilt_bis_Datum` ist kein Beweis für ein Ende der Objektverwaltung.

Kinder dürfen nur über die zugelassenen aktuellen Elternobjekte importiert werden. Kein globaler Einheiten-/Kontenimport, der beendete Objekte indirekt wieder einschleust. Bereits lokal vorhandene Daten nicht automatisch löschen. Eine spätere Beendigung muss als überprüfbarer Statuswechsel behandelt werden.

## Neue und geänderte Daten

Die vorhandene Adresslösung überträgt nach Fingerabdruckvergleich nur neue/geänderte vollständige Adressdatensätze. Die Quelle wird weiterhin lokal gescannt; ein verifiziertes HP-Änderungsjournal ist dafür noch nicht nachgewiesen.

Für weitere Bereiche gilt: je Kundenbestand und Entität stabile HP-Schlüssel, letzte gelesene Basis, Fingerabdruck/Revision sowie Konfliktzustand dauerhaft speichern. Geänderte Felder müssen gegen diese Basis verglichen werden; Wiederholung und Neustart dürfen keine Duplikate erzeugen. Rückschreibungen brauchen bestätigten Schreibumfang, Konkurrenzprüfung und Rücklesen.

`SY_AenderungsProtoko` und spezifische Änderungsfelder sind Prüfkandidaten. Vollständigkeit, Aufbewahrung und eindeutige Reihenfolge sind noch unbewiesen. Die Tabelle namens `CDC` enthält Telefonie-Felder und belegt kein allgemeines Änderungsprotokoll. Fehlende Datensätze bei einem unvollständigen Lauf sind kein Löschsignal.

## Bestehende Importfehlermeldungen

Frühere Meldungen zu `anrede` und `name1` sind durch den Metadatenbericht nicht behoben. Er enthält keine Feldwerte, mit denen sich konkrete Steuerzeichen, Zeichenkodierungsprobleme, Überlängen oder Fehlzuordnungen nachweisen lassen. Fehler einzeln mit HP-Nummer und Ursache sichtbar halten; keine stillschweigende Kürzung oder Bereinigung der HP-Quelldaten. Ein isolierter Datensatzfehler darf weitere gültige Datensätze nicht blockieren.

## Reihenfolge der Umsetzung

1. Status-/Datumszuordnung für 4010/4020 ist belegt und als isolierte Auswertung mit Regressionstests vorbereitet. Weitere Datum-/Zahlenformate und relevante HP-Schlüsseltabellen vor deren Import prüfen; heutige/künftige Beendigungen nicht ungeprüft freigeben.
2. Fehlende lokale Strukturen und Quellbindungen mit rückwärtsverträglichen Migrationen ergänzen; vorhandene lokale Daten und Adresskopplungen erhalten.
3. Zuerst lesenden Import aktueller Objekte mit Einheiten, Funktionen, Konten und jahresbezogenen Verteilerschlüsseln prüfen. Bank- und ZIS-Strukturen separat verifizieren.
4. Änderungsabgleich, Konflikte und Wiederanlauf prüfen; Rückschreibungen nur nach feldbezogener Prüfung aktivieren. Keine Finanzbuchungen oder Mandatsaktionen durch Stammdatenabgleich.

## Nachweis und Grenzen

SHA-256 des unveränderten Eingangsberichts:
`aa7d2c8dea288bc62a4efbdd517332d94e98c244430471d8c5b47afe5ca57956`

SHA-256 des unveränderten ergänzenden Statusberichts:
`83908b7bc2434a867e28ba667cf1c3ba5e73e66fce1d81bc20e725682713ff46`

Die Feldmatrix wurde lokal erzeugt; alle dort benannten CuraAed-Zielfelder wurden gegen eine leere, vollständig migrierte lokale Datenbank geprüft. Der Originalbericht wurde nicht in GitHub hochgeladen. Es erfolgte keine Änderung am laufenden HP- oder CuraAed-Datenbestand. Die Prüfung belegt Strukturunterschiede, keine bereits abgeschlossene Synchronisierung oder verifizierte fachliche Schreibregeln.
