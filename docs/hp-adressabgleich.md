# Direkter HP-Adressabgleich

## Umfang

Der separate HP-Adressconnector übernimmt vorhandene `AD_Adr`-Adressen in die normalen CuraAed-Adressmasken. Änderungen an Anrede, Vorname, Name1 (Nachname/Firmenname), Name2 (Zusatz), Straße, Land, PLZ und Ort werden in beide Richtungen abgeglichen. Ein Mitarbeiter mit bestehendem CuraAed-Schreibrecht speichert im normalen Formular; keine erneute Adminfreigabe je Änderung.

Telefon, E-Mail, Bankdaten, Titel, Name3, Suchbegriff, Rollen, Objektzuordnungen, Neuanlage und Löschung **in HP** sind nicht angebunden. Lokale Zusatzfelder bleiben erhalten. HP-Typkennzeichen sind noch nicht verifiziert: importierte Einträge werden zunächst als Person mit Name1 als Nachname dargestellt; eine lokale Umstellung auf Firma ist möglich. Keine behauptete vollständige HP-Geschäftslogik oder Mehrmandantenplattform.

## Zuordnung und Abgleich

- Ein Kundenbestand pro CuraAed-Installation. Weitere HP-Kunden benötigen getrennte Installationen; diese gemeinsame Adressdatenbank hat keine vollständige Mandantentrennung.
- Stabile Zuordnung aus Verbindungs-ID und AdrNr, niemals Namensvergleich. Importierte Nummern `HP-<AdrNr>`; bestehende lokale Kontakte werden nicht stillschweigend zusammengeführt.
- Leseseiten zu 50 Datensätzen mit AdrNr-Keyset, vollständiger Umlauf und drei Sekunden Pause am Ende. Dauer hängt von Bestandsgröße und Verbindung ab. Kein sofortiger Webhook; HP muss nicht über Mobile synchronisieren.
- Neuer Connector: vor der Übertragung wird je lokaler Leseseite nur AdrNr plus SHA256-Fingerabdruck verglichen. Der Server fordert vollständige Datensätze nur bei neuen HP-Nummern, geändertem HP-Inhalt, lokalen CuraAed-Änderungen oder offenen/fehlerhaften Zuständen an. Die bestätigte Basis liegt dauerhaft in SQLite und bleibt über Neustarts/Schlüsselrotation erhalten. Unklare Aufträge bleiben von automatischer SQL-Wiederholung ausgeschlossen. Längenpräfixe und UTF8 sichern identische Hashes in C# und Node (einschließlich Umlauten).
- Wichtig: AD_Adr hat in den geprüften Felddefinitionen kein Änderungsdatum. Die lokalen HP-Leseseiten bleiben deshalb notwendig; lediglich die vollständige Datenübertragung ist inkrementell. Ein echtes HP-Änderungsjournal/CDC wurde nicht verifiziert oder eingerichtet. Unveränderte Datensätze senden weiterhin kleine Nummer/Hash-Metadaten; Löschungen werden nicht automatisch übertragen. Der alte Connector bleibt kompatibel, verwendet aber weiter vollständige Leseseiten.
- Ungültige Bestandsdaten oder belegte lokale Importnummern werden einzeln zurückgehalten und mit HP-Nummer/Feldgrund angezeigt. Der Rest der Seite läuft weiter. Nach Korrektur in HP wird der Eintrag beim nächsten Umlauf erneut geprüft. Verbindungsfehler werden ohne Dateninhalte sichtbar; keine stillschweigende Lockerung der Schreibprüfung.
- Feldweiser Dreiwegevergleich zwischen letztem bestätigten HP-Stand, aktuellem HP und CuraAed. Verschiedene Felder werden zusammengeführt; konkurrierende Änderungen desselben Felds stoppen genau diese Adresse.
- SQLite-Transaktionen für Änderungen und Zuordnungen. Versionsprüfung verhindert das Speichern veralteter Adressformulare. HP-Änderungen erscheinen in der Änderungshistorie.
- In HP ausschließlich feste Feldlisten und parametrisierte SQL-Befehle, serialisierbare Transaktion, Vergleich aller gelesenen Felder, betroffene Zeilenzahl genau eins, Rücklesen vor und nach Commit. Unveränderte Felder werden nicht geschrieben. HP-interne Such-/Folgefelder werden nicht geraten.
- Claimed Schreibaufträge werden nie erneut ausgeliefert. Verlorene Antworten/Commits werden durch exaktes Rücklesen geklärt; abweichende Ergebnisse erfordern Adminentscheidung. Kein automatisches Last-write-wins. Adressstatus und Konfliktentscheidung in normaler Adressmaske.

## Einrichtung und Grenzen

Neue, getrennte Freigabe in der HP-Einrichtungsmaske, explizit für alle Namen/Postanschriften. Der Testconnector-Schlüssel berechtigt nicht dazu. Schlüssel werden nur gehasht im Server gespeichert, im Browser verdeckt angezeigt und beim Schließen geleert. Der Windows-Connector prüft die lokale ODBC-Datenbank vor Übertragung. TLS, feste Zieladresse, keine Weiterleitungen oder Zertifikatausnahmen.

Freigaben sind wahlweise für acht Stunden oder dauerhaft bis zum Widerruf möglich. Eine bestehende aktive Verbindung kann der zugehörige Administrator mit „Dauerhaft freigeben“ nach ausdrücklicher Bestätigung umstellen; Schlüssel und Zuordnungen bleiben erhalten. Bestehende Zeitfreigaben werden nicht automatisch erweitert. `ablauf_ms=0` bedeutet unbefristet. Bei einer erneuten Kopplung wird der Schlüssel rotiert; ohne neue Dauerangabe bleibt eine zuvor dauerhafte Verbindung dauerhaft. Explizit acht Stunden wählen begrenzt sie wieder. „Adressabgleich trennen“, Deaktivierung des Administrators oder Entzug seiner Adminrolle sperren auch dauerhafte Schlüssel.

