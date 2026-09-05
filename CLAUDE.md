# TrainIQ — Projektdokumentation

## Arbeitshinweise

- Arbeite effizient und Tokken-Sparrend
- keine Live-Schreibtests mehr gegen dein echtes Repo ohne ausdrückliche Erlaubnis - nutze nur lokale Daten
- visuelle Verifikation immer Nachfragen, z.B. keine Screenshots/Browser-Tests bei reinen Code-/Text-Änderungen, 
- Antworten kurz halten, keine Zusammenfassungen am Ende
- Vor jeder Arbeit am Projekt: `git pull` (bzw. `git pull --rebase`) ausführen — der Head Coach committet auch direkt auf GitHub, lokaler Stand kann veraltet sein *(Stand: 25.07.2026)*
- Neue Einträge in dieser Datei künftig mit Datum versehen *(Stand: 25.07.2026)*
- Bei jeder Änderung an `app.js` oder `style.css`: Cache-Busting-Version im `<script>`/`<link>`-Tag in `index.html` hochzählen (`?v=JJJJMMTTx`) — sonst liefert der Browser die alte gecachte Datei aus, auch nach Neuladen *(Stand: 01.08.2026)*
- `git`-Befehle (status/add/commit/push/pull/...) laufen in diesem Ordner ohne Rückfrage (`.claude/settings.local.json`, lokal/gitignored) — destruktive Befehle wie `push --force`/`reset --hard` bleiben trotzdem bestätigungspflichtig *(Stand: 01.08.2026)*
- Commit-Messages als einzeiliges `-m "..."` (kein Heredoc/`$(...)`) — Command-Substitution/Heredocs lösen unabhängig von der Allowlist immer eine Bestätigung aus (Sicherheitsschranke, nicht per Settings umgehbar) *(Stand: 01.08.2026)*

## Konzept

Persönliches Trainings-Dashboard für Thomas Wagner (50J, 74.6kg, Max-HF 183, FTP 250W).
Datenquelle: Intervals.icu (Athlete-ID: `i226237`).

**Prinzip: Serverlos** — eine einzige HTML-Datei, die direkt die Intervals.icu API aufruft.
Kein Backend, kein Server, kein Deployment nötig.

## Projektstruktur

```
TrainIQ/
├── index.html            ← Die gesamte App (HTML + CSS + JS)
├── app.js                ← App-Logik (ausgelagert)
├── style.css             ← Styles (ausgelagert)
├── favicon.svg           ← App-Icon
├── Start-Dashboard.bat   ← Lokaler Start auf PC (http://localhost:8765)
├── CLAUDE.md             ← Diese Datei
├── cowork/               ← Trainingscoach-Material für Claude Cowork
│   ├── athletenprofil.md
│   ├── projekt-anweisung.md
│   ├── skill-training-management.md
│   ├── skill-reha-management.md
│   ├── skill-krafttraining.md
│   ├── skill-ernaehrung.md
│   ├── skill-intervals-icu.md
│   └── training-board_lauftechnik-bergauf-bergab.md
├── Archiv/               ← Ältere Versionen / Ablage
└── CSV-Export/           ← CSV-Exporte
```

**Konvention:** Alles, was inhaltlich für den Trainingscoach/Claude Cowork bestimmt ist (Recherche, Notizen, Skills), gehört nach `cowork/` — nicht ins Projekt-Root.

## Zugriff

- **PC**: Doppelklick auf `Start-Dashboard.bat` → öffnet http://localhost:8765
- **iPad/überall**: GitHub Pages, live auf https://user-tjw.github.io/training-board/

## App-Zugangsdaten

- Intervals.icu Athlete-ID: `i226237`
- API-Key: wird beim ersten Start abgefragt, in `localStorage` gespeichert
- Kein hardcodiertes Passwort (Setup-Screen beim ersten Start)

## GitHub-Notizen (KI-Trainer)

Bei konfiguriertem GitHub-Token/-Repo (`ghToken`/`ghRepo`) schreibt die App Notizen direkt per GitHub-API ins private Repo `user-tjw/training-notes` (Ordner `notes/`) — es gibt **keinen** rein lokalen Zwischenschritt. Der Offline-Fallback (`_localDayNotes`) greift nur, wenn kein Token gesetzt ist.

⚠️ **Beim Testen:** Die Browser-Vorschau nutzt denselben `localStorage` wie die echte App. Vor Schreibtests (`openDayNoteEditor`, `saveNoteEditor` o.ä.) prüfen, ob `ghToken`/`ghRepo` gesetzt sind — sonst landen Testnotizen als echte Commits im privaten Repo. Im Zweifel vorher nachfragen.

## Aktuelle Features

