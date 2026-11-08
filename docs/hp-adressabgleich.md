# Direkter HP-Adressabgleich

## Umfang

Der separate HP-Adressconnector übernimmt vorhandene `AD_Adr`-Adressen in die normalen CuraAed-Adressmasken. Änderungen an Anrede, Vorname, Name1 (Nachname/Firmenname), Name2 (Zusatz), Straße, Land, PLZ und Ort werden in beide Richtungen abgeglichen. Ein Mitarbeiter mit bestehendem CuraAed-Schreibrecht speichert im normalen Formular; keine erneute Adminfreigabe je Änderung.

Telefon, E-Mail, Bankdaten, Titel, Name3, Suchbegriff, Rollen, Objektzuordnungen, Neuanlage und Löschung **in HP** sind nicht angebunden. Lokale Zusatzfelder bleiben erhalten. HP-Typkennzeichen sind noch nicht verifiziert: importierte Einträge werden zunächst als Person mit Name1 als Nachname dargestellt; eine lokale Umstellung auf Firma ist möglich. Keine behauptete vollständige HP-Geschäftslogik oder Mehrmandantenplattform.

## Zuordnung und Abgleich

- Ein Kundenbestand pro CuraAed-Installation. Weitere HP-Kunden benötigen getrennte Installationen; diese gemeinsame Adressdatenbank hat keine vollständige Mandantentrennung.
- Stabile Zuordnung aus Verbindungs-ID und AdrNr, niemals Namensvergleich. Importierte Nummern `HP-<AdrNr>`; bestehende lokale Kontakte werden nicht stillschweigend zusammengeführt.
- Leseseiten zu 50 Datensätzen mit AdrNr-Keyset, vollständiger Umlauf und drei Sekunden Pause am Ende. Dauer hängt von Bestandsgröße und Verbindung ab. Kein sofortiger Webhook; HP muss nicht über Mobile synchronisieren.
- Feldweiser Dreiwegevergleich zwischen letztem bestätigten HP-Stand, aktuellem HP und CuraAed. Verschiedene Felder werden zusammengeführt; konkurrierende Änderungen desselben Felds stoppen genau diese Adresse.
- SQLite-Transaktionen für Änderungen und Zuordnungen. Versionsprüfung verhindert das Speichern veralteter Adressformulare. HP-Änderungen erscheinen in der Änderungshistorie.
- In HP ausschließlich feste Feldlisten und parametrisierte SQL-Befehle, serialisierbare Transaktion, Vergleich aller gelesenen Felder, betroffene Zeilenzahl genau eins, Rücklesen vor und nach Commit. Unveränderte Felder werden nicht geschrieben. HP-interne Such-/Folgefelder werden nicht geraten.
- Claimed Schreibaufträge werden nie erneut ausgeliefert. Verlorene Antworten/Commits werden durch exaktes Rücklesen geklärt; abweichende Ergebnisse erfordern Adminentscheidung. Kein automatisches Last-write-wins. Adressstatus und Konfliktentscheidung in normaler Adressmaske.

## Einrichtung und Grenzen

Neue, getrennte Freigabe in der HP-Einrichtungsmaske, explizit für alle Namen/Postanschriften. Der Testconnector-Schlüssel berechtigt nicht dazu. Schlüssel werden nur gehasht im Server gespeichert, im Browser verdeckt angezeigt und beim Schließen geleert. Der Windows-Connector hält den Schlüssel nur im Arbeitsspeicher und prüft die lokale ODBC-Datenbank vor Übertragung. TLS, feste Zieladresse, keine Weiterleitungen oder Zertifikatausnahmen.

Aktuell acht Stunden Freigabe, danach explizit erneuerbar bei Erhalt aller Zuordnungen. Der Connector läuft nur bei geöffnetem Fenster; kein Dienst und kein Autostart. Damit ist dies eine kontrollierte Inbetriebnahmestufe, noch kein unbeaufsichtigter Dauerbetrieb. Eine dauerhafte Einrichtung benötigt separat freigegebene sichere Zugangsspeicherung, Dienstbetrieb und Betriebsüberwachung.

Vor produktiver Freigabe: Bereitstellung prüfen, neue Software lokal freigeben, zunächst normale Adressmaske mit CURAAED-TEST verifizieren (Änderung und Rücknahme). Andere echte Kontakte nicht für Teständerungen verwenden. Noch kein Live-Nachweis für diesen neuen Adressconnector; der vorangegangene Titel-Pilot wurde erfolgreich geprüft und zurückgesetzt.

