# Adresslisten übernehmen

Unter **Konverter → Adresslisten einlesen (CSV / Excel)** können Administratoren CSV- und XLSX-Dateien bis 1 MB mit höchstens 500 Adressen und 50 Spalten übernehmen. Die erste Zeile enthält Überschriften; bei XLSX wird das erste Tabellenblatt gelesen. CSV unterstützt Semikolon, Komma oder Tabulator, UTF-8 und Windows-1252 sowie korrekt zitierte Felder. Alte XLS-Dateien vorher als XLSX oder CSV speichern.

Spalten werden anhand ihrer Überschriften vorgeschlagen und können per Tastatur zugeordnet werden. Nicht zugeordnete Inhalte bleiben unberücksichtigt. Mindestens Nachname oder Firmenname muss zugeordnet sein. Adressnummern werden neu vergeben; externe Nummern werden nicht als HP-Nummern ausgegeben. Telefonnummern und E-Mail-Adressen werden auch in den normalen Kommunikationslisten angelegt.

F2 prüft die Vorschau. Namens- und E-Mail-Dubletten im gesamten CuraAed-Bestand (einschließlich archivierter Adressen) und innerhalb der Datei werden ausgewiesen und übersprungen. Namensgleichheit wird vorsichtig als mögliche Dublette gewertet; es erfolgt keine automatische Zusammenführung. Fehlerhafte Zeilen werden mit Dateizeilennummer und Grund angezeigt. Bestehende Adressen werden niemals überschrieben. Erst „Übernehmen“ und die anschließende Bestätigung legen die gültigen neuen Zeilen an.

Vor dem Schreiben wird der Plan innerhalb einer Datenbanktransaktion erneut berechnet und mit der bestätigten Prüfsumme verglichen. Geänderte Zuordnungen oder neu aufgetauchte Dubletten verlangen eine neue Vorschau. Ein Speicherfehler rollt die gesamte Transaktion zurück. Erneuter Import derselben Daten erzeugt keine weiteren Adressen. Der Benutzer wird in der Adresshistorie vermerkt. Wenn die bereits vorhandene HP-Neuanlage freigegeben ist, verwendet der Import denselben Auftragsweg mit Kürzel CA und späterer Spiegelung der HP-Adressnummer.

Der Import legt noch keine Objekte, Wohnungen oder Personenfunktionen aus Teilungserklärungen an. Dafür fehlen ein fachlich geprüfter Dokumentablauf und ein Musterbestand. Es wurden keine echten Kundenadressen für die Entwicklung importiert.