Im neuen Windows-Connector kann die Verbindung freiwillig gespeichert werden: DPAPI CurrentUser verschlüsselt DSN, Datenbank und Kopplungsdaten unter `%LOCALAPPDATA%\\CuraAed\\HPAdressconnector\\verbindung.dpapi`. Kein Klartextschlüssel auf der Festplatte; keine Maschinenfreigabe. Nur dasselbe Windows-Konto kann das Profil laden. Entfernen im Connector löscht das lokale Profil, widerruft aber nicht die Serverfreigabe. Ein beschädigtes/nicht entschlüsselbares Profil wird nicht verwendet. Nach Laden ist der manuelle Start und die Bestätigung im Connector erforderlich; keine automatische Anmeldung durch den Agenten. Vor dem Speichern werden Scope und Datenbankbindung validiert, die Serverbestätigung erfolgt beim Verbinden. Ein gespeicherter alter/widerrufener Schlüssel bleibt bis zum Ersetzen oder Entfernen unbrauchbar.

Der bereits laufende alte Connector profitiert ohne Update vom entfallenen Ablauf. Die optionale DPAPI-Speicherung erfordert das neue Windowsprogramm. Der Connector läuft weiterhin nur bei geöffnetem Fenster; kein Windows-Dienst und kein Autostart. Unbeaufsichtigter Betrieb nach Server-Neustart ist damit noch nicht eingerichtet.

Offener Ausbau: Personenfunktionen, Telefonnummern, ZIS und Bankverbindungen sind noch nicht synchronisiert. Ihre HP-Tabellen, Schlüssel und Schreibregeln müssen zuerst geprüft werden; leere CuraAed-Bereiche sind kein Nachweis leerer HP-Daten. Eine dauerhafte Freigabe dieser Stufe erweitert weder die Tabellen- noch die Feldrechte.

Vor produktiver Freigabe: Bereitstellung prüfen, neue Software lokal freigeben, zunächst normale Adressmaske mit CURAAED-TEST verifizieren (Änderung und Rücknahme). Andere echte Kontakte nicht für Teständerungen verwenden. Noch kein Live-Nachweis für diesen neuen Adressconnector; der vorangegangene Titel-Pilot wurde erfolgreich geprüft und zurückgesetzt.

## Erweiterte lesende Adressbereiche (adressen-v2)

Die Freigabe „Zusätzlich alle verknüpften Adressbereiche lesen“ umfasst die zehn HP-Menübereiche mit elf physischen Tabellen: AD_Adr, AD_AdrAn, AD_Bankverb, AD_SEPA_Mandat, AD_TelNr, AD_eMail, AD_eMail_Adresse_mar, AD_AnsprPart, AD_ASP_ZusatzInfo, SY_DSGVO_Aenderung (nur MODUL ADR), zusätzlich AD_BVakt als Hilfszuordnung. Feldlisten und natürliche Schlüssel stehen fest in lib/hpAdressBereiche.json; keine frei eingereichten SQL-Befehle. Alte v1-Freigaben erhalten diese zusätzlichen Rechte nicht. Erneutes Koppeln ohne Vollfreigabe sperrt die zusätzlichen Endpunkte wieder.

Vollständige HP-Zeilen bleiben mit ihren Quellschlüsseln erhalten. Telefon, E-Mail/Webseite, gültige IBAN-Bankverbindungen und Ansprechpartner werden zusätzlich in die normalen Adressbereiche übernommen. Fehlende oder lokal geänderte Einträge bleiben zur Prüfung erhalten. Ungültige IBANs werden ausschließlich in den Originaldaten bewahrt. Ein SEPA-Mandat wird niemals allein aus einer Bankverbindung abgeleitet. Zusätzliche Quellfelder und Protokoll sind für Administratoren in „HP-Adressbereiche“ lesbar. Der Hilfsbereich aktive Bankzuordnung zählt nicht als elfter Menübereich.

Fingerabdrücke vermeiden unveränderte Nutzdatenübertragung. Vollständige Bereiche werden in begrenzten Stapeln übertragen. Eine unvollständige oder zu große Lesung ersetzt keine früheren Daten. Einzelne Quellenfehler verhindern andere Bereiche nicht. Legacy-Namenswerte werden bei Bedarf unverändert lesend übernommen; die strikte CP850-Schreibprüfung bleibt bestehen.

Der Live-Status vor dieser Erweiterung: alter Connector seit 09.11.2026 ohne Kontakt und seine Zeitfreigabe abgelaufen. Ein laufender Windows-Connector und erneuerte Freigabe sind für den produktiven Import nötig. Ein vollständiger Live-Nachweis dieser Erweiterung steht noch aus.

Die automatische Neuanlage in HP ist weiter offen: SY_LfdNum mit Init @ enthält die höchste vergebene AdrNr. AD_AdrAn und das HP-Neuanlageprotokoll müssen konsistent erstellt werden. Ein blindes INSERT nur in AD_Adr oder eine MAX+1-Nummernvergabe ist nicht implementiert. Die erweiterte nur lesende Prüfung erfasst hierfür Anlagezeiten und Protokollschlüssel ohne Kontakt- und Bankwerte. Personenfunktionen und ZIS sind eigene, weiterhin nicht angebundene Bereiche.
