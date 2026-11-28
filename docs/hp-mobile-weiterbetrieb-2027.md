# Weiterbetrieb ohne HP Mobile

Stand: 27.11.2026. Möglicher Entzug des Mobile-Zugangs: 01.01.2027.
HausPerfekt-ERP auf Terminalserver und DB04 bleibt führend für Buchhaltung und Abrechnung.

## Erstes Arbeitspaket: Abhängigkeiten und Archivnachweis

Implementiert:

- `HP_MOBILE_DEAKTIVIERT=1` sperrt Mobile-OAuth, Token-Erneuerung,
  Metadatenabrufe und Binärdownloads, auch bei bereits geprüften Clients.
- Standard bleibt unverändert: keine automatische datumsabhängige Abschaltung.
- Lokale Archive und direkte HP-Connectoren sind von dieser Sperre nicht betroffen.
  Das ist keine Freigabe, Connectoren zu starten.
- Einstellungen → HP-Verbindungen → **Bestand ohne HP-Zugriff prüfen** liest
  ausschließlich die CuraAed-Datenbank, administratorgeschützt und ohne Tokens.
- Dieser Bericht unterscheidet Metadaten, vermerkte Dateikopien und offene Kopien.
  Er bestätigt weder den physischen Dateibestand noch den vollständigen Quellbestand.
- `tools/hp-archiv-pruefen.js` öffnet eine vorhandene CuraAed-Datenbank explizit
  nur lesend. Vorzugsweise mit einer konsistenten Sicherung und deren Archiv ausführen:

```text
node tools/hp-archiv-pruefen.js DATENBANK ARCHIVORDNER
node tools/hp-archiv-pruefen.js DATENBANK ARCHIVORDNER --sha256
```

Die Ausgabe ist JSON. Ohne `--sha256` werden Dateityp, Vorhandensein, Größe und
Prüfsummen-Metadaten geprüft. Mit dem Schalter werden die tatsächlichen Dateiinhalte
gelesen und gehasht. Kein Netzwerk, keine ERP-Abfrage, keine Änderungen an Datenbank
oder Archiv. Ausgabe enthält höchstens 100 Fehlerbeispiele, alle Fehler werden gezählt.
Keine Prüfung normaler CuraAed-Uploads oder noch nicht erfasster HP-Dokumente.
Größenabweichungen sind Prüfhinweise, kein Nachweis einer beschädigten Datei.

## Verbliebene Mobile-Wege

| Code | Abhängigkeit | Übergang |
|---|---|---|
| `services/hausperfektVerbindungen.js` | OAuth-Anmeldung und Token-Erneuerung | Nur für verbleibende Übernahme; danach Abschalttest |
| `services/hausperfektMobile.js` | Personen, Gebäude, Einheiten, Dokumente, ZIS, Akten, Aufgaben, HWA, Notizen | Lokale Masken von vollständig übernommenen Daten versorgen |
| `services/hpFachbereiche.js`, Importteil in `services/vorgaenge.js` | Mobile-Listen und Details als Importquelle | Direkte, freigegebene ERP-Übernahme vervollständigen |
| `services/hpDms.js`, Übernahmeteil in `services/hpDmsArchiv.js` | Mobile-Metadaten und fehlende Binärdateien | Vollständige lokale Kopien und Quellenabgleich |
| Mobile-Personenänderungsanträge | Antrag ist kein bestätigter ERP-Schreibvorgang | Direkten freigegebenen Änderungsweg separat umsetzen |

Gesicherte Dateien lassen sich über lokale Archivwege auch nach Entfernen der
OAuth-Verbindung öffnen. Tests dazu existieren in `test/hp-dms-archiv.test.js`.
Ein erfolgreicher Unit-Test ist keine Generalprobe mit dem vollständigen Produktivbestand.

## Kundenkonten: Export gesichert, getrennte Vorbereitung implementiert

Am 27.11.2026 zeigt die bereits angemeldete Benutzerverwaltung von
`sd-gm.hausperfekt-mobile.de` 1.723 Kontoeinträge. Sichtbar sind ID, Person,
E-Mail, Anmeldezahl, Versanddatum, Erstellungsdatum, letzte Anmeldung und
zugeordnete Personen. Die Zahl umfasst auch Konten ohne Anmeldung und mindestens
einen Eintrag ohne nutzbare E-Mail-Adresse. Es handelt sich nicht um 1.723 bestätigte,
aktuelle Eigentümer oder Mieter.

