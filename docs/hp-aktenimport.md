# Aktenübernahme aus HausPerfekt

Der Fachbereichsimport sichert die von HP-Mobile bereitgestellten Akten,
Handwerkeraufträge, Beziehungen und referenzierten Dateien. Schlüssel sind immer
an die jeweilige Quelle gebunden. Der Import ist wiederholbar und berücksichtigt
lokale Änderungen. Dateien werden im bestehenden, mit Prüfsummen geschützten
CuraAed-Archiv gespeichert und sind danach ohne HP-Mobile verfügbar.

Ein HP-Mobile-Durchlauf ist kein Nachweis einer vollständigen ERP-Migration.
Am 16.11.2026 enthielt der bisherige Mobile-Import zwei Akten. In HausPerfekt
ist darüber hinaus beispielsweise die BB0-Protokollakte 118334 sichtbar.
Für den vollständigen Bestand ist deshalb der direkte ODBC-Bestand zu prüfen.

`HP-Aktenpruefung.exe` liest ausschließlich fest vorgegebene SELECT-Abfragen
über HPSD aus HPSERVSD. Es erfasst Zeilenzahlen, eine begrenzte Anzahl von
Schlüsselbeispielen, Beziehungen zur Akte 118334 und Archivpfade. Es verändert
keine HP-Daten und hat keine Netzwerkfunktion. Der Bericht wird unter
Dokumente/HP-Aktenpruefung.json gespeichert und kann mit „Bericht kopieren“
in die Zwischenablage übernommen werden. Namen, Aktennummern und Dateipfade
des Berichts sind interne Verwaltungsdaten und dürfen nicht ins Repository.

Bei fehlendem Archivspeicher werden Metadaten weiter übernommen und betroffene
Dateien als ausstehend erkennbar gehalten. Ein erneuter Durchlauf versucht die
Dateiübernahme erneut. Bereits gesicherte Dateien werden nicht erneut geladen.

## Direkte Übernahme

`#/hp-akten` ist ausschließlich für Administratoren erreichbar. Nach explizitem
Start für die vorhandene HP-Verbindung kann `HP-Aktenimport.exe` auf dem
HP-Rechner lesen. Es verwendet das bereits mit Windows-DPAPI geschützte Profil
des Adressabgleichs. Ohne aktivierten Auftrag werden keine Bestandsdaten an
CuraAed übermittelt. Das Programm enthält ausschließlich SELECT-Abfragen aus dem
eingebetteten Vertrag `lib/hpAktenImport.json`; der Server liefert keine SQL-
Befehle. Der Archivordner wird lokal festgelegt, standardmäßig
`H:\HP_Daten\hp\Daten\Archiv`.

Zunächst werden Aktenarten, Akten, Adresszuordnungen, Folgeblattdaten,
Handwerkeraufträge, Auftragsadressaten und -texte sowie die modernen und alten
Archivzuordnungen gelesen. Jede Seite wird vollständig und mit ihrem Cursor
gespeichert. Rohdaten bleiben für nachvollziehbare spätere Erweiterungen erhalten.
Anschließend entstehen lokale Akten, Aufträge und Beziehungen. Identische
Mobile-Vorgänge derselben HP-Datenbank werden anhand ihrer vollständigen
HP-Nummer wiedererkannt. Aktennummer und laufende Akte bleiben getrennte Schlüssel.
Lokale Änderungen werden berücksichtigt; nicht automatisch übernehmbare Werte
werden als Meldungen ausgewiesen. Fremde Benutzer oder Quellen werden nicht
zusammengeführt.

Archivdateien bleiben im persönlichen, quellgebundenen HP-Archiv. Dateischlüssel
ab 2^52 sind dem direkten Import vorbehalten und werden vor dem Öffnen über die
konkrete Vorgangszuordnung und den Quelleninhaber geprüft. Fehlende lokale
Stammdaten werden mit ihrer HP-Nummer bewahrt und gemeldet. Alte Dateien ohne
modernen Pfad werden nur bei eindeutigem Treffer im freigegebenen Archivordner
übernommen. Verzeichnis- und Dateiverknüpfungen sowie Pfade außerhalb dieses
Ordners werden nicht verfolgt. Dateien bis 2 GB werden blockweise übertragen und mit SHA-256 bestätigt. Abgebrochene Übertragungen hinterlassen keine bestätigte Datei und geben die Verbindung wieder frei.

Die Dateiannahme verlangt Connector-Token, aktiven Auftrag, Generation,
Dateizuordnung, Größe und SHA-256. Bestätigte Dateien werden atomar abgelegt;
später veränderte Quelldateien überschreiben vorhandene Sicherungen nicht.
Fehlgeschlagene Downloads können ohne erneutes Einlesen sämtlicher Metadaten
fortgesetzt werden. Das Programm muss während des einmaligen Imports laufen;
es wird nicht zusätzlich in den Windows-Autostart installiert.

Interne Archiv-Mails mit AR_Mail, AR_Mail_Modul und AR_SB werden ausschließlich anhand dieses vollständigen Schlüssels aus IE_Inbox/IE_Outbox (gegebenenfalls deren NEU-Beständen) sowie den zugehörigen Empfänger-, _Ex- und _Anhang-Tabellen gelesen. Es werden keine Kennwort- oder Profile-Felder abgefragt. Die Nachricht wird als EML mit Herkunftsvermerk gespeichert; Anhänge werden nur aus dem freigegebenen Archiv beziehungsweise dem danebenliegenden HP-Ordner Attachments gelesen. Fehlende oder nicht eindeutig zugeordnete Anhänge verhindern eine Erfolgsmeldung.

Fehlt ein normaler Dateipfad, sucht der Reader einmalig nach den noch offenen Dateinamen innerhalb des Archivordners und des vorhandenen gleichgeordneten ARCHIV2019. Bei Dateinamen mit Erweiterung muss der Name vollständig übereinstimmen; bei alten Namen ohne Erweiterung ist genau ein Treffer erforderlich. Doppelte Namen bleiben zur Prüfung stehen. Die Rohzuordnungen werden nicht umgeschrieben.
