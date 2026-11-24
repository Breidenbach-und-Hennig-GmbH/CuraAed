# Eddi in der Übersicht

Eigener CuraAed-Assistent mit einer kompakten Eingabezeile: „Hallo, ich bin Eddi, wie kann ich dir helfen?“ Die Gesprächsfläche klappt erst bei Bedarf auf. Enter sendet, Escape klappt zu. Gespräch und Vorschläge sind an den angemeldeten Mitarbeiter gebunden.

## OpenAI-Verbindung

Administratoren richten die Verbindung unter Benutzerverwaltung → KI · Eddi oder in Eddis Gespräch über „KI einrichten“ ein. Schlüssel werden ausschließlich verschlüsselt in CuraAed gespeichert, nicht im Browser zurückgeliefert oder in Render-Umgebungsvariablen vorausgesetzt. Die Verschlüsselung verwendet den bereits vorhandenen persistenten Anwendungsschlüssel. Datenbank und Schlüsseldatei gemeinsam geschützt sichern.

Standardmodell ist `gpt-6.2-sol`. Die Anbindung nutzt die Responses API mit eigenen Function Tools, `store:false` und bewahrt die für weitere Werkzeugschritte nötigen Response-/Reasoning-Daten. Es werden keine OpenAI-Websuche, kein Computerzugriff und keine freie Codeausführung freigegeben. Ein Sprachmodell kann über den serverseitigen Adapter ausgetauscht werden.

API-Abrechnung und ChatGPT-Abonnement sind getrennt. Das anfängliche Limit von zehn KI-Arbeitsschritten je Kalendertag gilt für den gesamten Betrieb und wird vor dem Versand atomar geprüft. Ein Anwenderauftrag kann mehrere Schritte verbrauchen; fehlgeschlagene Versuche zählen ebenfalls. Dieses Limit ist **kein Geldbudget**. Vor Verarbeitung zeigt die Oberfläche den Anbieter und verlangt eine Zustimmung. `store:false` ist keine Zusage einer vollständig protokollfreien Verarbeitung beim Anbieter.

Offizielle Grundlagen: [OpenAI-Quickstart](https://developers.openai.com/api/docs/quickstart), [Function Calling](https://developers.openai.com/api/docs/guides/function-calling), [Datenverarbeitung](https://developers.openai.com/api/docs/guides/your-data), [Abrechnung](https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform).

## Werkzeuge und Freigabe

Eddi kann Adressen, Objekte, Wohnungen, sichtbare Tickets, hinterlegte Anleitungen und eigene Teilungserklärungen suchen. Die Ticketrechte entsprechen dem bestehenden Ticketsystem. Interne Notizen und persönliche Wiedervorlagen werden nur vorbereitet. Die separate Bestätigung prüft Eigentümer des Vorschlags und Ablaufzeit und führt genau einmal aus. Fremde, verworfene und abgelaufene Vorschläge sind gesperrt.

Anleitungen enthalten Quelle und Versionsstand und werden als möglicherweise unvollständige Arbeitsstände behandelt. Sie dürfen keine Werkzeuge oder Rechte freigeben. Administratoren können ausgewählte Anleitungstexte mit SharePoint-Link hinterlegen. **Ein automatischer Live-Abgleich der SharePoint-Bibliotheken ist noch nicht implementiert.** Die Originale werden nicht verändert. Eine solche Anbindung benötigt eine eigene, auf die gewünschte Quelle abgestimmte Microsoft-Freigabe.

E-Mail-Versand, Löschungen, Zahlungen, Buchungen, Änderungen von Rechten und das Beauftragen von Handwerkern sind noch keine Eddi-Werkzeuge. Der Assistent darf ihre Durchführung nicht behaupten.

## Teilungserklärungen

PDFs bis 25 MB und 120 Seiten werden in einem eigenen Prozess vollständig lokal gelesen, bei Bedarf mit lokaler OCR. Fortschritt und Original bleiben erhalten; ein unterbrochener Vorgang wird als Fehler ausgewiesen. Es erfolgt keine stille Kürzung auf die ersten Seiten. Die KI-Auswertung startet separat mit Zustimmung und verarbeitet zusammengehörige Textabschnitte. Jede erkannte Einheit und Stimmklausel braucht eine überprüfbare wörtliche Fundstelle mit PDF-Seitennummer. MEA-Brüche müssen auch tatsächlich in der zitierten Fundstelle stehen. Dezimale Zähler und deutsche Tausenderpunkte werden ohne Gleitkommarundung in exakte Brüche umgerechnet.

Objekt, Einheiten, MEA, Quellen und erkannte Stimmregeln erscheinen als bearbeitbarer Vorschlag. Erst die geprüfte Bestätigung legt **ein neues** Objekt und seine Einheiten an. Vorhandene Objekte gleicher Anschrift werden zurückgehalten; der Ablauf überschreibt keine Bestandsobjekte. Fehlende MEA oder unvollständige Bruchsumme verhindern die Anlage. Sondernutzungsrechte sind keine selbständigen Einheiten. Ein Fehler rollt die gesamte Anlage einschließlich Archivzuordnung zurück. Wiederholte Bestätigung erzeugt keine Dublette.

Das Original-PDF wird am neuen Objekt und seinen Einheiten archiviert. Ein ausdrücklich allgemeines, eindeutiges Stimmprinzip kann als **ungeprüfter** Vorschlag im ETV-Tool erscheinen. Sondermehrheiten, Bezugsgrößen und Geltungsbereiche bleiben mit Fundstellen erhalten; sie werden nicht als pauschale Regel für alle TOPs gesetzt. Die Auszählung bleibt durch die vorhandene fachliche Prüfbestätigung gesperrt. Änderungen älterer Vereinbarungen durch spätere Gesetze und Nachträge werden nicht automatisch rechtlich beurteilt.

## Validierungsgrenzen

Manuell vorbereitete Daten lassen sich über „Vorbereitete Daten laden“ ohne KI-Aufruf als prüfbarer Entwurf übernehmen. Die Vorbereitung muss zum SHA-256 des vollständig gelesenen Original-PDFs gehören; alle Einheiten- und Stimmregel-Fundstellen werden erneut gegen dessen Seiten geprüft. Dieser Weg erstellt ausschließlich einen vorläufigen lokalen Bestand: Nummer `VORL-…`, sichtbarer Hinweis im Objektnamen und in den Stammdaten, keine HP-Objekt-/Wohnungszuordnung und kein Connectorauftrag. Original und Stimmregeln werden wie beim KI-Entwurf archiviert. Eine erneute bestätigte Anlage ist idempotent; eine bereits vorhandene Objektanschrift verhindert eine neue Anlage. Die fachliche ETV-Freigabe wird dadurch nicht erteilt.

Die automatisierten Tests verwenden einen austauschbaren Modelladapter und synthetische Dokumente. Sie belegen Rechteprüfung, bestätigte Änderungen, Wiederholungsschutz, exakte MEA, Fundstellenprüfung und Rücknahme bei Fehlern. Eine echte OpenAI-Auswertung benötigt einen vom Administrator eingerichteten API-Zugang und ist gesondert zu prüfen. Ein erfolgreicher lokaler OCR-Lauf allein belegt keine richtige KI-Auswertung.