- Setup-Screen (API-Key Eingabe beim ersten Start)
- Cockpit: Tagesempfehlung, HRV-Ampel (7-Tage-Rolling-Average), KPI-Kacheln, Trainingswoche mit Soll-Ist-Balken
- Übersicht: Fitness/Fatigue/Form Chart, Aktivitätstypen
- Aktivitäten: Liste aller Trainingseinheiten
- Herz-Kreislauf: RHF, HRV, Trends
- HF-Zonen: Uphill Athlete 4-Zonen-System (AeT/AnT einstellbar)
- Fitness & Form: CTL/ATL/TSB Verlauf
- Wellness: HRV, Ruhepuls, Schlaf
- KI-Trainer: 5 Trainer-Personas (Head Coach, Reha, Kraft, Ernährung, UA-Methodik), Notizen-System mit GitHub-Sync, "Für Claude kopieren" für Cowork-Übergabe
- Trainings-Soll geräteübergreifend über GitHub synchronisiert
- Hell/Dunkel-Modus
- Zeiträume: 7 / 30 / 90 / 365 Tage
- Aktivitäts-Modal: Temperatur/Witterung erfassen, Trainingseffect als Kategorie (Erholung/Basis/Pace/Tempo/Schwelle/VO2max/Anaerob/Sprint, automatisch anhand Ø-HF vorgeschlagen), Efficiency-Factor-Konditionstrend pro Einheit + Cockpit-Kachel, Copy-Button „Aktivität + 7-Tage-Kontext für Claude" *(Stand: 28.07.2026)*
- Plan-Modal: optionale strukturierte Phasen (Aufwärmen/Hauptteil/Cooldown mit Zonen-Ziel), rein App-intern, kein Push zu Intervals.icu-Intervallen *(Stand: 28.07.2026)*
- Ausrüstung: neue Seite zwischen Aktivitäten und Team-Chat, frei anlegbare Räder/Schuhe/Ausrüstung, Zuordnung im Aktivitäts-Modal, Laufleistung/Kettenkilometer/Nutzungsdauer automatisch aus zugeordneten Aktivitäten aufsummiert (`equipment.json`, gleiches GitHub-Sync-Muster wie HF-Zonen/Athletenprofil). Aussortierte Gegenstände bleiben erhalten (`retired:true`) und sind über den Tab "Aussortiert" auf der Ausrüstungsseite weiterhin einsehbar/reaktivierbar, dort auch endgültig löschbar (ohne Sicherheitsabfrage, bewusst so gewünscht). Für den Import bestehender Ausrüstung (z.B. aus Garmin Connect) gibt es "Start-km"/"Start-Stunden" im Ausrüstungs-Modal. Der In-App-Team-Chat holt sich Ausrüstungsdaten bei Bedarf per Anthropic-Tool-Use (`get_equipment_status` in `chat-proxy/lib/chatWithTrainer.js`) statt sie in jeden Chat-Kontext zu packen — dafür server-seitig `GH_TOKEN`/`GH_EQUIPMENT_REPO` als Vercel-Env-Vars nötig (siehe `chat-proxy/README.md`) *(Stand: 03.09.2026)*
- Ausrüstungs-Abgleich bei jedem Speichern: `backfillEquipmentAssignment(nameOrId, dryRun)` in `app.js` gleicht beim Speichern im Ausrüstungs-Modal automatisch GENAU DAS bearbeitete Ausrüstungsteil gegen seine aktuellen Standardaktivitäten ab — ergänzt passende Alt-Aktivitäten (behebt "neue Ausrüstung zeigt 0, obwohl Historie passen würde", da `autoAssignEquipment()` nur zukünftige, nie zugeordnete Aktivitäten automatisch erfasst) UND entfernt nicht mehr passende (behebt "Standardaktivität wieder abgehakt, Kilometer blieben trotzdem drin"). Rührt nie an, was ANDEREN Ausrüstungsteilen derselben Aktivität zugeordnet ist. Auch manuell über die Konsole nutzbar (erst `true` für Log, dann `false` zum Anwenden+Sync) *(Stand: 05.09.2026)*
- Bugfix "Erste Nutzung" (Ausrüstung): Das Datumsfeld `addedAt` wurde bisher nur angezeigt, aber nie zur Berechnung herangezogen — `recomputeEquipmentTotals()` summierte km/Std./Aktivitäten über die *komplette* Intervals.icu-Historie, unabhängig vom eingetragenen Datum. Jetzt filtert die Summierung auf Aktivitäten ab `addedAt` (Vergleich `act.start_date_local` als `YYYY-MM-DD`-String). Ermöglicht z.B. einen Kettenwechsel: im bestehenden Ausrüstungsteil "Erste Nutzung" auf das Wechsel-Datum setzen + Start-km auf 0 — zählt danach nur noch ab diesem Tag, ohne ein neues Ausrüstungsteil anlegen zu müssen. Die Aktivitäts-Zuordnung selbst (`equipmentIds` in activity-meta.json) bleibt davon unberührt, nur die Summierung wird gefiltert *(Stand: 05.09.2026)*
- Bugfix Ausrüstungs-Zuordnung: `equipmentForActivity()` prüfte Rohtyp:sub_type-Kombination (z.B. `Ride:COMMUTE`) und reinen Rohtyp (`Ride`) bisher gleichrangig nebeneinander statt wie im Kommentar beschrieben mit Vorrang für die spezifischere Kombination — dadurch fing eine breit konfigurierte Ausrüstung (z.B. "Rennrad" = `Ride` ohne Einschränkung) versehentlich auch fremde `Ride:COMMUTE`-Aktivitäten anderer Ausrüstung ein. Zusätzlich stammten viele sehr alte Zuordnungen noch aus einer Zeit vor den heutigen icuTypes-Regeln (leere icuTypes = "passt auf alles"), wodurch z.B. BMC und Orbea Orca pauschal denselben, teils fachfremden Aktivitäten-Satz zugeordnet waren (u.a. Laufaktivitäten). Fix behoben (Spezifität-Vorrang), einmaliges Reparatur-Werkzeug `repairEquipmentAssignments(dryRun)` in `app.js` ergänzt für Alt-Daten (Konsolenaufruf, erst mit `true` prüfen, dann `false` zum Anwenden+Sync) *(Stand: 05.09.2026)*
- Ausrüstungs-Zuordnung: jede Ausrüstung bekommt im Ausrüstungs-Modal eine Mehrfachauswahl an "Standardaktivitäten" — direkt aus der Aktivitäts-Historie abgeleitete Rohtyp/`sub_type`-Kombinationen, wie Garmin/Intervals.icu eine Aktivität technisch benennt (z.B. `Ride`, `MountainBikeRide`, ggf. kombiniert mit `sub_type` wie `Ride:COMMUTE` für Pendelfahrten — Intervals.icu liefert Pendelfahrten sonst mit demselben Code wie normale Ausfahrten, `sub_type` ist der einzige technische Unterschied, per Live-Check der Rohdaten bestätigt, nicht in der offiziellen API-Doku auffindbar). Eine Checkbox je in der Historie vorkommender Kombination (`distinctActivityKinds()`), Label = Bezeichnung aus den Einstellungen oder sonst automatisch aus dem Rohtyp abgeleitet (`prettifyIcuType()`). Leere Auswahl = für jede Aktivität nutzbar. Im Aktivitäts-Modal wird die passende Ausrüstung automatisch anhand von Code/`sub_type` der jeweiligen Aktivität vorgeschlagen (`equipmentForActivity()`), Mehrfachauswahl per Checkbox, jederzeit änderbar (`equipmentIds` in `activity-meta.json`) — `autoAssignEquipment()` ordnet das beim Laden bereits im Hintergrund zu, ganz ohne das Modal zu öffnen; einmal zugeordnet (automatisch oder manuell) fasst die Automatik es nie wieder an. Der Reiter "Unterarten" der Einstellungen dient nur noch dem Umbenennen/Ausblenden dieser Bezeichnungen (vordefinierte Liste `ICU_TYPE_LABELS` in app.js, Overrides in `icu-type-labels.json`) — die frühere zweistufige Zuordnung (erst Unterart mit Beispiel-Aktivität anlegen, dann der Ausrüstung zuweisen) wurde ersetzt, weil die Auswahl über *sämtliche* Einzelaktivitäten dort unübersichtlich war; die neue Auswahl dedupliziert direkt auf eindeutige Rohtyp-Kombinationen. Bewusst KEINE übergeordnete "Aktivitätsart"-Kategorie mehr (kurzzeitig am 04.09.2026 eingeführt und noch am selben Tag wieder entfernt — brachte keinen Mehrwert, nachdem die Ausrüstungs-Zuordnung direkt auf Unterarten umgestellt war) *(Stand: 04.09.2026)*

## Geplante Features

1. Garmin Connect Integration
2. Mobile-Ansicht optimieren
3. Export PDF/CSV

## Arbeitsaufteilung

- **Claude Code** → `index.html` weiterentwickeln (Features, Code)
- **Claude Cowork** → KI-Trainer Personas und Trainingsberatung, ausschließlich im `cowork/`-Ordner (siehe Konvention oben unter Projektstruktur)

## Inspiration

- [harlerunner.de](https://harlerunner.de) — KI-Trainerteam Konzept + Loop UI
- [uphillathlete.com](https://uphillathlete.com) — Uphill Athlete Trainingsprinzipien
- [liebscher-pracht.com] https://www.liebscher-bracht.com/
