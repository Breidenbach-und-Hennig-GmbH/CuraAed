# STARFACE-Anbindung: Vorbereitung und noch fehlende Freigabe

Stand: 15.11.2026. Die Live-Anbindung ist noch nicht eingerichtet.
Bekannt ist die Windows-App-Version 9.0.2.11; die Serverversion ist nicht bestätigt.
Die App-Version darf nicht als Serverversion behandelt werden.

## Was in diesem Entwurf vorbereitet ist

- Eigene, an die CuraAed-Sitzung gebundene Anwesenheitsmeldungen pro Fenster alle 30 Sekunden.
- Mehrere Fenster und Sitzungen zählen gemeinsam; Logout entfernt die zugehörigen Meldungen.
- Geschlossene Fenster werden nicht durch verspätete Meldungen wieder geöffnet.
- Ohne aktuelle Meldung gilt CuraAed nach 120 Sekunden als nicht erreichbar.
- Die Mitarbeiterliste veröffentlicht nur Name, Kürzel, Bild und Status, keine Login-ID oder Sitzungstoken.
- Serverauswertung der drei Farben, sofern der spätere Adapter echte Daten liefert.
- Grau bei fehlender Login-ID, fehlender Anbindung, ungültigen oder veralteten Telefondaten.
- Statusaktualisierung der Symbole und der Mitarbeiterliste mit Erhalt des Tastaturfokus.
- Keine STARFACE-Passwörter, keine Änderungen an der Anlage, keine nachgebildeten Live-Daten.

## Was der STARFACE-Administrator noch prüfen muss

1. Tatsächliche Serverversion und Betriebsart der Anlage feststellen.
2. Den für diese Version unterstützten Zugriff auf UCI/Telefoniestatus und An-/Abmeldung prüfen.
3. Klären, ob Anmeldung an der STARFACE-App oder am Endgerät für die gewünschte Ampel maßgeblich ist.
4. Einen auf die benötigten Statusinformationen beschränkten Zugang für die Integration bereitstellen. Keine Zugangsdaten in Chat, Quellcode oder Protokolle kopieren.
5. Erforderliche Berechtigungen, Lizenzen und erreichbare verschlüsselte Verbindung prüfen. Keine Zertifikatsprüfung deaktivieren.
6. Login-ID und internen STARFACE-Benutzer eindeutig zuordnen.

Ein aktiviertes Telefon oder der Chatstatus allein belegt weder die gewünschte Benutzeranmeldung noch ein laufendes Gespräch. Ein reines API-Servicekonto darf nicht als Anwesenheit des Mitarbeiters gewertet werden.

## Noch zu implementieren: echter STARFACE-Adapter

Der vorbereitete interne Vertrag ist keine STARFACE-Schnittstelle. Es existiert noch kein produktiver Adapter, kein öffentliches Ereignis-Postfach und kein automatischer Abruf der Anlage.

Nach Prüfung der konkreten Version wird der Adapter in baueApp als options.starface übergeben. statusFuerLogins(loginIds) liefert eine Map, deren Schlüssel die gespeicherten Login-IDs sind und deren Werte echte, serverseitig empfangene Zustände enthalten:
- angemeldet: boolean
- telefoniert: boolean
- empfangen_am: serverseitiger Empfangszeitpunkt in Millisekunden

Keine Browseranfrage darf diese Telefondaten setzen. Die Frische läuft nach 90 Sekunden aus. Verbindungsabbrüche und Neustarts müssen zuerst einen erneuten vollständigen Statusabruf auslösen. Statusinformationen dürfen nicht durch andere Benutzerverbindungen oder eine falsche Anlage überschrieben werden.

## Abnahme nach Einrichtung

Mit einem freigegebenen Testkonto anmelden, einen ausdrücklich vereinbarten Testanruf führen und beenden, dann an beiden Anwendungen getrennt abmelden. Zusätzlich mehrere Fenster, Fenster schließen, Netzverlust, Wiederverbinden, Anlagenneustart und mehrere gleichzeitig offene bzw. gehaltene Gespräche prüfen. Keinen echten Anruf ohne Absprache auslösen.

Quellen:
- https://www.starface.de/support/de/versionhistory.php
- https://www.starface-cdn.de/starface/dokumente/handbuecher/sonstiges/Modulkomponenten-Handbuch_v01.pdf
