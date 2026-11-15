# Firmenpostfach und persönlicher ETV-Versand

## Funktionsumfang
Jeder Eigentümer erhält eine eigene archivierte PDF. Die Versandart wird je Adresse und Dokumentart etv_einladung bestimmt. Nach einer überprüften Übergabe meldet Microsoft 365 nur die Annahme (202), keine Zustellung. Bei unklarem Ausgang gibt es keinen automatischen erneuten Versand.

## Microsoft 365 einmalig einrichten
1. In Microsoft Entra eine Web-App für CuraAed registrieren. Benötigt werden die Mandanten-ID, Client-ID und ein Client-Secret. Die App verwendet den Autorisierungscodefluss mit PKCE.
2. Als Web-Redirect-URI exakt https://curaaed.onrender.com/api/m365/callback hinterlegen (bei anderem Hosting den tatsächlichen App-Ursprung).
3. Delegierte Berechtigungen User.Read und Mail.Send.Shared sowie offline_access freigeben. Keine anwendungsweite Mail.Send-Berechtigung und kein Zugriff auf alle Postfächer erforderlich.
4. Das verbindende Microsoft-Konto muss in Exchange Online zum Senden als bzw. im Auftrag des gemeinsamen Postfachs berechtigt sein. Die gewünschte Absenderadresse ist post@immo-hb.de.
5. In Einstellungen > Benutzerverwaltung > Microsoft 365 als Administrator Mandanten-ID, Client-ID und den Wert des geheimen Schlüssels speichern. Der Schlüssel wird verschlüsselt in der Datenbank abgelegt und niemals zurückgegeben. Leer lassen behält einen vorhandenen Schlüssel bei. Bei anderer App/anderem Mandanten sind ein neuer Schlüssel und die ausdrückliche Trennung bestehender Verbindungen nötig. Bestehende Server-Variablen werden einmalig verschlüsselt übernommen; anschließend hat die gespeicherte Einrichtung Vorrang und die drei M365-Variablen können entfernt werden. Keine Geheimnisse in Git oder Chat kopieren.
6. APP_PUBLIC_URL oder RENDER_EXTERNAL_URL muss den echten HTTPS-Ursprung enthalten. Optional M365_TOKEN_KEY (32 Bytes, base64); alternativ erzeugt CuraAed den Schlüssel neben der persistenten Datenbank. Diese Schlüsseldatei muss zusammen mit dem Datenbestand gesichert werden und darf nicht unüberlegt ersetzt werden.
7. In Einstellungen > Firmenpostfach / Postversand die richtige Verwaltung, das gemeinsame Postfach und den Postweg speichern. Als CuraAed-Administrator „Microsoft 365 verbinden“ wählen und die Microsoft-Freigabe selbst durchführen.
8. Erst mit einem ausdrücklich freigegebenen Testempfänger prüfen. Keine Eigentümereinladungen als Verbindungstest versenden.

Tokens werden AES-GCM-verschlüsselt und an Firmen-ID und Microsoft-App gebunden gespeichert. Die Webanmeldung ist an Benutzer, Sitzung, zeitlich begrenzten Einmal-State und PKCE gebunden. Eine geänderte Absenderadresse trennt die Verbindung.

## epostbox
Im geöffneten Benutzerkonto war die Gruppe Breidenbach sichtbar; das Konto selbst war IDS Verwaltungsges. mbH zugeordnet. Aus dieser Beobachtung lässt sich kein dauerhaft nutzbarer API-Zugang ableiten.
Die offizielle FAQ bestätigt REST-API und SFTP. Es fehlen die konkrete Dokumentation, die Kontozuordnung und Zugangsdaten. Es wurde deshalb keine undokumentierte Schnittstelle nachgebaut und kein kostenpflichtiger Auftrag ausgelöst.
Bis zur Einrichtung: die einzelnen archivierten PDFs herunterladen und im bekannten epostbox-Portal hochladen. CuraAed verbucht dies nicht als automatische Übergabe.

## Bürodrucker
Der bereitgestellte Druckweg rendert die ausgewählte Einzel-PDF vollständig im Browser und öffnet auf Knopfdruck den Systemdruckdialog. Der gewünschte Druckername kann je Verwaltung hinterlegt werden. Browser dürfen keine feste lokale Druckerwarteschlange still auswählen. Eine verbindliche direkte Druckersteuerung benötigt einen lokalen Druckdienst oder einen freigegebenen Cloud-Druckanschluss; beides ist noch nicht konfiguriert.
Eine Bestätigung wird erst durch einen ausdrücklichen Klick nach tatsächlich erfolgtem Ausdruck gespeichert. Ein abgebrochener Druckdialog ist kein Drucknachweis.

Quellen:
https://learn.microsoft.com/en-us/graph/auth-v2-user
https://learn.microsoft.com/en-us/graph/outlook-send-mail-from-other-user
https://learn.microsoft.com/en-us/graph/api/user-sendmail
https://www.epostbox.de/faq
