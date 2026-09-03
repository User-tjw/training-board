# TrainIQ Chat Proxy

Serverless-Proxy für den In-App-KI-Trainer-Chat von TrainIQ (https://user-tjw.github.io/training-board/).

Hält den Anthropic-API-Key serverseitig (nie im Frontend) — analog zum Proxy-Muster im
Belege-Scanner-Projekt.

## Lokal starten

```
npm install
cp .env.example .env   # ANTHROPIC_API_KEY (+ optional GH_TOKEN/GH_EQUIPMENT_REPO) eintragen
npm run dev
```

Läuft dann auf `http://localhost:3001`, Endpoint `POST /api/chat`.

## Deployment

Als eigenes Vercel-Projekt deployen — beim Import in Vercel als **Root Directory**
`chat-proxy` einstellen (dieses Repo enthält auch die eigentliche TrainIQ-App im
Repo-Root, die weiterhin separat über GitHub Pages läuft). `ANTHROPIC_API_KEY` als
Vercel-Environment-Variable setzen — der Vercel-Handler liegt in `api/chat.js`.

## Tool-Use: Ausrüstungsdaten (`get_equipment_status`)

Der Trainer kann sich bei Bedarf (Fragen zu Rädern/Schuhen/Verschleiß) live
`settings/equipment.json` aus dem `training-notes`-Repo holen, statt sie in jeder
Anfrage im Kontext mitzuschicken (siehe `lib/chatWithTrainer.js`, `fetchEquipmentFromGitHub`).
Dafür zwei zusätzliche Vercel-Environment-Variablen setzen:

- `GH_TOKEN` — read-only Fine-grained GitHub-PAT, Scope nur Contents-Read auf das Repo unten.
  Getrennt vom Browser-seitigen Token der App (`localStorage`) — dieser lebt nur serverseitig.
- `GH_EQUIPMENT_REPO` — z.B. `user-tjw/training-notes`.

Ohne diese beiden Variablen liefert das Tool nur einen Hinweistext statt echter Daten.

## Request-Format

```json
{
  "persona": "head-coach",
  "context": "HRV: 52 · Ruhepuls: 48 · ...",
  "history": [{ "role": "user", "text": "..." }, { "role": "trainer", "text": "..." }],
  "message": "Wie fühlst du dich heute?"
}
```

`persona` ist einer von: `head-coach`, `reha`, `kraft`, `ernaehrung`, `methodik`, `mobilitaet`
(siehe `lib/chatWithTrainer.js`, Rollenbeschreibungen aus TrainIQ `cowork/projekt-anweisung.md`).

Antwort: `{ "text": "..." }`
