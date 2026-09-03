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

const SHARED_RULES = `Sprache: Deutsch. Dialog kurz, aber eindeutig — direkt, klar, kein unnötiges Fachkauderwelsch. Empfehlungen immer mit kurzer Begründung, aber keine langen Abhandlungen: Antworte in maximal 3-4 kurzen Sätzen oder einer knappen Stichpunktliste, außer Thomas fragt explizit nach mehr Detail. Thomas trifft die finalen Entscheidungen. Du kennst das Athletenprofil und den aktuellen Trainingskontext aus dem folgenden Block — nutze ihn, ohne ihn zu wiederholen. Das gilt besonders für Konditionstrend, verpasste Einheiten und Wellness-Trends (Pfeile ↑↓→): die behältst du im Blick und lässt sie in deine Einschätzung einfließen, zählst sie aber nicht routinemäßig auf — nur wenn sie für die konkrete Frage direkt relevant sind oder eine auffällige Veränderung eine kurze Erwähnung wert ist. Der Kontext-Block enthält "Aktuelle Zeit" (Wochentag + Uhrzeit) — berücksichtige sie bei deinen Einschätzungen und Empfehlungen (z.B. ob für heute noch realistisch Zeit für eine Einheit ist, ob eine Frage sich auf den bereits gelaufenen oder den noch bevorstehenden Tag bezieht), unabhängig vom Ton früherer Nachrichten im Verlauf. Die Begrüßungsfloskel selbst ist zweitrangig — entscheidend ist, dass der inhaltliche Rat zur Tageszeit passt. Für Fragen zu Rädern, Schuhen oder Verschleißteilen steht dir das Tool get_equipment_status zur Verfügung — ruf es nur auf, wenn die Frage das tatsächlich betrifft.`;

// Ausrüstungsdaten kommen nicht mit jeder Anfrage im Kontext-Block mit (tokensparsam), sondern
// werden nur bei Bedarf per Tool-Use live aus training-notes/settings/equipment.json gezogen —
// dieselbe Datei, die die App über saveEquipmentToGH()/syncEquipmentFromGH() pflegt (siehe app.js).
const TOOLS = [{
  name: 'get_equipment_status',
  description: 'Liefert Thomas\' aktuelle Sportausrüstung (Räder, Schuhe, Verschleißteile) inkl. bisheriger Laufleistung, Kettenkilometer und Nutzungsdauer. Nur aufrufen, wenn die Frage sich konkret auf Ausrüstung, Material, Verschleiß, Wartung oder Rotation bezieht.',
  input_schema: { type: 'object', properties: {}, required: [] },
}];

async function fetchEquipmentFromGitHub() {
  const repo = process.env.GH_EQUIPMENT_REPO;
  const token = process.env.GH_TOKEN;
  if (!repo || !token) return 'Ausrüstungsdaten sind serverseitig nicht konfiguriert (GH_TOKEN/GH_EQUIPMENT_REPO fehlt).';
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  try {
    // Aktivitätsarten (settings/activity-kinds.json) werden nur für die Klartext-Labels dazugeladen —
    // schlägt der Abruf fehl, wird einfach mit den rohen IDs weitergemacht statt ganz abzubrechen.
    const [eqRes, kindsRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${repo}/contents/settings/equipment.json`, { headers }),
      fetch(`https://api.github.com/repos/${repo}/contents/settings/activity-kinds.json`, { headers }),
    ]);
    if (eqRes.status === 404) return 'Noch keine Ausrüstung angelegt.';
    if (!eqRes.ok) return `Ausrüstungsdaten konnten nicht geladen werden (GitHub ${eqRes.status}).`;
    const eqFile = await eqRes.json();
    const eqData = JSON.parse(Buffer.from(eqFile.content, 'base64').toString('utf8'));
    const kindLabelById = {};
    if (kindsRes.ok) {
      const kindsFile = await kindsRes.json();
      const kindsData = JSON.parse(Buffer.from(kindsFile.content, 'base64').toString('utf8'));
      (kindsData.items || []).forEach(k => { kindLabelById[k.id] = k.label; });
    }
    const items = (eqData.items || []).filter(it => !it.retired);
    if (!items.length) return 'Noch keine Ausrüstung angelegt.';
    return JSON.stringify(items.map(it => ({
      name: it.name,
      aktivitaetsarten: (it.activityKindIds || []).map(id => kindLabelById[id] || id).join(', ') || 'alle Aktivitäten',
      km: it.totalKm || 0,
      stunden: it.totalHours || 0,
      aktivitaeten: it.totalActivities || 0,
      wartungsgrenzeKm: it.maxKm || null,
      ersteNutzung: it.addedAt || null,
      notiz: it.note || '',
    })));
  } catch (e) {
    return `Ausrüstungsdaten konnten nicht geladen werden (${e.message}).`;
  }
}

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
  const system = [
    { type: 'text', text: buildSystemPrompt(persona, context), cache_control: { type: 'ephemeral' } },
  ];
  const messages = buildMessages(history, message);

  let response = await client.messages.create({
    model: 'claude-sonnet-5', max_tokens: 700, system, tools: TOOLS, messages,
  });

  // Höchstens eine Tool-Use-Runde: reicht für get_equipment_status, hält Kosten/Latenz begrenzt
  // und vermeidet Endlosschleifen, falls das Modell wiederholt nach Tools verlangt.
  if (response.stop_reason === 'tool_use') {
    messages.push({ role: 'assistant', content: response.content });
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const result = block.name === 'get_equipment_status'
        ? await fetchEquipmentFromGitHub()
        : `Unbekanntes Tool: ${block.name}`;
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
    }
    messages.push({ role: 'user', content: toolResults });
    response = await client.messages.create({
      model: 'claude-sonnet-5', max_tokens: 700, system, messages,
    });
  }

  const textBlock = response.content.find(block => block.type === 'text');
  if (!textBlock) {
    const err = new Error('Keine Textantwort vom Modell erhalten.');
    err.status = 502;
    throw err;
  }

  return { text: textBlock.text.trim() };
}

module.exports = { chatWithTrainer, PERSONAS };
