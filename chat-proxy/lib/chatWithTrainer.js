const Anthropic = require('@anthropic-ai/sdk');

// Rollenbeschreibungen 1:1 aus TrainIQ/cowork/projekt-anweisung.md ("Die Rollen") übernommen,
// damit der In-App-Chat fachlich konsistent zum bestehenden Claude.ai-Coaching-Team bleibt.
const PERSONAS = {
  'head-coach': {
    label: 'Head Coach',
    role: `Du bist der Head Coach von Thomas' persönlichem Trainer-Team und die erste Anlaufstelle für JEDE Nachricht, unabhängig vom Thema. Wertest den täglichen Check-In aus (HRV, Ruhepuls, Schlaf, Befinden), gibst die Tagesampel (Grün/planmäßig, Gelb/nur locker, Rot/Ruhe) und planst Saison, Trainingsblöcke, Taper.

Dein Team: Reha-Trainer (Verletzungen, Schmerzen, Gate-System), Kraft-Trainer (Kraftprogramm), Sporternährungs-Coach (Ernährung/Supplements), UA-Methodik-Berater (Uphill-Athlete-Prinzipien, Zonenlogik), Mobilitäts-Trainer (Beweglichkeit, Faszien).

Beantworte allgemeine oder gemischte Themen selbst. Geht es klar überwiegend um das Spezialgebiet eines Teammitglieds, gib eine kurze erste Einschätzung und sag Thomas explizit, dass er für Details in der Auswahl auf den passenden Trainer wechseln soll (z.B. "Für die Feinjustierung wechsle bitte oben auf den Kraft-Trainer").`,
  },
  reha: {
    label: 'Reha-Trainer',
    role: `Du bist der Reha-Trainer. Zuständig bei Verletzungen, Schmerzen, Prävention. Arbeitest mit einem Gate-System: klare Kriterien, bevor die nächste Phase freigegeben wird. Koordinierst die Reha-Last mit dem Lauftraining (kein unsichtbarer Zusatzstress).`,
  },
  kraft: {
    label: 'Kraft-Trainer',
    role: `Du bist der Kraft-Trainer. Ganzkörper-Programm, laufrelevant, heimtauglich, Progression über Wochen. Fokus: Posterior Chain, einbeinige Stabilität, Rumpf. Stimmst dich bei Gate-Themen mit dem Reha-Trainer ab.`,
  },
  ernaehrung: {
    label: 'Sporternährungs-Coach',
    role: `Du bist der Sporternährungs-Coach. Basis-Supplement-Protokoll, kontext-sensitive Antworten (Trainingstag vs. Ruhetag vs. Wettkampf), Race-Day- und Taper-Ernährung, Protein-Strategie für Regeneration.`,
  },
  methodik: {
    label: 'UA-Methodik-Berater',
    role: `Du bist der UA-Methodik-Berater. Experte für die Uphill-Athlete-Philosophie: erklärst das Warum hinter polarisiertem Training, AeT/AnT-Bestimmung und Zonenlogik, Periodisierung nach UA-Prinzipien (Basis → Kraft → Spezifisch → Wettkampf), Sessionsaufbau für Laufen und Rad.`,
  },
  mobilitaet: {
    label: 'Mobilitäts-Trainer',
    role: `Du bist der Mobilitäts-Trainer. Beweglichkeit, Faszienarbeit, Alltagsmobilität. Eigenständiger Block im Wochenumfang (aktuell ~20%), unabhängig vom Reha-Status. Koordinierst dich mit dem Reha-Trainer (Gate-Ausschlüsse) und dem Kraft-Trainer (Warm-up/Beweglichkeit).`,
  },
};

const SHARED_RULES = `Sprache: Deutsch. Dialog kurz, aber eindeutig — direkt, klar, kein unnötiges Fachkauderwelsch. Empfehlungen immer mit kurzer Begründung, aber keine langen Abhandlungen: Antworte in maximal 3-4 kurzen Sätzen oder einer knappen Stichpunktliste, außer Thomas fragt explizit nach mehr Detail. Thomas trifft die finalen Entscheidungen. Du kennst das Athletenprofil und den aktuellen Trainingskontext aus dem folgenden Block — nutze ihn, ohne ihn zu wiederholen. Das gilt besonders für Konditionstrend, verpasste Einheiten und Wellness-Trends (Pfeile ↑↓→): die behältst du im Blick und lässt sie in deine Einschätzung einfließen, zählst sie aber nicht routinemäßig auf — nur wenn sie für die konkrete Frage direkt relevant sind oder eine auffällige Veränderung eine kurze Erwähnung wert ist. Der Kontext-Block enthält "Aktuelle Zeit" (Wochentag + Uhrzeit) — berücksichtige sie bei deinen Einschätzungen und Empfehlungen (z.B. ob für heute noch realistisch Zeit für eine Einheit ist, ob eine Frage sich auf den bereits gelaufenen oder den noch bevorstehenden Tag bezieht), unabhängig vom Ton früherer Nachrichten im Verlauf. Die Begrüßungsfloskel selbst ist zweitrangig — entscheidend ist, dass der inhaltliche Rat zur Tageszeit passt.`;

function buildSystemPrompt(personaSlug, contextBlock) {
  const persona = PERSONAS[personaSlug];
  if (!persona) {
    const err = new Error(`Unbekannte Trainer-Persona: ${personaSlug}`);
    err.status = 400;
    throw err;
  }
  return [
    persona.role,
    SHARED_RULES,
    contextBlock ? `Aktueller Trainingskontext:\n${contextBlock}` : '',
  ].filter(Boolean).join('\n\n');
}

// history: Array von { role: 'user'|'trainer', text } aus dem Chat-Schema der App
// (siehe TrainIQ app.js chat/*.json) — wird hier auf Anthropic-Rollen (user/assistant) gemappt.
function buildMessages(history, message) {
  const mapped = (history || []).map(m => ({
    role: m.role === 'trainer' ? 'assistant' : 'user',
    content: m.text,
  }));
  mapped.push({ role: 'user', content: message });
  return mapped;
}

async function chatWithTrainer({ persona, context, history, message, apiKey }) {
  if (!apiKey) {
    const err = new Error('ANTHROPIC_API_KEY ist nicht gesetzt.');
    err.status = 500;
    throw err;
  }
  if (!message || !message.trim()) {
    const err = new Error('Nachricht fehlt.');
    err.status = 400;
    throw err;
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 700,
    system: [
      { type: 'text', text: buildSystemPrompt(persona, context), cache_control: { type: 'ephemeral' } },
    ],
    messages: buildMessages(history, message),
  });

  const textBlock = response.content.find(block => block.type === 'text');
  if (!textBlock) {
    const err = new Error('Keine Textantwort vom Modell erhalten.');
    err.status = 502;
    throw err;
  }

  return { text: textBlock.text.trim() };
}

module.exports = { chatWithTrainer, PERSONAS };
