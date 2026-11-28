# Dauerhaftes CuraAed-DMS

Das HP-Mobile-DMS wird in die dauerhafte CuraAed-Ablage übernommen. Keine Weiterleitung in HP-Mobile zum Öffnen erforderlich. PDF-Vorschau und Download erfolgen in CuraAed. Der eigene PDF.js-Betrachter wird vom CuraAed-Server bereitgestellt, rendert die gewählte Seite selbst und benötigt weder ein Browser-PDF-Plugin noch einen externen Dokumentdienst. HP-Dokumentarten werden auf die lokalen Archivkategorien abgebildet.

## Speicherung und Zuordnung

Metadaten, Originalnamen, Archivnummern, Dateilisten und alle vom Container gelieferten Zuordnungsgruppen werden in SQLite gespeichert. Originaldateien liegen unter UPLOAD_DIR/hp-dms auf demselben persistenten Datenträger wie die übrigen Uploads. Dieser Ordner muss zusammen mit der Datenbank gesichert werden. Die OAuth-Schlüsseldatei bleibt für spätere Abrufe erforderlich; gespeicherte Dokumente brauchen sie nicht. Löschen einer HP-Mobile-Verbindung löscht keine übernommenen Dateien.

Eine Quelle gehört einem CuraAed-Benutzer und HP-Subdomain. Sie kann genau einer eigenen direkten HP-Datenquelle zugeordnet werden. Diese fachliche Quellbindung wird bewusst ausgewählt; Namensgleichheit reicht nicht. Verknüpfungen erfolgen ausschließlich über HP-Adressnummer, Objekt-/Wohnungsnummer und die vorhandenen Quelltabellen. Lokale Archivlisten zeigen übernommene Dokumente derselben Person in den zugehörigen Adress-, Objekt- und Einheitenarchiven. Nicht importierte lokale Objekte erhalten keine geratenen Verknüpfungen. Die bisherigen persönlichen HP-Zugriffsrechte bleiben erhalten; Leser sehen nur die bisherige lokale Ablage.

Aktive Administratoren mit ausdrücklicher Mitgliedschaft im gebundenen Firmenbestand
können zusätzlich dessen übernommenes Archiv lesen, auch wenn es noch der alten
Administrator-Kennung gehört. Das gilt auch für den direkten Import derselben
bestätigten HP-Datenquelle. Eine anders gebundene Firma bleibt ausgeschlossen;
Mitarbeiter ohne Administratorrolle und entfernte Mitglieder erhalten diesen
zusätzlichen Zugriff nicht. Die Kundendokumentfreigabe bleibt davon getrennt.

## Übernahme

Im DMS kann der gesamte Bestand oder eine aktuelle Titelsuche dauerhaft übernommen werden. Suchübernahmen erfassen nur Treffer der HP-Titelsuche und sind keine vollständigen Adressarchive. Der Gesamtdurchlauf liest nach aufsteigender Datei-ID, speichert Position und Seite je Quelle und arbeitet nach Schließen der Ansicht im Server weiter. Nach Serverneustart kann der gespeicherte Cursor per Fortsetzen wieder aufgenommen werden. Ein abgeschlossener Durchlauf kann erneut gestartet werden; bereits gesicherte unveränderte Dateien werden nicht dupliziert. Die HP-Seitenliste ist kein transaktionaler Snapshot: nachträgliche Löschungen oder Änderungen erfordern einen erneuten vollständigen Abgleich.

Die Übernahme wird bei Anmeldung, Berechtigung, Ratenbegrenzung oder knappem Speicher angehalten. 256 MiB bleiben reserviert. Es wird keine kostenpflichtige Speichererweiterung ausgelöst. Einzelne nicht verfügbare Dateien werden als Fehler markiert, damit spätere Dateien trotzdem übernommen werden. Ein abgeschlossener Durchlauf bestätigt keine fehlerfreie Vollständigkeit: die Anzahl gesicherter Dateien, Metadaten und Fehler separat prüfen. Wenn HP weniger Beziehungen als angekündigt liefert, bleibt dies als Fehler vermerkt.

