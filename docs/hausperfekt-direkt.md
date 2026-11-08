# Direkte HP-Rückschreibung: begrenzte Testphase

Die direkte Verbindung wurde am 8. November 2026 gegen HP 14.11.13 geprüft:
Actian Zen/Pervasive, vorhandene 32-Bit-ODBC-Datenquelle, reale Tabelle `AD_Adr`.
Ein separater Kontakt `CURAAED-TEST` wurde mit Namen und Nummer eindeutig gelesen.
Die vorher falsch abgelesene Nummer wurde korrigiert. Nummern werden immer mit
der Datenbank und dem exakten Testnamen abgeglichen.

Diese Erweiterung richtet einen **begrenzten Schreibweg für den Titel dieses
Testkontakts** ein. Sie koppelt noch nicht die bisherigen normalen Adressmasken,
Liegenschaften oder Einheiten. Der echte Schreib-/Rücklesetest auf dem HP-Server
steht bis zur ausdrücklich freigegebenen Ausführung des neuen Connectors aus.

## Bedienung

1. Als Administrator in CuraAed `HP-Verbindung` öffnen. Im Abschnitt
   „Direkte Rückschreibung – Testphase“ den Windows-Testconnector herunterladen.
2. „Direkten HP-Testconnector koppeln“ wählen. Eigenen Verbindungsnamen,
   tatsächlichen HP-Datenbanknamen und Nummer eines **separaten** Kontakts mit
   `Name1 = CURAAED-TEST` eintragen. Die Freigabe umfasst maximal acht Stunden.
3. Die einmalig angezeigten Kopplungsdaten selbst in das Connector-Fenster auf
   dem HP-Anwendungsserver einfügen. Den vorhandenen 32-Bit-DSN und dieselbe
   Datenbank/Testnummer angeben. Der Connector prüft den lokalen Bestand vor
   dem ersten Netzaufruf. Titel-Rückschreibung dort ausdrücklich aktivieren.
4. In CuraAed den Testkontakt frisch lesen und den Status aktualisieren.
5. Innerhalb von 60 Sekunden einen anderen Titel eingeben und bestätigen.
   Der Pilot erlaubt maximal 30 druckbare ASCII-Zeichen ohne Leerzeichen am Ende.
   Damit werden weder CP850-Verluste noch stilles Abschneiden zugelassen.
6. Status aktualisieren. Erst „In HP gespeichert und nach dem Commit
   zurückgelesen“ bedeutet bestätigten Abschluss. Zusätzlich in HP selbst prüfen.
7. Nach dem Test den ursprünglichen Titel über denselben geprüften Weg
   wiederherstellen, Verbindung trennen und Connector schließen.

Kopplungsdaten sind Zugangsdaten. Nicht in Git, E-Mail, Chat oder Bildschirmfotos
speichern. Der CuraAed-Server speichert nur den SHA-256-Hash. Der Connector hält
das Token nur im Prozessspeicher; er installiert keinen Dienst, speichert keine
Anmeldung und startet nicht automatisch. Ohne geöffnetes Connector-Fenster gibt
es keine neue lokale Verarbeitung. Für einen späteren Dauerbetrieb ist ein
gesondert einzurichtender und freizugebender Dienst erforderlich.

## Aufträge und Konflikte

Browserzugriff verlangt Administratorrechte, eigenen Verbindungsbesitz,
JSON und die konfigurierte öffentliche Origin. Jeder Auftrag hat eine eindeutige
Kennung. Gleichzeitiges oder doppeltes Absenden erzeugt keinen zweiten Auftrag.
Der Agent authentifiziert sich separat und ist an genau diese Verbindung,
Datenbank, Testnummer und den Testnamen gebunden. Inaktive Benutzer oder eine
entzogene Administratorrolle sperren den Agentenzugriff ebenfalls.

SQLite hält wartende und abgeholte Aufträge über App-Neustarts hinweg vor.
Ein abgeholter Auftrag wird **nie erneut ausgegeben**, auch nicht nach einem
Verbindungsabbruch. Nach zwei Minuten ohne Bestätigung wird er als „unklar“
angezeigt. Der Connector wiederholt bei HTTP-Ausfällen nur seine bereits
vorliegende Rückmeldung. Ein Prozessabsturz kann eine manuell zu klärende Lücke
zwischen HP-Commit und Rückmeldung hinterlassen. Vor einem neuen Schreibauftrag
muss frisch aus HP gelesen werden. Späte Antworten älterer Aufträge können
keinen neueren Lesestand überschreiben.

Der Agent vergleicht den aktuellen Titel innerhalb einer serialisierbaren
ODBC-Transaktion mit dem erwarteten Titel. Die feste UPDATE-Anweisung enthält
zusätzlich Nummer, Testname und alten Titel in der WHERE-Bedingung. Alle Werte
werden als ODBC-Parameter gebunden. Exakt eine betroffene Zeile und der neue
Titel müssen vor dem Commit bestätigt sein. Erst nach Commit und erneutem
SELECT kann Erfolg gemeldet werden. Bei unbekanntem Commit-Ausgang gibt es
keinen automatischen zweiten Schreibversuch.

Eine getrennte Verbindung stoppt wartende neue Aufträge. Ein bereits abgeholter
Auftrag kann noch abgeschlossen werden. Das Trennen verspricht kein Rollback
einer bereits laufenden HP-Transaktion.

## Grenzen und Validierung

Der Pilot setzt ausschließlich `AD_Adr.Titel`; Finanzdaten, Rollen, E-Mail,
Telefon, Dokumente und andere Kontakte bleiben außerhalb des Schreibprotokolls.
Es existiert keine allgemeine SQL-Ausführungsroute. Die gemeinsame lokale
CuraAed-Datenbank ist damit weiterhin keine vollständig mandantenfähige
Verwaltungsplattform. Die Testverbindungen und ihre Aufträge sind persönlich
getrennt; eine unternehmensweite Rollenfreigabe für normale Masken steht aus.

Node-Tests prüfen Besitzer-/Kundentrennung, Tokenablauf, Origin/Rollen,
Idempotenz, Konflikte, Neustart, unbekannte Ergebnisse und verspätete Antworten.
UI-Tests prüfen den ausdrücklich bestätigten Schreibauftrag. C#-Tests prüfen
DSN-, Titel- und Testkontaktgrenzen sowie den exakten Titelvergleich.
Tests mit synthetischen Daten ersetzen nicht den noch offenen HP-Schreibtest.

## Windows-Build

Die Quellen liegen unter `tools/hp-direkt`. Benötigt wird der vorhandene
.NET-Framework-C#-Compiler, Zielplattform x86, Referenzen `System.Data.dll`,
`System.Drawing.dll`, `System.Windows.Forms.dll`, `System.Web.Extensions.dll`.
Startklasse ist `HPDirectForm`; die Testklasse `HPDirectTests` wird separat
als Konsolenprogramm gestartet. Ziel-Origin des Piloten ist fest
`https://curaaed.onrender.com`. Umleitungen werden abgelehnt, TLS 1.2 wird
verwendet und Zertifikatsprüfungen bleiben aktiv.

Das aus diesen Quellen erzeugte Windowsprogramm liegt unter
`public/downloads/HP-Direktconnector.exe`. Ein zusätzlicher Windows-CI-Job
kompiliert und prüft die Quellen; die App-Bereitstellung allein startet keinen
Connector und erteilt noch keine Kopplungsfreigabe.

