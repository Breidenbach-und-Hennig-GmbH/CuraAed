# Automatischer Import aktueller HP-Objekte

Der Windows-Connector `HP-Objektimport.exe` liest HP über die vorhandene ODBC-Quelle. Datenrichtung dieses Imports ist **HP → CuraAed**. Er enthält ausschließlich feste SELECT-Abfragen; der Server kann ihm keine SQL-Schreibaufträge senden. Der getrennte Adressabgleich behält seinen bisherigen Umfang und seine Rückschreibung.

## Einrichtung und Umfang

In CuraAed unter **Einstellungen → HausPerfekt → Aktuelle HP-Objekte automatisch übernehmen** die bestehende Kundenverbindung auswählen und den lesenden Import freigeben. Die einmalig angezeigte, maskierte Kopplung gehört ausschließlich in den neuen HP-Objektimport, nicht in den Adress- oder Testconnector. Eine neue Kopplung ersetzt dessen altes Importtoken; die Adresskopplung bleibt unverändert.

Der Importzugang gilt bis zum Widerruf. Der Administrator kann ihn separat stoppen. Das Trennen der übergeordneten HP-Adressverbindung widerruft auch den Objektimport dauerhaft; erneutes Adresskoppeln reaktiviert dessen altes Token nicht. Deaktivierte Benutzer, fehlende Administratorrechte oder ein abweichender Datenbankname werden abgewiesen. Der Connector prüft zusätzlich die tatsächliche ODBC-Datenbank vor jedem Öffnen.

Beim ersten Start wird die Quelle an einen SHA-256-Fingerabdruck aus gemeldeter ODBC-Datenquelle, Datenbank, DSN sowie ausführendem Windows-Rechner und Benutzerkontext gebunden (Trust on First Use). Übertragen wird nur der Fingerabdruck, nicht der Rechnername oder die Windows-SID. Die erste Kopplung muss auf dem tatsächlich ausgewählten Kundenserver erfolgen. Eine andere Quelle beziehungsweise ein anderer Ausführungskontext wird auch nach Tokenrotation nicht automatisch über bestehende Kundendaten gelegt. Serverumzug, DSN-/Benutzerwechsel und Wiederherstellung sind deshalb vor einer erneuten Quellzuordnung gezielt zu prüfen; der Hash ersetzt keine fachliche Erstprüfung des ausgewählten Kundenbestands.

Auf dem HP-Server Quelle und Datenbank eingeben, Kopplung einfügen, Umfang bestätigen und starten. Eine optionale Speicherung verwendet Windows-DPAPI für das aktuelle Windows-Konto; die Kopplung steht nicht als Klartextdatei auf dem Server. Das Programm muss laufen und das Fenster offen bleiben. Es wird kein Dienst oder Autostart installiert; nach Abmeldung/Serverneustart muss es wieder geöffnet und gestartet werden.

Die zugehörigen HP-Adressen müssen vom bestehenden Adressabgleich übernommen sein. Beide Programme dürfen parallel laufen. Fehlt eine Adresse, wird die betroffene Funktion/das Konto sichtbar zurückgestellt und nach Bereitstellung der Adresse erneut geprüft. Es werden keine Ersatzadressen oder erfundenen Personenfunktionen angelegt.

| Bereich | Quelle und Ziel |
| --- | --- |
| Objekte | `OB_Obj`, Typbezeichnung aus `GD_ObjTyp`, Status aus `FI_Obj.FI_beendet`. Stammdaten in normalen Objektmasken, stabile Quellzuordnung je Kundenverbindung. |
| Objektkennzahlen/Gebäude | `OB_AnzGeb`, `OB_Gebaude`. Gebäudezahl und Gebäudezuordnungen; `AnzEin` bleibt als ursprüngliches HP-Feld getrennt, bis die fachliche Bedeutung für den Eingangszähler abschließend bestätigt ist. |
| Einheiten | `WG_Wohnung` mit Originalcodes, Merkmalen, Gebäude-/Bauteilindex, Fläche/MEA, Gültigkeiten sowie Minol-/DTA-/freien Kennzeichen. |
| Personenfunktionen | `PF_PFkt`; stabile Zeilenkennung, zugeordnete Adresse/Einheit, Funktion, Zeiträume und Status. Nicht zugeordnete Funktionscodes werden gemeldet. |
| Personenkonten | `PK_Pkto`; Kontonummer/-name, ursprüngliche Adresse/Einheit, Referenz und Aktenzeichen. Zusätzliche Funktionsverknüpfungen erhalten ihre HP-Herkunft; lokale Zuordnungen werden nicht entfernt. Konten ohne Adresse/Einheit bleiben als solche erkennbar. |
| Jahresperioden | Ausgewählte Perioden-/Stammdaten aus `FI_ObjBJ`. Keine Übernahme oder Ausführung von Buchungen. |
| Verteilerschlüssel | `OB_VSchl`, `WG_VSchl`, `PK_VSchl`, `PK_VSchlPers`, `PK_VSchlPersBJ`; Schlüssel und Anteile getrennt nach Objekt, Jahr, Einheit/Konto und gegebenenfalls Zeitwert. |

