# DMS aus HP-Mobile

Stand: 10. November 2026. Lesende Anbindung der Dokumente aus der persönlichen
HP-Mobile-Verbindung. Die vorhandene lokale Archivfunktion bleibt unter
`#/archiv` erreichbar. `Dokumente`, Alt+S+D und F10 öffnen `#/dms`.

## Daten und Zuordnungen

Die Ansicht lädt maximal 25 Dateien pro Seite und sucht serverseitig mit dem
vom Portal verwendeten Suchparameter `s`. Sortierung: Dokumentdatum absteigend.
Bei mehreren persönlichen HP-Verbindungen muss der Kundenbestand ausgewählt
werden. Ein einzelner Bestand wird automatisch gewählt.

Die Mobile-Datei-ID (`documents.id`), die Mobile-Container-ID (`container_id`)
und die ERP-Archivnummer (`document_container.hp_id`) sind verschiedene Werte.
Ein Container kann mehrere Dateien enthalten; `documents.hp_id` ist eine
Dateinummer innerhalb des Archiveintrags und kein globaler Dokumentschlüssel.

Die Detailansicht liest `documents/{id}` und danach
`documentcontainer/{container_id}`. Sie zeigt die Dateien des Containers sowie
die gelieferten Zuordnungen zu Liegenschaften, Einheiten, Personen,
Handwerkeraufträgen, Akten, Z.I.S., Wiedervorlagen und Notizen. HP-Objektnummern
werden bei Einheiten separat angezeigt. Es gibt keine ungeprüfte Zuordnung
von HP-Mobile-IDs zu lokalen CuraAed-Datensatz-IDs. Bei einer unvollständigen
vom Anbieter gelieferten Zuordnungsliste wird der Unterschied zum Zähler
ausgewiesen; der Archiveintrag bleibt direkt in HP-Mobile erreichbar.

Der Mobile-Bestand ist kein nachgewiesenes Vollarchiv des lokalen Servers.
Dokumentarten besitzen unter anderem Export- und Alterskonfigurationen.

## Dateidownload

Dateien werden erst nach einem Klick von
`GET https://api.hausperfekt-mobile.de/api/v1/documents/{id}/binary` abgerufen.
Es gibt keinen vollständigen Dateiimport, keine Dateikopie auf dem CuraAed-
Server und keine DMS-Schreiboperation in HP. Die Antwort wird innerhalb einer
festen Grenze von 64 MiB gepuffert, geprüft und als Download ausgeliefert.
Größere Dateien können über den Link zum Dokument in HP-Mobile geladen werden.

Vor dem Dateiabruf werden die Metadaten mit derselben Anmeldung gelesen.
Dateigröße und vollständige, syntaktisch gültige MD5-/SHA-1-Prüfsummen werden
mit den geladenen Bytes verglichen. Diese Legacy-Prüfsummen dienen dem
Übertragungsvergleich, nicht als Sicherheitsnachweis für den Dateiinhalt.
Ein leerer, abgebrochener oder widersprüchlicher Abruf liefert einen Fehler.
Download-Timeout: 120 Sekunden; Metadaten verwenden den vorhandenen Timeout.

## Zugriff

Alle DMS-Routen erben den vorhandenen HP-Zugriff für Administratoren und
Mitarbeiter. Jede Anfrage prüft den Besitzer der persönlichen Verbindung,
erneuert bei Bedarf deren verschlüsselt gespeichertes Token und kontrolliert
die Kundenmitgliedschaft über `whoami`. Der Header `HPAPI-DOM` stammt nur aus
der gespeicherten Verbindung. Fremde Verbindungs-IDs liefern 404, bevor HP
aufgerufen wird. Die bestehenden Einschränkungen für Leser bleiben erhalten.

Ausgehende Hosts und Pfade sind fest vorgegeben; Anbieter-URLs werden nicht
als Downloadziel übernommen. Weiterleitungen sind deaktiviert. Antworten
verwenden `Cache-Control: no-store`. Dateien werden mit Attachment-Disposition,
`application/octet-stream`, `nosniff` und einer Sandbox-CSP ausgeliefert.
Zugangstokens und Lesebestätigungen werden nicht an die DMS-Oberfläche gegeben.
Ein Sachbearbeiterkürzel erteilt keine zusätzlichen Berechtigungen.

## HTTP-Routen unter /api/hausperfekt

- `GET /dms/verbindungen`: eigene Verbindungen.
- `GET /dms/:id/dokumente?seite=1&suche=...`: begrenzte Dokumentliste.
- `GET /dms/:id/dokumente/:dateiId`: Details und Containerzuordnungen.
- `GET /dms/:id/dokumente/:dateiId/download`: geprüfter Dateidownload.

Es werden keine Datenbankschemata oder bestehenden HP-Kopplungen verändert.
