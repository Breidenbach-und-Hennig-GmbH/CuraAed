# Datenmodell für den späteren HP-Objektabgleich

Stand: 9. November 2026. Migration `user_version=5`, implementiert in `db/hpStrukturen.js`. Diese Erweiterung schafft die Speicherstrukturen; sie startet keinen HP-Import und erteilt keine zusätzlichen Connector-Rechte. Die bestehenden Masken verwenden weiterhin ihre bisherigen Felder und undatierten Verteilungswerte. Die Jahresauswahl und Übertragung werden separat angeschlossen.

## Ergänzte Bereiche

| Bereich | Neue Struktur |
| --- | --- |
| Objekte | Originale HP-Typ-/Mitarbeiter-/Teamcodes getrennt von lokalen Benutzer-IDs, Alias, HP-Objektkennung, Gebäudebezeichnung, zweite Straßenzeile; `objekt_gebaeude` und `objekt_buchungsjahre` mit Jahresperioden. |
| Einheiten | Gebäude-/Bauteilindex, HP-Typ-/Verwaltungs-/Schlüsselcodes, Nutzungsmerkmale, Bindungs- und Gültigkeitsende, freie Datumsangabe, Garage/Stellplatz sowie zusätzliche Dezimaltextfelder für Fläche und MEA. Noch ungeprüfte Quellbedeutungen bleiben nullable. |
| Personenfunktionen | Firmen-/Typ-/Steuercodes, Mieter-Kontonummer, Inaktivität, Mobile-Ende und Optionszeiträume. Stabile HP-Zeilenzuordnung separat. |
| Personenkonten | Direkte Adresse und Einheit, Kontoname und Aktenzeichen. Der bisherige Hauptbezug `zuordnung_id` bleibt eindeutig, darf aber fehlen. `personenkonto_funktionen` ermöglicht zusätzliche Zuordnungen; mehrere HP-Konten können dieselbe Funktion referenzieren. Es werden keine künstlichen Rollen erzeugt. |
| Sollwerte | Ergänzende Kontierungs-, Steuer-, Gültigkeits- und Änderungsangaben; zusätzliche Dezimaltextfelder erhalten Werte ohne zusätzliche REAL-Rundung. Bestehende Netto-/Bruttowerte und deren Berechnung bleiben erhalten. Keine Finanzbuchungen. |
| Verteilerschlüssel | `verteilerschluessel_jahre` mit Jahr, Bezeichnung, Gesamtanteil und HP-Schlüsselarten. Eigene Jahresanteile für Einheiten und Personenkonten; zeitabhängige Personenwerte mit ursprünglichem HP-Datumswert. |

Die bestehenden Tabellen `verteilerschluessel` und `einheit_verteilung` bleiben unverändert. Undatierte Altdaten werden keinem geratenen Buchungsjahr zugeordnet. Ein Schlüssel wird weiterhin je Objekt/Kürzel geführt; seine voneinander getrennten Jahresstände liegen in der Kindtabelle. Jahresanteile müssen auf den konkreten Jahresstand und auf eine Einheit/ein Konto desselben Objekts zeigen. Dezimalwerte werden als Zeichenfolgen mit Punkt gespeichert; Steuerzeichen, Exponenten und ungültige Zahlformen werden abgewiesen. Die spätere Quellkonvertierung muss HP-Präzision und Formate prüfen und Dezimaltext vor der Übergabe erzeugen.

## Kundenbestand und Quellschlüssel

`hp_objekt_zuordnung`, `hp_einheit_zuordnung`, `hp_personenkonto_zuordnung`, `hp_personenfunktion_zuordnung` und `hp_verteilerschluessel_zuordnung` binden lokale Datensätze an die bestehende HP-Kundenverbindung. Die Objektbindung umfasst Verbindung und HP-Objektnummer; Kinder enthalten zusätzlich die HP-Einheiten-/Konten-/Zeilenkennung beziehungsweise Buchungsjahr und Schlüsselcode.

