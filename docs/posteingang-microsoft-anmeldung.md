# E-Mail und Microsoft-Anmeldung

In der Hauptnavigation öffnet **E-Mail** den Posteingang. Auswahl zwischen Firmenpostfach und eigenem Mitarbeiterpostfach, Posteingang/Gesendet, Suche und Folgeseiten. Nachrichten werden als Text angezeigt; HTML, Skripte und externe Bilder werden nicht ausgeführt oder geladen. Dateianhänge bis 10 MB können heruntergeladen werden. Outlook-Elemente, Verweisanhänge und größere Anhänge werden als solche angezeigt und bleiben in Outlook verfügbar.

Antworten verwenden den ursprünglichen Microsoft-Nachrichtenverlauf einschließlich Reply-To. Vor dem Versand zeigt CuraAed Absender und Empfänger. Eine Annahme durch Microsoft ist kein Zustellnachweis. Bei unklarem Versand erfolgt kein automatischer zweiter Versand; Gesendet prüfen. Nachrichten können mehreren Adressen, Objekten und zugänglichen Akten zugeordnet werden. Auswahl durch Nummer/Name, Pfeiltasten, Enter oder Tab. Zugeordnete E-Mails sind über Sprünge → E-Mail im jeweiligen Datensatz bzw. Korrespondenz der Akte erreichbar. Die gespeicherte Textkopie bleibt nach Verschieben/Löschen der Originalmail lesbar; Antworten und Anhänge benötigen die Originalmail.

## Einmalige Einrichtung

Die bestehende verschlüsselte Microsoft-App-Konfiguration in der Benutzerverwaltung wird weiterverwendet. Keine Schlüssel im Browser oder in zusätzlichen Servervariablen.

1. In der Microsoft-App zusätzlich die Web-Rückleitungsadresse `https://curaaed.onrender.com/api/auth/microsoft/callback` eintragen. Die bestehende Adresse `/api/m365/callback` bleibt erhalten.
2. Delegierte Rechte für den Firmenposteingang: `Mail.Read.Shared`, vorhandenes `Mail.Send.Shared` und `User.Read`, `offline_access`. Das angemeldete Microsoft-Konto benötigt zusätzlich Leserechte auf das tatsächliche gemeinsame Postfach sowie Senden-als-Rechte. Die vorhandene Kalenderfreigabe gewährt keine E-Mail-Leserechte. CuraAed liest ausschließlich das konfigurierte Firmenpostfach über `/users/<Absender>/...`.
3. Unter Einstellungen → Firmenpostfach / Postversand **Posteingang freigeben** oder im E-Mail-Fenster **Postfach verbinden**. Bestehende Teams- und Kalenderrechte werden beibehalten, auch bei Token-Erneuerung.
4. Jeder Mitarbeiter meldet sich mit seiner **eigenen CuraAed-Kennung** an. Im E-Mail-Fenster **Mein Postfach** auswählen und das eigene Geschäfts-/Schulkonto verbinden. Benötigt `Mail.Read`, `Mail.Send`, `User.Read`, `offline_access`. Kein Zugriff eines anderen Mitarbeiters oder des Administrators auf persönliche Nachrichten über diese Schnittstelle. Eine lokale Zuordnung zu einer Adresse oder Akte veröffentlicht persönliche Nachrichten nicht an andere Mitarbeiter.

## Anmeldung über Microsoft

Unter dem Benutzermenü **Meine Microsoft-Anmeldung** wird nach Bestätigung des aktuellen CuraAed-Passworts das eigene Geschäftskonto verbunden. Microsoft-Konto und CuraAed-Kennung werden über Mandanten-ID und unveränderliche Microsoft-Benutzer-ID verbunden. Keine automatische Benutzeranlage und kein Abgleich allein anhand des E-Mail-Namens. Das Sammelkonto `Administrator`/`admin` ist für eine persönliche Verknüpfung gesperrt.

Nach erfolgreicher Verknüpfung verwendet diese Kennung **Mit Microsoft anmelden** auf der Anmeldeseite; eine lokale Passwortanmeldung ist für sie gesperrt. Alte Sitzungen dieser Kennung werden beim erfolgreichen Microsoft-Login beendet. Unverbundene Kennungen bleiben bis zu ihrer Umstellung unverändert nutzbar. Mehrfaktor-Anmeldung und Zugriffsrichtlinien müssen im Microsoft-Mandanten eingerichtet und praktisch getestet werden; die App behauptet keine bereits aktivierte MFA.

Die Anmeldung verwendet Authorization Code, PKCE, einmaligen State, Nonce, an den Browser gebundenes HttpOnly-Cookie und serverseitige ID-Token-Prüfung durch `jose` (Signatur, RS256, Mandant/Issuer, Audience, Laufzeit, Nonce). OAuth-Verknüpfung ist außerdem an die bestehende CuraAed-Sitzung gebunden. Persönliche Mail-Tokens sind getrennt von Kalender-Tokens und mit Benutzer-ID und Microsoft-App als Verschlüsselungskontext gespeichert. Das persönliche Postfach muss bei vorhandener Microsoft-Anmeldeverknüpfung dieselbe feste Microsoft-Identität verwenden.

## Validierung

Automatische Prüfungen: Microsoft-Tokenvalidierung, fremder Browser/Sitzung/Mandant, unbekannte Benutzer, eindeutige Kennungsbindung, Passwortsperre nach Umstellung, persönliche Postfachtrennung, Rollenschutz, Herkunftsschutz, mehrere Zuordnungen, Änderungsrevisionen, sichere Folgeseiten, Anhänge und Schutz gegen doppelten Versand. Lokale Oberflächenprüfung mit ausschließlich erfundenen Nachrichten. Echtes Postfachlesen, Antworten und Microsoft-Anmeldung benötigen nach Veröffentlichung die Freigabe und den Test mit der jeweiligen eigenen Mitarbeiterkennung.