Große Dateien werden auf Platte gestreamt, nicht vollständig im Server-RAM gehalten. Größe, MD5/SHA1 soweit vorhanden und eine eigene SHA256-Prüfsumme werden geprüft. Temporäre Dateien werden erst nach erfolgreicher Prüfung atomar umbenannt. Parallele Schreibvorgänge sind serialisiert. Eine veränderte bereits gesicherte Quelldatei überschreibt niemals still den gesicherten Stand. Der lokale Download prüft SHA256 erneut.

## Grenzen der Ablösung

Unabhängig sind nur tatsächlich gespeicherte Dateien und Metadaten. Noch nicht übernommene Dateien benötigen einmalig die bestehende HP-Anbindung. Die Gesamtzahl von rund 290.000 HP-Dateien bedeutet nicht, dass diese schon migriert sind. Speicherbedarf, Laufzeit und Fehler müssen im echten Bestand geprüft werden. Der direkte dauerhafte Archivabgleich vom HausPerfekt-Server sowie eine vollständige fachliche Funktionsparität mit HP-Mobile sind zusätzliche Ausbaustufen.

## Render-Absturz am 10.11.2026

Im Render-Protokoll um 09:47:14 (Europe/Berlin) beendete Node 24.22.1 den Prozess mit ERR_ASSERTION in Parser.finish / onHttpSocketEnd und assert(!this.paused). Dies entspricht dem bekannten Fehler nodejs/undici#5360, korrigiert durch #5474. Die HP-Verbindung nutzt deshalb explizit die separat gepinnte Undici-Version 8.12.4 statt der mit Node gebündelten fetch-Implementierung. Die Datei- und Quellprüfsummen bleiben bestehen. Unvollständige Antworten bleiben Fehler und werden nicht als gesicherte Dateien gewertet. Tests decken langsame Verbraucher, Content-Length, chunked, EOF, verkürzte Antworten und Abbruch ab; CI prüft Node 22 und 24.

Quellen: https://github.com/nodejs/undici/issues/5360 und https://github.com/nodejs/undici/pull/5474 .

## Einstieg über Dokumente

### Adresslisten in Eddi

PDF-Adresslisten erhalten einen eigenen Importablauf, auch wenn dieselbe Liste
Objekt und Wohnungen beschreibt. **Als Adressliste auswerten** liest die vorhandene
PDF, zeigt editierbare Kontakte, Wohnungsnummern und Personenfunktionen und bietet
anschließend **Vorschau und Dubletten prüfen**. Erst die aktuelle Vorschau erlaubt
die Übernahme. Objekt-/Wohnungsnummern werden abgeglichen; ein Objekt mit gleicher
Anschrift wird wiederverwendet. Exakte bekannte Adressen werden übernommen,
mögliche Dubletten sperren die Anlage. Wiederholung desselben Auftrags legt nichts
doppelt an. Adressen, neue Wohnungen und ausdrücklich bestätigte Funktionen werden
in einer Transaktion gespeichert. Fehlende MEA sind hier kein Anlagehindernis;
es werden weder Anteile noch Stimmregeln erfunden. Eine unbekannte Personenfunktion
bleibt ohne geratenen Eigentümer-/Mieterbezug und muss in der Vorschau geklärt werden.
Der lokale HP-Neuanlageauftrag entspricht der normalen Adressanlage; der Import
selbst führt keine direkte HP-Datenbankabfrage aus.

Dokumente / Alt+S,D / F10 öffnet zuerst die Sachbearbeiter-Abfrage. Das Kürzel stammt aus dem eigenen CuraAed-Benutzerprofil; fehlt es, bleibt das Feld leer. Ein bis drei Großbuchstaben sind zulässig (bestehende zweistellige HP-Kürzel bleiben verwendbar). Leer zeigt sämtliche offenen CuraAed-Posteingänge. OK übernimmt die Auswahl, Abbrechen oder Schließen öffnet keine Dokumentliste.

Der native Posteingang verwendet eine eigene Sachbearbeiter-Zuordnung und einen Bearbeitungsstand mit Versionsprüfung und Verlauf. Abschließen erhält die Archivdatei. Vorhandene HP-Posteingänge sind noch nicht übertragen und werden deshalb nicht anhand des Archivfelds poc vorgetäuscht. Die Archivübernahme ist separat unter #/dms-uebernahme und aus dem Posteingang erreichbar. Die laufende Übernahme bleibt ein serverseitiger Auftrag und wird von der neuen Einstiegsauswahl nicht gefiltert oder eingeschränkt.
