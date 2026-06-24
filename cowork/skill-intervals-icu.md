# Skill: intervals-icu
## API-Integration, Workout-Syntax, ATP-Format

### Zuständigkeit
Anbindung an intervals.icu — Workouts erstellen, Events anlegen, Trainingsdaten lesen. Dieser Skill wird von allen anderen Rollen genutzt wenn Einheiten direkt in den Kalender sollen.

---

## API-Grundlagen

**Base URL:** `https://intervals.icu/api/v1`
**Authentifizierung:** HTTP Basic Auth → `API_KEY` aus .env / Projekt-Einstellungen
**Athlete ID:** aus Athletenprofil / intervals.icu Account-Einstellungen

---

## Workouts erstellen

### Endpoint
```
POST /api/v1/athlete/{athlete_id}/events
```

### Workout-Typen
- `Run` — Laufen
- `Ride` — Radfahren
- `WeightTraining` — Krafttraining
- `Other` — Sonstiges

### Einfaches Workout (Beispiel: Zone-2-Lauf)
```json
{
  "category": "WORKOUT",
  "type": "Run",
  "name": "Zone 2 Lauf",
  "description": "40 Min locker, Zone 1–2 (HF < 137 bpm)",
  "start_date_local": "2026-06-03T07:00:00",
  "moving_time": 2400
}
```

### Strukturiertes Workout mit Schritten (ATP-Format)
```json
{
  "category": "WORKOUT",
  "type": "Run",
  "name": "Qualität: Threshold-Intervalle",
  "description": "Warm-up 10 Min, 4x4 Min Zone 4 (156–168 bpm), 3 Min Pause, Cool-down 10 Min",
  "start_date_local": "2026-06-05T07:00:00",
  "workout_doc": {
    "steps": [
      {"type": "warmup", "duration": 600, "description": "Zone 1–2"},
      {"type": "repeat", "reps": 4, "steps": [
        {"type": "active", "duration": 240, "target": {"hr": [156, 168]}},
        {"type": "rest", "duration": 180, "target": {"hr_zone": 1}}
      ]},
      {"type": "cooldown", "duration": 600, "description": "Zone 1"}
    ]
  }
}
```

---

## Aktivitäten lesen

### Letzte Aktivitäten abrufen
```
GET /api/v1/athlete/{athlete_id}/activities?oldest=2026-05-01&newest=2026-06-02
```

### Wellness-Daten lesen (HRV, RHR, Schlaf)
```
GET /api/v1/athlete/{athlete_id}/wellness?oldest=2026-05-26&newest=2026-06-02
```

### Fitness-Daten (CTL, ATL, TSB)
```
GET /api/v1/athlete/{athlete_id}/fitness-data?oldest=2026-05-01&newest=2026-06-02
```

---

## Workout in Kalender schreiben — Ablauf
1. Rolle (z.B. Head Coach) definiert Einheit
2. intervals-icu Skill übersetzt in API-Format
3. POST-Request an intervals.icu
4. Workout erscheint im Kalender und wird auf die Uhr geschoben

---

## Hinweise
- Zeitzone: Europe/Berlin (UTC+2 im Sommer)
- `moving_time` in Sekunden
- Herzfrequenz-Targets in bpm (absolut) oder als Zone-Referenz
- Workout-Syntax für strukturierte Einheiten: intervals.icu unterstützt nested steps
