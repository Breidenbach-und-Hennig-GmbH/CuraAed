# Zählerverwaltung und Lobaro: erster Ausbau

Stand: 24.11.2026. Geprüfter GitHub-Hauptstand vor Beginn: e4de693d24d3b3c4e9afcd0860acac8f92b8e407 (PR108). Die Änderungen werden zunächst lokal geprüft; eine Veröffentlichung ist gesondert nachzuweisen.

## Vorhandener Bestand

Vorher war der Objektknopf „Zähler“ gesperrt. Eine eigene Zähler-, Zählpunkt- oder Messwerttabelle und eine Lobaro-Anbindung waren im untersuchten Code nicht vorhanden. Es werden keine vorhandenen HP-Zähler ersetzt oder als übernommen markiert.

Der gesicherte HP-Objektbestand `HP-Pruefobjekte.json` enthält **4236 – DAMIANSWEG 2, Köln**. Die im Gespräch zunächst vermutete Nummer 4242 ist nicht die belegte Nummer dieses Objekts. Vor dem Live-Test das richtige Objekt im aktuellen System bestätigen; die interne CuraAed-ID ist nicht identisch mit der HP-Objektnummer.

## Bedienung

Im Objekt auf **Zähler** klicken. Die Maske verwendet den gemeinsamen CuraAed-Rahmen. F4 öffnet die Zählpunktanlage. Suchfeld, Tab-Reihenfolge und normale Formulareingabe sind vorhanden. Lobaro-Feldzuordnungen sind im Geräteformular eingeklappt.

- Zählpunkt: Objekt, optionale Wohnung, Bezeichnung, Medium, Haupt-/Wohnungs-/Unterzähler und optionale MaLo-ID.
- Die MaLo-ID wird als elfstellige Zeichenfolge gespeichert, einschließlich führender Nullen. Die Prüfung umfasst Format und Dubletten, keine Prüfzifferprüfung. Sie ist für Strom/Gas vorgesehen; Wasser-/Wärmezähler erhalten keine erfundene MaLo-ID.
- Geräte: Zählernummer, Einheit, Einbau-/Ausbaudatum. Zählpunkt und MaLo bleiben beim Gerätewechsel erhalten. Alte Geräte und Messwerte werden nicht gelöscht.
- Messwerte: Zählerstand als Dezimaltext bis zu sechs Nachkommastellen, Originalzeitpunkt mit Zeitzone, Quelle und Akteur. Zeiträume werden nach Europe/Berlin geprüft. Fehlende Werte bleiben fehlend; echte Nullwerte werden angezeigt.
- Überlappende Gerätezeiträume, fremde Wohnungszuordnung, abweichende bestehende Messwerte und doppelt verwendete Lobaro-Messkanäle werden abgewiesen. Ein Gerätewechsel am selben Tag ist möglich; bei gemeinsamem Gateway muss die jeweilige Zählerkennung eindeutig sein.

## Dokumentierter Lobaro-Vertrag

Quellen, am 24.11.2026 abgerufen:

- https://platform.lobaro.com/api#/devices/get_api_devices
- https://platform.lobaro.com/api/swagger.yaml

Verwendet werden ausschließlich lesende GET-Aufrufe:

- `/api/devices`: Geräte, mit `noSuborgs=true`.
- `/api/devices/{devId}/parsed-data`: Messdatensätze eines ausdrücklich zugeordneten Geräts.
- Authentifizierung über `Authorization: Bearer …`.
- Antwort: `{pagination:{offset,limit,total},data:[…]}`. Messdatensätze enthalten `id`, `deviceId`, `createdAt`, `time`, `data`.
- Die Inhalte innerhalb `data` sind geräte-/parserabhängig. Keine erfundenen WAM-Feldnamen oder ungeprüfte automatische Zuordnung. Wert-, Zeit-, Einheiten- und optionale Kennungsfelder werden anhand eines echten Datensatzes konfiguriert. Punktpfade dürfen auch numerische Arrayindizes enthalten.

