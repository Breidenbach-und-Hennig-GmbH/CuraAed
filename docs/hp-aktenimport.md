# Aktenübernahme aus HausPerfekt

Der Fachbereichsimport sichert die von HP-Mobile bereitgestellten Akten,
Handwerkeraufträge, Beziehungen und referenzierten Dateien. Schlüssel sind immer
an die jeweilige Quelle gebunden. Der Import ist wiederholbar und berücksichtigt
lokale Änderungen. Dateien werden im bestehenden, mit Prüfsummen geschützten
CuraAed-Archiv gespeichert und sind danach ohne HP-Mobile verfügbar.

Ein HP-Mobile-Durchlauf ist kein Nachweis einer vollständigen ERP-Migration.
Am 16.11.2026 enthielt der bisherige Mobile-Import zwei Akten. In HausPerfekt
ist darüber hinaus beispielsweise die BB0-Protokollakte 118334 sichtbar.
Für den vollständigen Bestand ist deshalb der direkte ODBC-Bestand zu prüfen.

`HP-Aktenpruefung.exe` liest ausschließlich fest vorgegebene SELECT-Abfragen
über HPSD aus HPSERVSD. Es erfasst Zeilenzahlen, eine begrenzte Anzahl von
Schlüsselbeispielen, Beziehungen zur Akte 118334 und Archivpfade. Es verändert
keine HP-Daten und hat keine Netzwerkfunktion. Der Bericht wird unter
Dokumente/HP-Aktenpruefung.json gespeichert und kann mit „Bericht kopieren“
in die Zwischenablage übernommen werden. Namen, Aktennummern und Dateipfade
des Berichts sind interne Verwaltungsdaten und dürfen nicht ins Repository.

Bei fehlendem Archivspeicher werden Metadaten weiter übernommen und betroffene
Dateien als ausstehend erkennbar gehalten. Ein erneuter Durchlauf versucht die
Dateiübernahme erneut. Bereits gesicherte Dateien werden nicht erneut geladen.
