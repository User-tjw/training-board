# TrainIQ Intervals.icu MCP-Server

Stellt Intervals.icu als Tools fuer KI-Assistenten (Claude, ChatGPT) per Model Context
Protocol bereit: Trainingsdaten lesen, geplante Einheiten anlegen/loeschen.

## Setup (lokal)

1. Node.js installieren (https://nodejs.org, LTS-Version).
2. `npm install` in diesem Ordner ausfuehren.
3. `.env.example` zu `.env` kopieren und ausfuellen:
   - `ICU_ATHLETE_ID` / `ICU_API_KEY` von intervals.icu -> Einstellungen -> API
   - `MCP_AUTH_TOKEN` frei waehlen (langer Zufallsstring), schuetzt den Server
4. `npm start` -> Server laeuft auf `http://localhost:8787/mcp`.

## Tools

- `get_activities(days)` - Trainingsaktivitaeten der letzten N Tage
- `get_wellness(days)` - HRV, Ruhepuls, Schlaf, Gewicht der letzten N Tage
- `get_athlete_profile()` - Stammdaten (FTP, Zonen, Gewicht)
- `create_event(date, type, durationMinutes, description)` - geplante Einheit anlegen
- `delete_event(eventId)` - geplante Einheit loeschen

## Naechste Schritte (noch offen)

- Remote-Hosting (z.B. Cloudflare Workers) statt nur lokal
- Verbindung als Connector in claude.ai eintragen
- Strukturierte Workouts mit Watt-/HF-Intervallen (`create_structured_workout`)