Der Client ist auf `https://platform.lobaro.com` beschränkt, folgt keinen Weiterleitungen, begrenzt Zeit, Antwortgröße, Seitenzahl und Importumfang. Ein Wechsel zu einer anderen Instanz erfordert eine ausdrückliche Erweiterung, keinen beliebigen URL-Eintrag.

## Übernahmeablauf

1. Administrator öffnet am richtigen Objekt „Lobaro einrichten / prüfen“ und hinterlegt einen für die benötigten Geräte freigegebenen, möglichst nur lesenden API-Token.
2. „Geräte lesend prüfen“ ruft die freigegebenen Geräte ab. Der Knopf verändert bei Lobaro nichts.
3. Geräte und Messkanäle nach echten Kennungen und WAM-Unterlagen dem passenden Zähler zuordnen. Ein Gateway kann mehrere Zähler liefern; seine Geräte-ID allein reicht dann nicht aus.
4. Zeitraum wählen (höchstens 93 Tage), Vorschau abrufen. Die API filtert nach Anlagezeit; verspätete Uploads werden mit erfasst, der Messzeitpunkt wird gesondert auf den gewählten Zeitraum und Geräteeinbau geprüft. Pro Gerät höchstens 2.000 Datensätze, insgesamt höchstens 2.000 ausgewählte Messwerte.
5. Bei fehlerfreier Vorschau ausdrücklich „Geprüfte Werte übernehmen“. Vorschau ist serverseitig gespeichert, 30 Minuten gültig, an Benutzer und Objekt gebunden und nur einmal verwendbar. Geänderte Verbindung oder Gerätezuordnung erfordert eine neue Vorschau.
6. Atomare Übernahme: bestehende gleiche Werte werden übersprungen; abweichende Werte bleiben unverändert. Originale Lobaro-JSON-Datensätze werden mitgespeichert. Fehler führen nicht zu einem stillen Teilimport.

**Keine automatische Zeitsteuerung ist aktiviert.** Monatlicher Dauerabruf, Verbrauchsberechnung/UVI und HP-Rückschreiben sind nicht Bestandteil dieses ersten Ausbaus.

## Zugang und Sicherung

API-Tokens werden objektbezogen serverseitig mit AES-256-GCM gespeichert und weder über Statusabfragen ausgegeben noch in Fehlern protokolliert. Der zugehörige Schlüssel liegt neben der Datenbank als `.lobaro-token-key`; die Datei ist aus Git ausgeschlossen und muss zusammen mit der Datenbank gesichert werden. Ein fehlender/falscher Schlüssel darf nicht durch eine scheinbar erfolgreiche Verbindung verdeckt werden. Auf Render muss der Datenbankordner auf dem bestehenden persistenten Speicher liegen.

## Live-Abnahme Damiansweg – noch offen

- Aktuellen Objektbestand und vorhandene HP-Zähler des Damianswegs vergleichen; die alten Strukturberichte enthalten noch keinen verifizierten Zählerimportvertrag.
- WAM/Lobaro-Token mit Gerätefreigabe bereitstellen; die geöffnete Mail von Dominic Blumberg enthält den Dokumentationslink, keine Zugangsdaten.
- Tatsächliche Gateway-/Geräte-ID, Zählernummern, Messkanäle, Einheiten und Messzeitpunkte anhand echter Daten prüfen.
- Soweit vorhanden, MaLo-ID aus der echten Strom-/Gasrechnung übernehmen; nicht aus einer Testdatei.
- Monatswerte zunächst Oktober/November 2026 mit WAM/HP vergleichen. Inbetriebnahmedatum 18.09. ist nur eine Gesprächsangabe, kein geprüfter Zählerstammsatz.
- Danach wiederholten Abruf, Gerätewechsel und Fehlerfall im echten Testobjekt abnehmen, bevor eine automatische Übernahme eingerichtet wird.

Alle Zählernummern, MaLo-IDs und Messwerte in den automatisierten Tests sind ausdrücklich fiktive Testdaten. Es wurden keine fiktiven Geräte im Produktivobjekt angelegt.
