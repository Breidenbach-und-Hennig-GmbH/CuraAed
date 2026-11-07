# HP-Mobile-Anbindung: geprüfter Verbindungsweg

Stand: 7. November 2026. Grundlage ist die mit Zustimmung der Betreiberin
untersuchte Anwendung unter `https://sd-gm.hausperfekt-mobile.de/`, einschließlich
der angemeldeten Hausverwaltungsansicht und ihrer ausgelieferten Clientmodule.

## Tatsächlich verwendete Verbindung

Die Mobile-Anwendung verwendet **`https://api.hausperfekt-mobile.de`**.
Das ist eine andere Schnittstelle als der zuvor untersuchte Datendienst unter
`https://api.hausperfekt.de`. Aus dessen Dokumentation lässt sich nicht ableiten,
dass der Mobile-Anbindung Schreibwege fehlen.

| Zweck | Beobachtetes Protokoll |
|---|---|
| Anmeldung | `POST /oauth/token`, Grant `password`, Benutzername/Passwort und OAuth-Anwendungsparameter |
| Erneuerung | Derselbe Endpunkt mit Grant `refresh_token` |
| Kundenbindung | Header `HPAPI-DOM`, abgeleitet aus der Portal-Subdomain |
| API-Authentifizierung | Header `Authorization: Bearer …` |
| Kundenmitgliedschaft | `GET /api/v1/whoami`, Zuordnung über `clientdatabases[].subdomain` |
| Daten lesen | `/api/v1/persons`, `addresses`, `buildings`, `units`, `documents`, `cis`, `syncs` |
| Personenänderung anfordern | `POST /api/v1/person_updaterequests` |
| Änderungsstand lesen | `GET /api/v1/person_updaterequests/{id}/process` |
| Bestehende Freigabe im Portal | `PUT /api/v1/person_updaterequests/{id}/approve` |

Die Clientmodule enthalten weitere POST-/PUT-/DELETE-Operationen. Deren Vorhandensein
ist kein Nachweis, dass jede Portaländerung unverzüglich oder überhaupt in das
ERP zurückgeschrieben wird. Die konkrete fachliche Verarbeitung muss pro Datenart
geprüft werden. Ein reines Portal-Update erfüllt den bidirektionalen ERP-Abgleich
noch nicht.

Im vorhandenen Verwaltungsportal sind erfolgreiche Abgleichläufe sichtbar, die
überwiegend stündlich starten und teilweise etwa 35 Minuten benötigen. Eine
Sekunden-Synchronisation wird durch diese Beobachtung nicht belegt.

## Implementierter Einrichtungsschritt

`#/hausperfekt` ermöglicht persönliche Verbindungen zu unterschiedlichen
HP-Mobile-Portalen sowie einen begrenzten, direkten Lesezugriff zur Prüfung.
Jede Verbindung gehört einem konkreten CuraAed-Benutzer und enthält ihre eigene
Kundenkennung. Vor dem Abruf wird deren Mitgliedschaft über `whoami` geprüft.
Anmeldetokens werden AES-256-GCM-verschlüsselt gespeichert; der Schlüssel liegt
neben der persistenten SQLite-Datenbank in `.hausperfekt-token-key` und gehört
in die geschützte Sicherung. Die Verschlüsselung bindet Benutzer, Verbindung
und Portalkennung ein. Das HP-Benutzerpasswort wird nicht gespeichert.

Konfiguration im Secret Store des App-Hosts:

- `HP_MOBILE_CLIENT_ID`: OAuth-Anwendungskennung für den autorisierten Anmeldeweg.
- `HP_MOBILE_CLIENT_SECRET`: zugehöriger Anwendungsparameter; kein Standardwert im Repository.
- `APP_PUBLIC_URL` oder auf Render dessen `RENDER_EXTERNAL_URL` für die Origin-Prüfung.

Der Adapter implementiert auch das beobachtete Format eines Personenänderungsantrags:
Original- und Änderungssnapshot als `current_data` und `updated_data`, Erhalt der
Fremdschlüssel sowie explizite Löschmarkierungen für entfernte Kontaktdaten.
Diese Schreibfunktion ist in diesem Einrichtungsschritt **nicht als HTTP-Route
freigeschaltet**. Es werden keine Änderungen freigegeben, keine Benachrichtigungen
versendet und keine echten ERP-Datensätze verändert.

Die bisherigen lokalen CuraAed-Masken bleiben während der Einrichtung lokal.
Der neue Bildschirm sagt dies ausdrücklich. Eine gespeicherte Verbindung ist
kein Nachweis einer abgeschlossenen fachlichen Synchronisation.

## Noch erforderliche fachliche Kopplung

1. Persönliche HP-Anmeldung in CuraAed durch die Betreiberin und Prüfung der
   tatsächlich gelieferten Datenfelder und Rechte.
2. Zuordnung der vorhandenen CuraAed-Masken zu HP-Datenarten und Fremdschlüsseln.
3. Dauerhafte, kundenbezogene Änderungsaufträge und Statusverfolgung bis zur
   bestätigten Verarbeitung im ERP; Behandlung von Konflikten und Wiederholungen.
4. Autorisierter, nachvollziehbarer Schreib-/Rücklesetest mit einem vereinbarten
   Testdatensatz. Keine stillen Änderungen an vorhandenen Kundendaten.
5. Vollständige Kundentrennung auch für die bisherigen lokalen CuraAed-Daten,
   Benutzerverwaltung, Dateien und Sicherungen vor einem Mehrfirmenbetrieb.

Der Verbindungsschritt allein macht die heutige gemeinsame lokale Datenbank
nicht zu einer vollständig mandantenfähigen Plattform. Die neuen persönlichen
HP-Verbindungen erlauben keine fremden Verbindungszugriffe; das ersetzt nicht
die noch ausstehende Trennung der übrigen Anwendungsbereiche.

## Validierung

Automatisierte Tests prüfen feste Zielhosts, Kundenkennung und Token-Trennung,
Mitgliedschaft, HTTP-Rechte, Origin und Zustimmung, Verschlüsselung und Neustart,
Token-Erneuerung sowie das Format der Änderungsanträge. UI-Tests prüfen die
Kennzeichnung des Einrichtungsschritts, die Passwortbereinigung und die sichere
Darstellung gelesener Daten. Tests verwenden synthetische Anbieterantworten.
