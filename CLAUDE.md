# Training Board — Projektdokumentation

## Konzept

Persönliches Trainings-Dashboard für Thomas Wagner (50J, 74.6kg, Max-HF 183, FTP 250W).
Datenquelle: Intervals.icu (Athlete-ID: `i226237`).

**Prinzip: Serverlos** — eine einzige HTML-Datei, die direkt die Intervals.icu API aufruft.
Kein Backend, kein Server, kein Deployment nötig.

## Projektstruktur

```
TrainingBoard/
├── index.html            ← Die gesamte App (HTML + CSS + JS)
├── Start-Dashboard.bat   ← Lokaler Start auf PC (http://localhost:8765)
├── CLAUDE.md             ← Diese Datei
└── cowork/               ← KI-Trainer Dateien für Claude Cowork
    ├── athletenprofil.md
    ├── projekt-anweisung.md
    ├── skill-training-management.md
    ├── skill-uphill-athlete.md
    ├── skill-reha-management.md
    ├── skill-krafttraining.md
    ├── skill-ernaehrung.md
    └── skill-intervals-icu.md
```

## Lokaler Start (PC)

Doppelklick auf `Start-Dashboard.bat` → öffnet http://localhost:8765 im Browser.

## Zugriff

- **PC**: Start-Dashboard.bat → http://localhost:8765
- **iPad**: GitHub Pages (privates Repo, geplant)

## App-Zugangsdaten

- Intervals.icu Athlete-ID: `i226237`
- API-Key: wird beim ersten Start abgefragt, in `localStorage` gespeichert
- Kein hardcodiertes Passwort (Setup-Screen beim ersten Start)

## Aktuelle Features

- Setup-Screen (API-Key Eingabe beim ersten Start)
- Übersicht: KPI-Karten, Fitness/Fatigue/Form Chart, Aktivitätstypen
- Aktivitäten: Liste aller Trainingseinheiten
- Herz-Kreislauf: RHF, HRV, Trends
- HF-Zonen: Uphill Athlete 4-Zonen-System (AeT/AnT einstellbar)
- Fitness & Form: CTL/ATL/TSB Verlauf
- Wellness: HRV, Ruhepuls, Schlaf
- Hell/Dunkel-Modus
- Zeiträume: 7 / 30 / 90 / 365 Tage

## Geplante Features (Priorität)

1. HRV-Analyse nach Plews-Methode (RMSSD, Rolling Average, Ampelsystem)
2. Cockpit-Tab (Tagesübersicht: Form, Fitness, HRV, Empfehlung)
3. KI-Trainer mit Claude API (direkt im Browser)
4. Garmin Connect Integration
5. Mobile-Ansicht optimieren
6. Export PDF/CSV

## Arbeitsaufteilung

- **Claude Code** → index.html weiterentwickeln (Features, Code)
- **Claude Cowork** → KI-Trainer Personas und Trainingsberatung (cowork/ Ordner)

## Inspiration

- harlerunner.de — KI-Trainerteam Konzept + Loop UI
- Uphill Athlete Trainingsprinzipien