Nicht enthalten sind Buchungssätze, offene Posten, Sollstellungswerte, Bankverbindungen, Mandatsaktionen und ZIS. Importierte Konten zeigen deshalb keine vermeintlichen Nullsalden; offene Posten und fehlende Sollwerte werden als nicht importiert ausgewiesen. Weitere, nicht ausgewählte HP-Tabellen werden nicht gelesen.

## Aktuelle Objekte und Elternbindung

Für HPSERVSD sind 4010 mit `FI_beendet=0` und 4020 mit `FI_beendet=737424`/31.12.2019 durch Rohbericht und HP-Anzeige bestätigt. Zulässig ist ausschließlich der exakt numerische Wert 0 bei vorhandener, eindeutiger FiBu-Zuordnung. Fehlende, ungültige, heutige oder künftige Beendigungswerte werden zurückgestellt. Das gleichlautende BIT-Feld `anzeigen_ja_nein` wird ausdrücklich nicht als Aktivfilter verwendet.

Jede Datenabfrage des Connectors enthält Objektbindung und `EXISTS (... FI_beendet=0)`. Vor Fingerabdruckvergleich und Datenübertragung wird der Status zusätzlich erneut gelesen. Der Server verlangt einen frischen Statusnachweis (maximal 60 Sekunden) für genau dieses Objekt. Ohne aktuellen Elternstatus werden keine Kinder übernommen. Büro-Kostenstellen (`BKS`) werden übersprungen.

Wird ein bereits importiertes Objekt später beendet, wird es in CuraAed archiviert und der weitere Kinderimport gesperrt. Zugehörige Datensätze und Dokumente bleiben erhalten. Eine spätere HP-Reaktivierung hebt nur eine vom Import selbst vorgenommene Archivierung auf; manuelle Archivierung bleibt erhalten. Ein in HP beendetes Objekt kann lokal nicht wieder aktiviert werden.

Die bei `FI_beendet` bestätigte Datumsdarstellung ist Gregorianischer Ordinaltag (1 = 01.01.0001). Für die weiteren ausdrücklich benannten HP-Datumsfelder ist diese Darstellung die gewählte Konvertierungsregel; deren Übereinstimmung mit den HP-Masken muss der erste Live-Lauf zusätzlich prüfen. Es werden nur gültige ganzzahlige Ordinalwerte konvertiert, 0/NULL bleibt leer. Andere INTEGER-Felder werden nicht als Datum interpretiert. Abweichende Quellformate verursachen eine sichtbare Zurückstellung. Nicht bestätigte Typcodes werden nicht pauschal als Mietverwaltung oder Wohnung geraten; Originalcode bleibt erhalten und die Verwaltung kann lokal zugeordnet werden.

## Neue und geänderte Daten

Der Connector liest je Seite höchstens 51 Zeilen, um 50 Datensätze und einen möglichen Rand-Duplikatfall zu prüfen. Fortsetzung erfolgt über geordnete, zusammengesetzte Quellschlüssel und gebundene Parameter. Pro HTTP-Anfrage werden höchstens 50 Fingerabdrücke oder Datensätze und 256 KiB akzeptiert. Die Serververarbeitung ist transaktional und seitenweise; der gesamte Bestand wird nicht im Arbeitsspeicher gesammelt.

Zuerst werden nur Quellschlüssel und SHA-256-Fingerabdrücke abgeglichen. Vollständige Importdatensätze werden nur für neue/geänderte oder fehlerbedingt noch ungeklärte Datensätze angefordert. Die kanonische Darstellung verwendet feste Feldreihenfolge, UTF-8-Byte-Längen und einen getrennten NULL-Marker. Windows und Node prüfen dieselben synthetischen Protokollvektoren. Basis, Hash und Identität liegen dauerhaft in SQLite; Wiederholung, Verbindungsabbruch, Tokenrotation und Serverneustart erzeugen keine neuen Entitäten für bereits zugeordnete Quellen.

