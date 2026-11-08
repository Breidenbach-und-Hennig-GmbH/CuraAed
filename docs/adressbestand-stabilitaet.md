# Große Adressbestände

Adressliste und Gesamtliste liefern maximal 500 Treffer je Anfrage. Die Oberfläche weist bei Erreichen der Grenze auf die notwendige Eingrenzung hin. CSV-/Listenfunktionen arbeiten mit diesen sichtbaren Treffern und sind kein vollständiger Bestands-Export.

Namen, Adressnummer, Intensivsuche, Feld-, Telefon-, Ansprechpartner- und Personenfunktionssuche filtern in SQLite vor dem Laden der begrenzten Ergebnismenge. Kommunikations- und Rolleninformationen werden nur für die Kandidaten geladen. Die bisherigen JavaScript-Prüfungen bleiben als zusätzliche Prüfung erhalten. Bei sehr breiten Spezialabfragen kann die Ergebnisgrenze erreicht werden; konkreten Suchbegriff verwenden. Unicode-Sortierung/LIKE folgt dabei den SQLite-Möglichkeiten; keine vollständig linguistische Suche.

Ein Index auf Verbindung, Status und Abholzeit beschleunigt die Suche nach ausstehenden/unklaren HP-Aufträgen. Keine Datenlöschung, keine neue Kopplung, keine Rechte- oder Hostingänderung.

Validiert mit 60.000 synthetischen Bestandsadressen plus Zielkontakt außerhalb der ersten 500 Einträge. Begrenzte Listen, Namens-/Nummern-, Orts-, E-Mail- und normalisierte Telefonsuche erfolgreich; Datenbank-Abfragen laden höchstens 500 Kandidaten. 103 Node-Tests bestanden.

Live-Anlass: wiederkehrende HTTP-502-Antworten und im Render-Ausschnitt sichtbarer erneuter App-Start. Der Ausschnitt enthält keinen Exit-Code oder bestätigten Speicherfehler; die genaue Neustartursache bleibt ohne zusätzliche System-/Fehlerlogs unbewiesen. Diese Änderung behebt unabhängig davon das bestätigte unbegrenzte Laden großer Listen. Connector während Stabilitätsprüfung pausiert lassen.