Der erneute Abruf am 27.11.2026 mit Sortierung nach `created_at` funktioniert.
Alle 18 Seiten mit insgesamt 1.723 verschiedenen Konto-IDs und vollständigen
Personenbezügen wurden lokal als `HP-Mobile-Kunden-2026-11-27.json` gesichert.
Zwei interne/technische Konten sind auszuschließen; es bleiben 1.721 Kundenkonten.
Diese haben E-Mail-Adressen, ohne doppelte Adressen nach Normalisierung.
Die Ursache der zuvor beobachteten HTTP-500-Antworten ist damit nicht abschließend geklärt.

Die Sicherung enthält nur Konto-ID, Name, E-Mail, interne Kontokennzeichen,
Anmeldezahl und Personen-/HP-Adressnummern. Keine Passwörter oder Zugriffstokens.
Die private Exportdatei und ihre Prüfergebnisse gehören nicht ins Git-Repository.

### Bedienung der vorbereiteten Kundenverwaltung

Firmenbezug (28.11.2026): Der erste exportierte Bestand wird nach ausdrücklicher
Zuordnung durch die Anwenderin für **Breidenbach und Hennig GmbH** eingerichtet.
Der Portalname `sd-gm` bestimmt nicht den Firmennamen. Andere Firmen können eigene
Importquellen zuordnen. Die Programmlogik enthält keine feste Firmen- oder Portal-ID.
Kundenquellen sind fest an eine Firma gebunden und können nicht umgehängt werden.
Der Zugriff auf gebundene Quellen setzt eine ausdrückliche Firmenzugehörigkeit voraus;
auch ein früherer Quelleneigentümer verliert ohne diese Zuordnung den Zugriff.
Eine weitere Firma mit denselben externen Konto-IDs oder E-Mails bleibt getrennt.
Das betrifft diese Kundenverwaltung; die übrigen ERP-Module müssen für einen
gemeinsamen Mehrfirmenbetrieb separat auf vollständige Datentrennung geprüft werden.

System → Kundenverwaltung (`#/kunden`), nur für Administratoren:

1. Eigene HP-Archivquelle auswählen und einmalig der zuständigen Firma zuordnen;
   sie bleibt auch nach Trennung der Mobile-Anmeldung erhalten.
2. **Exportdatei** wählen und **Vorschau** öffnen. Die Vorschau verändert keine Konten.
3. **Übernehmen** legt separate Einträge in `kunden_konten` an; niemals in `benutzer`.
4. Wiederholung aktualisiert über `(quelle_id,externe_id)` ohne doppelte Konten.

Zuordnungen erfolgen nur über die direkte HP-Quelle und die HP-Adressnummern,
einschließlich bereits zusammengeführter Adressen. Aktuelle Eigentümer-/Mieterrollen,
Gültigkeitsdaten und archivierte Objekte/Einheiten/Adressen werden geprüft.
Mehrdeutige oder fehlende Bezüge erhalten `pruefen`. Interne und technische Konten
werden ausgeschlossen, gleiche E-Mails nicht zusammengeführt. Entfernte Quellkonten
bleiben gesperrt erhalten. Eine inzwischen veränderte Vorschau wird verworfen.

Auch `vorbereitet` schaltet keinerlei Anmeldung oder Dokumentzugriff frei.
Über **Zugang** wird zunächst die aktuelle Zuordnung geprüft. Nur eindeutig bestätigte
Eigentümer-/Mieterfunktionen in aktiven Objekten derselben direkten Quelle berechtigen
zur Erstellung eines Einmal-Links. Der Link gilt sieben Tage; ältere Links werden
widerrufen. Er wird nicht automatisch verschickt. Kunden wählen ihr Passwort selbst.
Aktivierungen und 24-Stunden-Kundensitzungen sind vollständig von Mitarbeiterkonten
getrennt. Im Speicher liegen ausschließlich Hashes der Link- und Sitzungsgeheimnisse.
Firmenkennung, Kontorevision, aktuelle Adress-/Wohnungszuordnung und Rollengültigkeit
werden bei jedem Portalzugriff erneut geprüft; Änderungen entziehen den Zugriff.
Das Portal zeigt derzeit nur die eigenen Objekt- und Wohnungszuordnungen.
Dokumentabruf, Tickets und die übrigen Mobile-Funktionen sind damit noch nicht ersetzt.
Über **Aus Adresse** kann ein Administrator einen separaten Kundenzugang vorbereiten,
wenn ein Eigentümer zuvor nur als HP-Mobile-Teamkonto geführt wurde. Die ausgewählten
HP-Adressnummern müssen aus derselben Firmenquelle stammen; die E-Mail muss in einer
dieser Adressen hinterlegt sein. Gleiche E-Mails mit anderen Zuordnungen werden
abgewiesen. Explizit angelegte `ca:`-Identitäten sind vom HP-Mobile-Reimport getrennt.
Auch dieser Schritt vergibt keine Mitarbeiterrechte und erzeugt keinen Aktivierungslink.
**Testkunde** bereitet alternativ eine firmengebundene Testidentität ohne echte Adress-,
Objekt- oder Wohnungszuordnung vor. Sie kann die Kundenanmeldung ausprobieren, sieht
aber keine fremden Bestandsdaten. Eine spätere Mitarbeiterfreigabe erfolgt separat in
der Benutzerverwaltung mit eigener Identitätsprüfung; Kundenpasswörter und Sitzungen
werden nicht zu Mitarbeiter-Anmeldungen aufgewertet. `test:`-Konten bleiben beim
HP-Mobile-Reimport erhalten. Zusätzliche echte Adressbezüge sperren diesen Testzugang.