Zur Änderungserkennung wird der HP-Bestand weiterhin **lokal** geprüft. Dies ist kein nachgewiesenes HP-Änderungsjournal. Nach einem Prüflauf wartet das Programm 60 Sekunden; die tatsächliche Wiederholungszeit hängt zusätzlich von der Laufzeit des Bestandsprüflaufs ab. Eine fehlende Zeile oder unvollständige Quellabfrage wird nie als Löschauftrag interpretiert.

Dezimalwerte werden mit kulturunabhängiger Darstellung einschließlich Auflösung von Exponenten übertragen und zusätzlich als Dezimaltext gespeichert. Die Genauigkeit des HP-/ODBC-Quelltyps kann damit erhalten, aber nicht nachträglich erhöht werden. Zahlen für vorhandene Flächenanzeigen sind davon getrennte, angenäherte Darstellungswerte. Die undatierten lokalen Altanteile werden nicht einem geratenen Jahr zugewiesen oder durch Jahreswerte ersetzt.

## Lokale Änderungen, Konflikte und Bedienung

Verglichen werden letzter HP-Stand, aktuelle lokale Werte und neuer HP-Stand. Unterschiedliche Felder können zusammengeführt werden. Ein lokal geändertes Feld bleibt erhalten, wenn HP dieses Feld nicht geändert hat. Bei konkurrierenden Änderungen desselben Felds wird der gesamte betroffene Datensatz angehalten und keine der geänderten Seiten darübergeschrieben.

Administratoren sehen betroffene Felder und beide Werte im Importbereich. Sie können den angezeigten HP-Stand übernehmen oder den CuraAed-Stand lokal behalten. Entscheidungen sind an den angezeigten Stand und eine frische HP-Bestätigung gebunden. Diese Entscheidung schreibt nie nach HP. Unveränderte Konfliktstände werden nicht fortlaufend als vollständige Datensätze erneut übertragen.

Importierte Konten erscheinen in den normalen Objekt-/Einheiten-/Adresskontenlisten. Bei Verteilerschlüsseln ist das Buchungsjahr auswählbar; standardmäßig wird der neueste importierte Jahresstand angezeigt, nicht ein behauptetes aktuelles HP-Arbeitsjahr. Jahresanteile sind zunächst lesend mit exaktem Dezimaltext und seitenweise abrufbar. Undatierte lokale Schlüssel bleiben separat bearbeitbar. HP-Jahresstände werden nicht über den alten, undatierten Editor gespeichert oder gelöscht.

Datensatzfehler rollen nur ihre eigene Verarbeitung zurück; andere gültige Datensätze laufen weiter. Fehlende Abhängigkeiten werden erneut angefordert, sobald sie verfügbar sind. Quellabfragefehler zeigen Datenbereich, HP-Objekt und ODBC-Status, ohne Kennwörter oder Datensatzwerte in das Protokoll zu schreiben. Die Webansicht begrenzt Fehler und Konflikte auf jeweils 50 Einträge. Nach Netzabbruch wird erneut verglichen; es gibt keine HP-Schreiboperation, die dabei versehentlich wiederholt werden könnte.

## Bereitstellungs- und Teststand

Migration 6 ergänzt Importzugang, Statusnachweise, dauerhafte Fingerabdrücke, Herkunftsmarkierungen und Fehlerzustände. Migration 5 und bestehende Adresskopplungen bleiben erhalten. Weder Migration noch Bereitstellung aktivieren den Import: dafür sind die gesonderte Freigabe und der Start des Windows-Programms erforderlich.

Automatisierte Prüfungen decken Objektbaum, Ausschluss beendeter/unklarer Eltern, Ablauf des Statusnachweises, exakte Jahresanteile, fehlende Abhängigkeiten, Feldkonflikte und Entscheidungen, Quelltrennung, Token-/Rechteprüfung, Wiederanlauf und Archivierung/Reaktivierung ab. Windows-Tests prüfen Protokollgleichheit, Cursorparameter und feste Leseabfragen ohne HP-Zugriff. Ein erster Lauf gegen die tatsächliche HP-Installation und deren Datensätze muss nach der Softwarefreigabe erfolgen; synthetische Tests ersetzen diese Live-Prüfung nicht.
