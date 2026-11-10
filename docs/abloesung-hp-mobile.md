# CuraAed als eigenständiger Nachfolger

Stand 10.11.2026. Ziel ist die vollständige Ablösung aller genutzten HP-Mobile-Funktionen. Eine gestartete Übernahme oder ein sichtbares Menü bestätigt noch keine vollständige Migration.

| Bereich | Vorhandener Ausbau | Noch erforderlich |
|---|---|---|
| Dokumente | Dauerhafte Dateien und Zuordnungen, eigener PDF-Betrachter, Download, Kontextarchive | Gesamtdurchlauf abschließen, Lücken und Speicher prüfen, direkter dauerhafter Serverabgleich |
| Akten / Handwerkeraufträge | Eigenständige Vorgänge mit Status, Zuständigkeit, Vermerken, Verlauf, Zuordnungen und HP-Übernahme | Reale Vollständigkeit und fachliche Statusabdeckung prüfen; Auftragsschreiben und Versand fehlen |
| Wiedervorlagen | Eigenständige Vorgänge, Fälligkeit, Zuständigkeit und Glocke; HP-Übernahme | Reale Vollständigkeit prüfen |
| ZIS / Notizen | Dauerhafte Übernahme, lokale Bearbeitung und Kontextanzeige | Reale Zuordnungen und alle Quellfelder prüfen |
| Kalender | Monatsansicht eigener Fälligkeiten und bisheriger lokaler Wiedervorlagen | Auf ausdrücklichen Wunsch später Microsoft 365 / Outlook anbinden. Noch keine M365-Verbindung und keine Terminsynchronisation |
| Personen / Kontakte | Lokaler Adressbestand, direkter HP-Abgleich für Namen und Postanschriften | Telefon, E-Mail, Ansprechpartner und Bankdaten vollständig abgleichen |
| Objekte / Einheiten | Lokale Stammdaten und vorbereiteter direkter HP-Import | Tatsächliche Connector-Inbetriebnahme, Abdeckung und Nummernzuordnungen prüfen |
| Belegprüfung / Rechnungen | Noch kein vollständiger Ersatz | Eigenständiger Prüfablauf, Freigaben und Datenübernahme |
| Vor-Ort-Funktionen | Noch kein vollständiger Ersatz | Übergaben, Formulare, Fotos, Zähler und Berichte fachlich prüfen und umsetzen |
| Kundenportal / Kommunikation | Noch kein vollständiger Ersatz | Rechte, Eigentümer-/Mietersicht, Nachrichten, Benachrichtigungen und FAQ |
| Betrieb | Persistente SQLite-Daten und Uploads | Vollständige Sicherung/Wiederherstellung, Kapazität und endgültige Entkopplung prüfen |

## Arbeitsbereiche

Die neuen Tabellen fach_vorgaenge, fach_bezuege, fach_verlauf, fach_import_jobs und fach_import_fehler bilden native CuraAed-Vorgänge ab. Daten und Originalsnapshot bleiben nach Entfernen der HP-Verbindung erhalten. Die HP-Übernahme ist lesend und schreibt keine Änderungen oder Nachrichten an HP oder Dritte. Lokale Bearbeitung führt einen Verlauf; Versionsprüfung verhindert verlorene Änderungen. Ein Dreiwegevergleich vereinigt unabhängige Änderungen und hält widersprüchliche Änderungen als Konflikt zur Auswahl einer Fassung an.

Persönliche HP-Quellen bleiben getrennt. Eine ausdrückliche Zuweisung an einen aktiven Mitarbeiter gibt diesem Zugriff auf genau diesen Vorgang und seine zugeordneten Dokumente. Nur der Ersteller kann die Zuständigkeit ändern. Keine automatische Weitergabe an Mitarbeiter anhand ähnlicher Namen oder HP-Kürzel. Dokumentzugriffe prüfen zuerst den Vorgang und die konkrete Dokumentzuordnung.

Die Übernahme arbeitet in den fünf Bereichen ZIS, Handwerkeraufträge, Akten, Wiedervorlagen und Notizen. Cursor und Fehler bleiben gespeichert. Nach Serverneustart muss fortgesetzt werden. Fehler und Konflikte bedeuten, dass der Bestand noch nicht als vollständig übernommen gilt. Originaldaten sind als Text einsehbar; HTML aus HP wird nicht ausgeführt. Zuordnungen zu CuraAed-Stammdaten werden ausschließlich anhand der gebundenen HP-Quelle und ihrer ERP-Schlüssel aufgelöst.

Nicht als fertig ausweisen: Rückschreiben in das ERP, externer Versand, Rechnungsfreigabe, M365-Synchronisierung oder vollständige Funktionsgleichheit. Diese Ausbaustufe stellt die eigenständigen Arbeitsbereiche bereit; die Tabelle oben bleibt die offene Abdeckung der gesamten Ablösung.
