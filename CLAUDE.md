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
- Aktivitätsarten: frei anlegbare Labels (Standard: Rennrad/MTB/Arbeit/Laufen/Wandern) ersetzen das frühere feste "Kategorie"-Dropdown der Ausrüstung — eine Ausrüstung kann mehreren Aktivitätsarten zugeordnet werden (Mehrfachauswahl im Ausrüstungs-Modal), jede echte Aktivität bekommt im Aktivitäts-Modal eine Aktivitätsart zugewiesen (automatisch vorgeschlagen wo der intervals.icu-Rohtyp eindeutig ist, sonst manuell wählbar, jederzeit änderbar) — darüber filtert sich die im selben Modal angebotene Ausrüstungs-Zuordnung. Verwaltung (Anlegen/Umbenennen/Löschen) über einen eigenen Reiter "Aktivitätsarten" in den Einstellungen (nicht im Ausrüstungs-Modal selbst — der Link dort springt direkt dorthin), eigene GitHub-Sync-Datei `activity-kinds.json` *(Stand: 03.09.2026)* Der In-App-Team-Chat holt sich Ausrüstungsdaten bei Bedarf per Anthropic-Tool-Use (`get_equipment_status` in `chat-proxy/lib/chatWithTrainer.js`) statt sie in jeden Chat-Kontext zu packen — dafür server-seitig `GH_TOKEN`/`GH_EQUIPMENT_REPO` als Vercel-Env-Vars nötig (siehe `chat-proxy/README.md`), noch von Thomas einzurichten *(Stand: 03.09.2026)*
- Ausrüstungs-Zuordnung im Aktivitäts-Modal ist jetzt Mehrfachauswahl per Checkbox (`equipmentIds` in `activity-meta.json`, ersetzt das alte einzelne `equipmentId`-Feld) statt Dropdown — `autoAssignEquipment()` ordnet neuen Aktivitäten beim Laden automatisch im Hintergrund alle zur (ggf. automatisch vorgeschlagenen) Aktivitätsart passenden, nicht aussortierten Ausrüstungsteile zu, ganz ohne das Modal zu öffnen. Sobald einmal zugeordnet (automatisch oder manuell), fasst die Automatik die Zuordnung nie wieder an — im Modal jederzeit per Checkbox nachträglich änderbar *(Stand: 04.09.2026)*
- Aktivitätsarten-Einstellungen: Reiter "Aktivitätsarten" zeigt nur noch eine Kartenliste (wie die Ausrüstungsseite) — Anlegen/Bearbeiten läuft über ein eigenes Modal (`openActivityKindModal()`/`saveActivityKindModal()` in app.js) mit Name-Feld und Mehrfachauswahl-Checkboxen für "Unterarten" (technische Rohtypen wie Garmin/Intervals.icu die Aktivität benennt, z.B. `Ride`, `MountainBikeRide` — steuern `suggestActivityKind()`). Ankreuzen einer Unterart entfernt sie beim Speichern automatisch von jeder anderen Aktivitätsart (strukturell ausgeschlossene Mehrdeutigkeit, keine separate Zuordnungsliste mehr). Vordefinierte Unterarten (`ICU_TYPE_LABELS` in app.js) und eigene (Rohtyp + Bezeichnung, direkt im Modal anlegbar, Rohtyp-Name muss bekannt sein z.B. `AlpineSki`) per ✕ im Modal löschbar — Overrides in eigener GitHub-Sync-Datei `icu-type-labels.json` (Muster wie `activity-kinds.json`) *(Stand: 04.09.2026)*
- Pendelfahrten (Garmin-Profil "Arbeit") lassen sich per Rohtyp allein nicht von normalen Radausfahrten unterscheiden — Intervals.icu liefert dafür zusätzlich `sub_type: "COMMUTE"` (per Live-Check der Rohdaten bei einer echten Aktivität am 04.09.2026 bestätigt, Feldname nicht in der offiziellen API-Doku auffindbar). `suggestActivityKind()` prüft deshalb zuerst die Kombination `Rohtyp:sub_type` (vordefinierter Unterart-Eintrag `Ride:COMMUTE` = "Pendelfahrt (Rad)") und fällt erst danach auf den reinen Rohtyp zurück *(Stand: 04.09.2026)*
- Ausrüstungs-Zuordnung hängt jetzt direkt an den Unterarten (`icuTypes`, ersetzt das alte `activityKindIds`-Feld) statt an der Aktivitätsart — im Ausrüstungs-Modal wird dieselbe Unterarten-Liste wie im Aktivitätsart-Modal angehakt (leer = zu jeder Aktivität passend). `equipmentForActivity(act)` in app.js matcht dabei direkt gegen `act.type`/`act.sub_type` der echten Aktivität, unabhängig davon, welche (ggf. mehrdeutige oder noch unbestimmte) Aktivitätsart im Aktivitäts-Modal gerade gewählt ist — Legacy-Altdaten (nur `activityKindIds` bzw. sehr alte Kategorie) werden dafür live über `equipmentIcuTypes()` auf die Unterarten der zugeordneten Aktivitätsarten aufgelöst, ohne das Ausrüstungsteil zu verändern, bis einmal im Modal gespeichert wird. Der bisherige separate Schritt "Ausrüstung ↔ Aktivitätsart" entfällt komplett *(Stand: 04.09.2026)*

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