Der vollständige Export wurde testweise zweimal in eine temporäre Speicher-Datenbank
übernommen: zuerst 1.721 neue Einträge, danach 1.721 unveränderte Einträge, jeweils
null Freischaltungen. Das ist kein Abgleich gegen die aktuellen Produktivadressen.
Am 28.11.2026 wurden anschließend 1.721 produktive Vorbereitungseinträge angelegt.
1.452 bestehen die erste Rollenprüfung, 269 bleiben zur Prüfung gesperrt. Die zusätzliche
Aktivierungsprüfung verlangt auch aktive Verwaltung und dieselbe Objekt-/Wohnungsquelle;
die 1.452 sind daher keine Zahl freigeschalteter Zugänge. Bei dieser Übernahme wurden
keine Links erzeugt, keine Passwörter vergeben und keine Einladungen verschickt.

Für die Übernahme:

1. Vollständiger Benutzerexport einschließlich Personenbezügen ist gesichert;
   vor der endgültigen Umstellung nochmals aktuell exportieren und vergleichen.
2. Quell-IDs, Personen-/Adressnummern und bestehende Verbindungszuordnung erhalten.
   Namensgleichheit oder gleiche E-Mail alleine begründet keine Berechtigung.
3. Aktuelle Eigentümer-/Mieterfunktionen und Gültigkeitszeiträume prüfen.
   Firmen, Eheleute, mehrere Personen pro Konto und ehemalige Bewohner gesondert behandeln.
4. Separate Kundenidentitäten und Berechtigungsprüfung sind vorhanden, getrennt von
   `benutzer` (Mitarbeiter) und ETV-Gastlinks. Fehlende oder mehrdeutige Zuordnungen bleiben gesperrt.
5. Neue einmalige, zeitlich begrenzte Aktivierungslinks; keine übernommenen
   Klartextpasswörter. Einladungen erst mit funktionsfähigem Kundenportal versenden.
6. Objektfremde Dokumente, direkte Download-URLs, Besitzerwechsel und Entzug
   von Rechten mit mindestens zwei getrennten Testkunden prüfen.

## Abnahme vor Weihnachten

- Vollständiger Quellvergleich, offene Importfälle einzeln nachvollziehbar.
- Physische Archivprüfung und Wiederherstellung von DB, Uploads, HP-Archiv und
  benötigten Verschlüsselungsschlüsseln aus einer Sicherung.
- Mobile auf einer Testinstallation abschalten; echte tägliche Abläufe mit
  Adressen, Objekten, Wohnungen, Dokumenten, Akten, HWA, Tickets und Wiedervorlagen prüfen.
- FIBU und Abrechnung bleiben bis zur gesonderten Abnahme im HP-ERP.
- Nach dem bisherigen Datenbankausfall keine neuen DB04-Prüfprogramme starten,
  bevor der betreffende Zugriff kontrolliert geklärt ist.

Offen: vollständiger Produktivnachweis, vollständiger Funktionsumfang des Kundenportals,
Online-Belegprüfung, Übergabeprotokolle, durchgängiger ERP-Abgleich und automatischer
HP-Abrechnungsadapter für den Vermögensstatus. Diese Datei behauptet keinen Abschluss.
