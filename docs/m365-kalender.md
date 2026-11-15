# Microsoft-365-Kalender

Unter **Kalender** werden lokale Wiedervorlagen, der eigene Outlook-Hauptkalender und die Hauptkalender der eingerichteten Firmenpostfächer gemeinsam angezeigt. Quellen lassen sich einzeln ein- und ausblenden. Microsoft-Termine werden bei Aufruf, Monatswechsel oder Aktualisierung direkt gelesen; Serientermin-Instanzen kommen aus `calendarView`.

## Verbindung

- Die vorhandene Microsoft-App aus der Benutzerverwaltung wird weiterverwendet. Keine zusätzlichen Render-Geheimnisse erforderlich.
- Jeder Mitarbeiter verbindet unter seinem eigenen CuraAed-Benutzer sein eigenes Microsoft-Geschäftskonto. Dafür werden `offline_access User.Read Calendars.ReadWrite` benötigt. Die Verbindung ist nicht an andere CuraAed-Benutzer übertragbar.
- Die Administration erweitert die bestehende Firmenverbindung um `Calendars.ReadWrite.Shared`. Vorhandene Mail- und Teams-Freigaben bleiben beim Erneuern erhalten.
- Das verbundene Microsoft-Konto benötigt zusätzlich eine Outlook-/Exchange-Berechtigung auf dem Kalender des Firmenpostfachs. **Senden als** ist keine Kalenderberechtigung. Für Lesen und Bearbeiten genügt eine Freigabe dieses Kalenderordners als **Bearbeiter/Editor**; Vollzugriff auf das gesamte Postfach ist dafür nicht nötig. Die zusätzliche Freigabe wird nicht automatisch vergeben.
- Beide Anmeldungen verwenden dieselbe registrierte Rückleitungsadresse `/api/m365/callback`; ein einmaliger, sitzungsgebundener State trennt die Vorgänge. Persönliche Tokens liegen mit Benutzer-ID und Microsoft-App als Verschlüsselungskontext in der Datenbank. Die persistente Datei `.m365-token-key` muss mitgesichert werden.

## Termine

Neue Termine und Änderungen werden direkt in Outlook gespeichert. Neue Termine enthalten keine Teilnehmer und versenden keine Einladungs-E-Mails. Termine mit Teilnehmern werden zum Vermeiden unbeabsichtigter Besprechungsaktualisierungen nur angezeigt und in Outlook bearbeitet. Als privat gekennzeichnete Firmentermine erscheinen ohne Betreff, Ort und Beschreibung.

Die Eingabe erfolgt in deutscher Ortszeit. Nicht eindeutige oder nicht existierende Uhrzeiten bei der Zeitumstellung werden abgewiesen. Das im Formular eingegebene Ende ganztägiger Termine gilt einschließlich; für Microsoft wird es in das exklusive Folgedatum umgerechnet.

Wiederholte Speicherungen verwenden einen unveränderten Erstellungsauftrag und Microsofts `transactionId`. Ein bestätigtes Ergebnis wird lokal dem Auftrag zugeordnet. Änderungen senden den beim Öffnen gelesenen ETag als `If-Match`; veraltete Masken überschreiben keine neuere Änderung. Bei einem unklaren Netzwerkergebnis zuerst den Kalender aktualisieren.

## Prüfung

Tests umfassen Benutzer-/Sitzungsbindung, verschlüsselte Tokens, Herkunftsprüfung, Rollen, Erneuerung, Erhalt bestehender Freigaben, Kalenderansicht einschließlich Ganztagen, private Firmentermine, Konflikte, wiederholte Aufträge und verspätete UI-Antworten. Eine Live-Prüfung erfordert die zusätzliche Microsoft-Zustimmung und die Kalenderordnerberechtigung des Firmenpostfachs.
