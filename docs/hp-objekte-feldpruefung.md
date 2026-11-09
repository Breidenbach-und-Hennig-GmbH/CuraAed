# Vorprüfung aktueller HP-Objekte

Auftrag: zuerst tatsächlich vorhandene HP-Felder mit CuraAed vergleichen, dann ausschließlich aktuelle Objekte samt Einheiten, Personenkonten und Verteilerschlüsseln synchronisieren. Beendete Objekte nicht neu übernehmen. Die Objektübernahme ist noch nicht implementiert oder aktiviert.

## Belegter CuraAed-Stand

| Bereich | Vorhandene Strukturen | Schon erkennbare offene Voraussetzungen |
| --- | --- | --- |
| Objekte | Nummer, Bezeichnung, WEG/Miete, Anschrift, Baujahr, Objektart, Büro-KST, Sachbearbeiter, fünf Gruppen, technische Merkmale, Anzahl Gebäude/Eingänge, Verkauf/Vermietung, Notizen, archiviert | Kein geprüftes HP-Verwaltungsbeginn/-ende oder Bestandskennzeichen. Keine feste HP-Objektverknüpfung, HP-Version oder Importbasis. |
| Einheiten | Objekt, Nummer, Bezeichnung, Typ, Lage, Fläche, Zimmer, MEA, Notizen, archiviert | HP-Objekt-/Einheitsschlüssel und deren Gültigkeit ungeprüft. Weitere HP-Flächen-/Stammdatenfelder unbekannt. |
| Personenkonten | Zuordnung zu Personenfunktion/Einheit/Adresse, Kontonummer, Referenz, Sachbearbeiter, Bemerkung; zeitabhängige Sollwerte | HP-Originalschlüssel, Wechselnummern, Kontenstatus, Buchungsbezüge und vollständige Feldabdeckung ungeprüft. Keine automatischen Finanzbuchungen. |
| Verteilerschlüssel | Objekt, Kürzel, Bezeichnung, Gesamtanteil, Bemerkung; Anteil je Einheit | HP-Schlüsseldefinitionen, Nachkommastellen, Gültigkeitszeiträume und Berechnungsverfahren ungeprüft. REAL/Float in CuraAed muss vor finanzieller Rückschreibung gegen HP-Präzision geprüft werden. |

Diese Liste benennt den belegten lokalen Stand, noch keinen vollständigen HP-Feldvergleich. Ein fehlendes HP-Feld darf erst nach tatsächlicher Metadaten-/Maskenprüfung als solches bezeichnet werden.

## Nächster lesender Prüfschritt

`HP-Strukturpruefung.exe` liest ausschließlich `X$File`/`X$Field` des Zen-Datenkatalogs, prüft die ODBC-Datenbankbindung und speichert Tabellenname, Feldname, Typ, Breite und Offset als lokale JSON-Datei. Keine Datensätze aus Objekten, Personenkonten oder Banken, keine SQL-Änderungen, kein Dienst, kein Internetversand. Ziel HPSD/HPSERVSD ist sichtbar und änderbar; Benutzer entscheidet über Start und Speicherort. Bericht anschließend ausdrücklich zur Auswertung bereitstellen.

Nach Vorliegen des Berichts: relevante Tabellen/Beziehungsschlüssel bestimmen, HP-Maskenlabels und Statusbedeutung prüfen, Feldmatrix vorhanden/fehlend/mehrdeutig erstellen, fehlende CuraAed-Felder samt Validierung ergänzen. Erst danach Importfilter für aktuelle Objekte freigeben. Datumsfelder allein sind kein Nachweis der fachlichen Bedeutung.

## Regeln für den späteren Abgleich

- Status/Laufzeit in HP verifizieren, kein Raten anhand Nummern oder Namen.
- Kinder nur über ihre verifizierte Objektbindung übernehmen; keine Daten beendeter Objekte durch globale Einheit-/Kontenimporte einschleusen.
- Neue und geänderte Daten statt wiederholter vollständiger Übertragung; HP-Änderungsjournal/Revision prüfen. Ohne Änderungsmarker lokale Fingerabdruckprüfung ehrlich ausweisen.
- Datensatz wird nach Verwaltungsende in CuraAed sichtbar deaktiviert, nicht stillschweigend gelöscht. Ob die historische Anzeige gewünscht ist, vor Implementierung klären.
- Keine automatische Löschung oder Finanzbuchung. Konflikt-/Unklarheitsregeln und rücklesbare Ergebnisse wie beim Adressabgleich.
- Personenfunktionen, Telefon, ZIS und Adress-/Objektbankdaten als separate verknüpfte Strukturen prüfen; bestehende leere Masken sind keine Aussage über den HP-Bestand.

