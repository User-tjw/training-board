import 'dotenv/config';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { createIntervalsClient } from './intervalsClient.js';

const { ICU_ATHLETE_ID, ICU_API_KEY, MCP_AUTH_TOKEN, PORT = 8787 } = process.env;

if (!ICU_ATHLETE_ID || !ICU_API_KEY) {
  console.error('ICU_ATHLETE_ID und ICU_API_KEY muessen in .env gesetzt sein.');
  process.exit(1);
}

const icu = createIntervalsClient(ICU_ATHLETE_ID, ICU_API_KEY);

function buildServer() {
  const server = new McpServer({ name: 'trainiq-intervals-mcp', version: '0.1.0' });

  server.registerTool(
    'get_activities',
    {
      title: 'Trainingsaktivitaeten abrufen',
      description: 'Liest die abgeschlossenen Trainingsaktivitaeten der letzten N Tage aus Intervals.icu.',
      inputSchema: { days: z.number().int().min(1).max(365).default(30) },
    },
    async ({ days }) => {
      const activities = await icu.getActivities(days);
      return { content: [{ type: 'text', text: JSON.stringify(activities, null, 2) }] };
    }
  );

  server.registerTool(
    'get_wellness',
    {
      title: 'Wellness-Daten abrufen',
      description: 'Liest HRV, Ruhepuls, Schlaf und Gewicht der letzten N Tage aus Intervals.icu.',
      inputSchema: { days: z.number().int().min(1).max(365).default(30) },
    },
    async ({ days }) => {
      const wellness = await icu.getWellness(days);
      return { content: [{ type: 'text', text: JSON.stringify(wellness, null, 2) }] };
    }
  );

  server.registerTool(
    'get_athlete_profile',
    {
      title: 'Athletenprofil abrufen',
      description: 'Liest Stammdaten des Athleten (FTP, Gewicht, HF-Zonen etc.) aus Intervals.icu.',
      inputSchema: {},
    },
    async () => {
      const profile = await icu.getAthleteProfile();
      return { content: [{ type: 'text', text: JSON.stringify(profile, null, 2) }] };
    }
  );

  server.registerTool(
    'create_event',
    {
      title: 'Geplante Trainingseinheit anlegen',
      description: 'Legt eine geplante Trainingseinheit im Intervals.icu-Kalender an (Datum, Typ, Dauer, Beschreibung).',
      inputSchema: {
        date: z.string().describe('Datum im Format YYYY-MM-DD'),
        type: z.string().describe('Aktivitaetstyp, z.B. Run, Ride, WeightTraining'),
        durationMinutes: z.number().int().min(1).max(600).optional(),
        description: z.string().optional(),
      },
    },
    async ({ date, type, durationMinutes, description }) => {
      const event = await icu.createEvent({ date, type, durationMinutes, description });
      return { content: [{ type: 'text', text: JSON.stringify(event, null, 2) }] };
    }
  );

  server.registerTool(
    'delete_event',
    {
      title: 'Geplante Trainingseinheit loeschen',
      description: 'Loescht eine zuvor angelegte geplante Einheit anhand ihrer Event-ID.',
      inputSchema: { eventId: z.number().int() },
    },
    async ({ eventId }) => {
      await icu.deleteEvent(eventId);
      return { content: [{ type: 'text', text: `Event ${eventId} geloescht.` }] };
    }
  );

  return server;
}

const app = express();
app.use(express.json());

app.post('/mcp', async (req, res) => {
  if (MCP_AUTH_TOKEN) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${MCP_AUTH_TOKEN}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`TrainIQ Intervals.icu MCP-Server laeuft auf http://localhost:${PORT}/mcp`);
});