Gleiche HP-Nummern in unterschiedlichen Verbindungen sind erlaubt. Eine lokale Entität kann dabei nur einer HP-Quelle zugeordnet werden. Zusammengesetzte Fremdschlüssel verhindern Verknüpfungen mit einem fremden lokalen Objekt oder Kundenbestand. Das ersetzt keine separate Benutzer-/Mandantenberechtigung für eine spätere gemeinsame SaaS-Installation. Lokale Anzeigennummern sind derzeit global eindeutig; ein späterer Import muss sie kundenbezogen bilden und darf diese Beschränkung nicht durch Zusammenführen gleich nummerierter HP-Objekte umgehen.

Jede Quellzuordnung enthält Platz für letzte Basis, Remote-Stand, Ziel, Hash, Revision, Synchronisationsstatus und Fehlerhinweis. Diese Spalten allein führen noch keinen Änderungsabgleich durch. Fehlende Datensätze eines unvollständigen Laufs dürfen später nicht als Löschung behandelt werden.

Der Objektstatus beginnt ausdrücklich mit `unklar`, der rohe Wert `fi_beendet` mit NULL. Es gibt kein automatisches Default „aktiv“. Die vorbereitete Auswertung aus `lib/hpObjektstatus.js` wird erst beim späteren Import angewendet; nur nachgewiesen aktuelle Elternobjekte dürfen dann Kinder freigeben.

## Migration und Wiederanlauf

Vor dem Umbau prüft die Migration bestehende Fremdschlüssel, Konten-/Einheitenzuordnungen sowie unerwartete Kontenspalten, Indizes oder Trigger. Unbekannte Erweiterungen werden zur Prüfung angehalten und nicht verworfen. Bei dateibasierten Datenbanken wird anschließend mit `VACUUM INTO` eine konsistente Sicherung im Datenverzeichnis angelegt. Schlägt die Sicherung fehl, beginnt kein Tabellenumbau.

Der Neuaufbau von `personenkonten` und alle Ergänzungen erfolgen in einer Transaktion. Konten-IDs, bisherige Spaltenwerte, Autoincrement-Fortschritt, Sollwerte und Adresskopplungen bleiben erhalten. Fremdschlüssel werden nur während dieses Startvorgangs ausgeschaltet, vor dem Commit vollständig geprüft und anschließend wieder eingeschaltet. Bei einem Fehler wird der Umbau zurückgenommen; der Server öffnet die fehlerhafte Migration nicht für HTTP-Anfragen. Nach erfolgreichem Abschluss verhindert Version 5 eine Wiederholung.

Die Prüfung deckt auch gültige alte Rollen ab, deren Objektbezug nur über die Einheit besteht: ihr bestehender Hauptbezug bleibt erhalten. Die neue zusätzliche Brückenzuordnung wird nur bei explizit passendem Objektbezug angelegt; ein späterer Import darf fehlende Bezüge nicht raten.

## Noch nicht durch diese Änderung erledigt

- Kein Datenabruf von aktuellen Objekten oder deren Kindern, keine HP-Rückschreibung.
- Keine Jahresauswahl oder Anzeige neu importierter Zusatzfelder in den normalen Masken.
- Keine Freigabe für heutige/künftige Beendigungen oder unbestätigte HP-Codes und Datumsformate.
- Kein Import von Telefonen, Bankmandaten oder ZIS; die im Feldvergleich dokumentierten Anforderungen bleiben offen.
- Kein SQL-Änderungsjournal und keine Löschsynchronisation. Die vorhandene inkrementelle Adressübertragung bleibt unverändert.

Validierung: Tests migrieren eine befüllte v4-Datenbank, vergleichen vorhandene Werte und Referenzen, prüfen zwei Jahresstände mit genauen Anteilen, mehrere Konten pro Funktion und die Trennung gleich nummerierter Kundenobjekte. Ein Fehler unmittelbar vor Commit muss den vollständigen alten Stand wiederherstellen. Eine tatsächliche Sicherungsdatei wird geöffnet und nach Wiederanlauf wird keine zweite Migration ausgeführt.
