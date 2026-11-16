# Automatische ETV-Kalendereinträge

Beim Anlegen und Ändern einer ETV werden für Präsenz-, Hybrid- und Online-Versammlungen zwei Termine gespeichert: im Kalender der gewählten Verwaltung und im persönlichen Kalender des als Versammlungsleitung gespeicherten CuraAed-Benutzers. Das ist unabhängig vom Benutzer, der die ETV bearbeitet. Die Leitung muss ihren eigenen Microsoft-Kalender unter ihrem eigenen CuraAed-Konto verbunden haben.

Datum, Uhrzeit, geplante Dauer (standardmäßig 180 Minuten), Objekt, Versammlungsort, Versammlungsleitung und vorhandener Teams-Link werden übernommen. Es werden keine Teilnehmer hinzugefügt und keine Einladungen versendet. Einladungsversand bleibt ein eigener Arbeitsschritt.

Die Verwaltung und Dauer sind auch bei Präsenzversammlungen sichtbar. Fehler werden je Ziel angegeben, ohne eine erfolgreich gespeicherte ETV oder einen bereits erstellten Termin zurückzunehmen. Über „Kalender aus gespeicherten Basisdaten erneut abgleichen“ werden offene Schritte wiederholt. Beim Verbinden eines Microsoft-Kalenders werden bis zu 20 offene, nicht archivierte ETVs nachgeholt (bei persönlicher Anmeldung nur die der angemeldeten Leitung).

Termin-IDs und feste Erstellungsaufträge werden dauerhaft gespeichert. Wiederholung nach Netzwerkfehlern verwendet den ursprünglichen Auftrag und dessen Originaldaten; danach werden aktuelle ETV-Daten übernommen. Erneutes Speichern und Zeit-/Ortsänderungen aktualisieren bestehende Einträge. Eine andere Microsoft-Identität wird nicht stillschweigend als dasselbe Konto behandelt. In Outlook um Teilnehmer ergänzte oder geschützte Termine werden nicht überschrieben.

Bei einem Wechsel der Leitung oder Verwaltung wird der frühere Termin mit „ENTFÄLLT“ gekennzeichnet und die Zeit als frei markiert; es erfolgt keine Löschung. Beim Wechsel zurück wird derselbe Eintrag reaktiviert. Archivieren allein ist keine Terminabsage. Die Synchronisierung verwendet die bereits freigegebenen Kalenderrechte und erweitert keine Microsoft-Berechtigungen.

Microsoft-Dokumentation: [Erstellen von Terminen und transactionId](https://learn.microsoft.com/en-us/graph/api/resources/event?view=graph-rest-1.0), [Ändern eines Termins](https://learn.microsoft.com/en-us/graph/api/event-update?view=graph-rest-1.0).
