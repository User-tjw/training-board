// ─── Zeitraum pro Kachel-Gruppe ────────────────────────────────────────────────

const RANGE_OPTIONS = [7, 14, 30, 90, 365];
let _wellnessFull = [], _activitiesFull = [], _fitnessFull = [], _icuEventsFull = [];

function getRangeDays(key, def) {
  const v = parseInt(localStorage.getItem('tb_range_' + key));
  return RANGE_OPTIONS.includes(v) ? v : def;
}
function setRangeDays(key, v) { localStorage.setItem('tb_range_' + key, v); }
function sliceDays(arr, days, getDate) {
  const from = daysAgo(days);
  return arr.filter(d => getDate(d) >= from);
}
function applyStoredRanges() {
  document.querySelectorAll('.range-select').forEach(s => {
    const firstKey = s.dataset.keys ? s.dataset.keys.split(',')[0] : s.dataset.key;
    s.value = getRangeDays(firstKey, parseInt(s.dataset.default) || 14);
  });
}

document.addEventListener('change', e => {
  if (!e.target.matches('.range-select')) return;
  const keys = e.target.dataset.keys ? e.target.dataset.keys.split(',') : [e.target.dataset.key];
  keys.forEach(key => {
    setRangeDays(key, e.target.value);
    document.querySelectorAll(`.range-select[data-key="${key}"]`).forEach(s => { s.value = e.target.value; });
  });
  renderFromCache();
});

function renderFromCache() {
  if (!_wellnessFull.length && !_activitiesFull.length) return;
  renderCockpitLoad();
  renderOverviewGroup();
  renderZonesGroup();
  renderWellnessGroup();
}

// ─── Passwortschutz ──────────────────────────────────────────────────────────

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function checkPassword() {
  const input = document.getElementById('pwInput').value;
  if (!input) return;
  if (!window.crypto || !window.crypto.subtle) {
    document.getElementById('pwSub').textContent = 'Passwortschutz benötigt HTTPS oder localhost (kein sicherer Kontext erkannt).';
    return;
  }
  const hash = await sha256(input);
  const stored = localStorage.getItem('tb_pw_hash');

  if (!stored) {
    // Erstes Mal: Passwort setzen
    if (input.length < 4) {
      document.getElementById('pwSub').textContent = 'Mindestens 4 Zeichen bitte.';
      return;
    }
    localStorage.setItem('tb_pw_hash', hash);
    unlockApp();
  } else if (hash === stored) {
    unlockApp();
  } else {
    document.getElementById('pwError').style.display = 'block';
    document.getElementById('pwInput').value = '';
    document.getElementById('pwInput').focus();
  }
}

const SESSION_TIMEOUT_HOURS = 0.5; // Nach 30 Minuten automatisch abmelden

function logout() {
  sessionStorage.removeItem('tb_authenticated');
  sessionStorage.removeItem('tb_login_time');
  sessionStorage.removeItem('tb_active_section');
  document.getElementById('appContainer').style.display = 'none';
  document.getElementById('setupScreen').style.display = 'none';
  document.getElementById('passwordScreen').style.display = 'flex';
  document.getElementById('pwInput').value = '';
  document.getElementById('pwError').style.display = 'none';
}

function unlockApp(fromReload = false) {
  sessionStorage.setItem('tb_authenticated', '1');
  sessionStorage.setItem('tb_login_time', Date.now().toString());
  if (!fromReload) {
    sessionStorage.removeItem('tb_active_section');
  }
  document.getElementById('passwordScreen').style.display = 'none';
  if (athleteId && apiKey) {
    showApp();
  } else {
    document.getElementById('setupScreen').style.display = 'flex';
  }
}

function isSessionValid() {
  if (sessionStorage.getItem('tb_authenticated') !== '1') return false;
  const loginTime = parseInt(sessionStorage.getItem('tb_login_time') || '0');
  const elapsed = (Date.now() - loginTime) / (1000 * 60 * 60); // in Stunden
  return elapsed < SESSION_TIMEOUT_HOURS;
}

// Beim ersten Besuch: Passwort setzen statt eingeben
(function() {
  const stored = localStorage.getItem('tb_pw_hash');
  if (!stored) {
    document.getElementById('pwSub').textContent = 'Lege beim ersten Besuch dein Passwort fest.';
  }
})();

// ─── Config & Auth ────────────────────────────────────────────────────────────

const ICU_BASE = 'https://intervals.icu/api/v1';
let athleteId = localStorage.getItem('icu_athlete_id') || '';
let apiKey    = localStorage.getItem('icu_api_key') || '';
let ghToken   = localStorage.getItem('gh_token') || '';
let ghRepo    = localStorage.getItem('gh_repo')  || '';

function authHeader() {
  return { 'Authorization': 'Basic ' + btoa('API_KEY:' + apiKey) };
}

function icuFetch(path) {
  return fetch(ICU_BASE + path, { headers: authHeader() }).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

function icuWrite(path, method, body) {
  return fetch(ICU_BASE + path, {
    method,
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return method === 'DELETE' ? null : r.json();
  });
}

// ─── Setup ───────────────────────────────────────────────────────────────────

// App startet erst nach Passwort-Check (siehe unlockApp)

async function saveSetup() {
  const id  = document.getElementById('setupAthleteId').value.trim();
  const key = document.getElementById('setupApiKey').value.trim();
  if (!id || !key) return;
  athleteId = id; apiKey = key;
  // Quick test
  try {
    await fetch(`${ICU_BASE}/athlete/${id}/activities?oldest=${fmtDate(daysAgo(7))}`,
      { headers: { 'Authorization': 'Basic ' + btoa('API_KEY:' + key) } }).then(r => { if (!r.ok) throw new Error(); });
    localStorage.setItem('icu_athlete_id', id);
    localStorage.setItem('icu_api_key', key);
    showApp();
  } catch(e) {
    document.getElementById('setupError').style.display = 'block';
  }
}

function showApp() {
  document.getElementById('setupScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'flex';
  init();
}

function getTrainingPlan() {
  try { return JSON.parse(localStorage.getItem('training_plan') || '{}'); } catch(e) { return {}; }
}

function getManualRespiration() {
  try { return JSON.parse(localStorage.getItem('manual_respiration') || '{}'); } catch(e) { return {}; }
}

// Pro-Aktivität-Metadaten (RPE, Trainingsbefinden, Bemerkung), keyed nach Aktivitäts-ID.
// Gleiches Sync-Muster wie Atmung: localStorage + settings/activity-meta.json auf GitHub.
function getActivityMeta() {
  try { return JSON.parse(localStorage.getItem('activity_meta') || '{}'); } catch(e) { return {}; }
}
function getActivityMetaFor(actId) {
  const m = getActivityMeta()[actId];
  return m && typeof m === 'object' ? m : {};
}
function saveActivityMetaValue(actId, patch) {
  if (!actId) return;
  const data = getActivityMeta();
  const cur = (data[actId] && typeof data[actId] === 'object') ? data[actId] : {};
  const next = { ...cur, ...patch };
  // leere Felder wieder entfernen, damit das JSON schlank bleibt
  Object.keys(next).forEach(k => { if (next[k] == null || next[k] === '') delete next[k]; });
  if (Object.keys(next).length === 0) delete data[actId]; else data[actId] = next;
  data.updatedAt = Date.now();
  localStorage.setItem('activity_meta', JSON.stringify(data));
  if (ghToken && ghRepo) {
    saveActivityMetaToGH(data).catch(e => alert('Speichern bei GitHub fehlgeschlagen: ' + e.message + '\n\nDer Wert ist trotzdem lokal in diesem Browser gespeichert.'));
  }
}

// Geplante Trainingseinheiten (Inline-Trainingsplan), keyed nach Datum → Array von Einheiten.
function getPlanSessions() {
  try { return JSON.parse(localStorage.getItem('plan_sessions') || '{}'); } catch(e) { return {}; }
}
// Alle Plan-Typen werden zu Intervals.icu übertragen. Laufen/Rad/Kraft/Mobilität als echtes
// WORKOUT-Event (Sportart-Typ nötig, damit Garmin Connect es abholen kann); Krankheit nutzt ICUs
// eigene "Krank"-Kategorie; Ruhetag als einfache Notiz — beide ohne Sportart, kein Garmin-Push nötig.
const PLAN_ICU_CONFIG = {
  Laufen:     { category: 'WORKOUT', type: 'Run' },
  Rad:        { category: 'WORKOUT', type: 'Ride' },
  Kraft:      { category: 'WORKOUT', type: 'WeightTraining' },
  Mobilität:  { category: 'WORKOUT', type: 'Workout' },
  Krankheit:  { category: 'SICK' },
  Ruhetag:    { category: 'NOTE' },
};
const ICU_TYPE_TO_PLAN_TYPE = Object.fromEntries(
  Object.entries(PLAN_ICU_CONFIG).filter(([,c]) => c.type).map(([planType, c]) => [c.type, planType])
);

// Legt/aktualisiert das zugehörige Intervals.icu-Event für eine geplante Einheit.
// Gibt die Session mit gesetzter/entfernter icuEventId zurück; scheitert lautlos (Konsole), damit
// lokales Speichern nie an einem ICU-Fehler hängen bleibt.
async function syncSessionToICU(dateStr, session) {
  const icuConfig = PLAN_ICU_CONFIG[session.type];
  if (!icuConfig) {
    if (session.icuEventId) { await deleteSessionFromICU(session); delete session.icuEventId; }
    return session;
  }
  const sec = session.min ? session.min * 60 : 0;
  const body = {
    category: icuConfig.category,
    start_date_local: `${dateStr}T00:00:00`,
    name: session.note || session.type,
    ...(icuConfig.type ? {
      type: icuConfig.type,
      moving_time: session.min ? sec : undefined,
      // Entscheidend für den Garmin-Push ist offenbar nicht der Inhalt, sondern dass workout_doc
      // überhaupt ein Objekt ist (nicht null) — ein per API angelegtes Event ohne workout_doc wird
      // von Garmin Connect nicht abgeholt, ein in der ICU-Oberfläche angelegtes (auch mit leeren
      // steps) schon. Per Vergleich zweier echter Events am 2026-07-10 verifiziert.
      workout_doc: { steps: [], locales: [], options: {}, distance: 0, duration: sec },
    } : {}),
  };
  try {
    if (session.icuEventId) {
      await icuWrite(`/athlete/${athleteId}/events/${session.icuEventId}`, 'PUT', body);
    } else {
      const created = await icuWrite(`/athlete/${athleteId}/events`, 'POST', body);
      session.icuEventId = created.id;
    }
  } catch(e) { console.error('Intervals.icu-Sync fehlgeschlagen:', e); }
  return session;
}
function deleteSessionFromICU(session) {
  if (!session || !session.icuEventId) return Promise.resolve();
  return icuWrite(`/athlete/${athleteId}/events/${session.icuEventId}`, 'DELETE')
    .catch(e => console.error('Intervals.icu-Event konnte nicht gelöscht werden:', e));
}
// Löscht ein Event, das nicht von TrainIQ angelegt wurde (direkt in ICU oder via Garmin geplant),
// direkt bei Intervals.icu. Es gibt kein lokales Session-Objekt dafür — nach Erfolg nur aus dem
// geladenen Cache entfernen und neu rendern.
async function deleteIcuOnlyEvent(icuEventId) {
  if (!confirm('Dieses in Intervals.icu geplante Training wirklich löschen?')) return;
  try {
    await icuWrite(`/athlete/${athleteId}/events/${icuEventId}`, 'DELETE');
    _icuEventsFull = _icuEventsFull.filter(ev => ev.id !== icuEventId);
    renderCockpitWeek();
  } catch(e) {
    alert('Löschen bei Intervals.icu fehlgeschlagen: ' + e.message);
  }
}
// Wandelt ein von Intervals.icu geladenes Event (nicht durch TrainIQ angelegt, z.B. direkt
// in ICU oder via Garmin geplant) in eine anzeigbare, schreibgeschützte Plan-Session um.
function icuEventToPlanSession(ev) {
  const type = ICU_TYPE_TO_PLAN_TYPE[ev.type];
  if (!type) return null;
  const sec = ev.moving_time || (ev.workout_doc && ev.workout_doc.duration) || null;
  return { id: 'icu' + ev.id, type, min: sec ? Math.round(sec/60) : null, note: ev.name || '', icuEventId: ev.id, source: 'icu' };
}
function getPlanSessionsFor(dayStr) {
  const local = getPlanSessions()[dayStr];
  const localArr = Array.isArray(local) ? local : [];
  const linkedIcuIds = new Set(localArr.filter(s => s.icuEventId).map(s => s.icuEventId));
  const icuOnly = _icuEventsFull
    .filter(ev => fmtDate(new Date(ev.start_date_local)) === dayStr && !linkedIcuIds.has(ev.id))
    .map(icuEventToPlanSession)
    .filter(Boolean);
  return [...localArr, ...icuOnly];
}
function savePlanSessions(data) {
  data.updatedAt = Date.now();
  localStorage.setItem('plan_sessions', JSON.stringify(data));
  if (ghToken && ghRepo) {
    savePlanSessionsToGH(data).catch(e => alert('Speichern bei GitHub fehlgeschlagen: ' + e.message + '\n\nDer Plan ist trotzdem lokal gespeichert.'));
  }
}
async function upsertPlanSession(dayStr, session) {
  await syncSessionToICU(dayStr, session);
  const data = getPlanSessions();
  const arr = Array.isArray(data[dayStr]) ? data[dayStr] : [];
  const idx = session.id ? arr.findIndex(s => s.id === session.id) : -1;
  if (idx >= 0) arr[idx] = session; else arr.push(session);
  data[dayStr] = arr;
  savePlanSessions(data);
}
async function removePlanSession(dayStr, id) {
  const data = getPlanSessions();
  if (!Array.isArray(data[dayStr])) return;
  const session = data[dayStr].find(s => s.id === id);
  await deleteSessionFromICU(session);
  data[dayStr] = data[dayStr].filter(s => s.id !== id);
  if (data[dayStr].length === 0) delete data[dayStr];
  savePlanSessions(data);
}

// Ausgeblendete Aktivitäten: nur auf DIESEM Dashboard versteckt, bleiben bei intervals.icu unangetastet.
// Array von IDs; wird beim Laden angewendet, damit sie nach Reload/Sync ausgeblendet bleiben.
function getHiddenActivityIds() {
  try { const d = JSON.parse(localStorage.getItem('hidden_activities') || '{}'); return Array.isArray(d.ids) ? d.ids : []; } catch(e) { return []; }
}
function hideActivity(actId) {
  const ids = getHiddenActivityIds();
  if (!ids.includes(String(actId))) ids.push(String(actId));
  const data = { ids, updatedAt: Date.now() };
  localStorage.setItem('hidden_activities', JSON.stringify(data));
  if (ghToken && ghRepo) {
    saveJSONToGH(GH_HIDDEN_ACTIVITIES_FILE, data, 'Update ausgeblendete Aktivitäten').catch(e => alert('Speichern bei GitHub fehlgeschlagen: ' + e.message + '\n\nLokal ist die Aktivität trotzdem ausgeblendet.'));
  }
}
function syncHiddenActivitiesFromGH() { return syncJSONFromGH(GH_HIDDEN_ACTIVITIES_FILE, 'hidden_activities', () => ({ids: getHiddenActivityIds()}), renderFromCache); }
function filterHiddenActivities(list) {
  const hidden = getHiddenActivityIds();
  return hidden.length ? list.filter(a => !hidden.includes(String(a.id))) : list;
}

function getHfZones() {
  try { return JSON.parse(localStorage.getItem('hf_zones') || '{}'); } catch(e) { return {}; }
}

function applyHfZonesToInputs() {
  const z = getHfZones();
  document.getElementById('aet').value = z.aet ?? 148;
  document.getElementById('ant').value = z.ant ?? 168;
  document.getElementById('maxHr').value = z.maxHr ?? '';
}

function saveHfZonesLocal() {
  const aet = parseInt(document.getElementById('aet')?.value) || 148;
  const ant = parseInt(document.getElementById('ant')?.value) || 168;
  const maxHr = parseInt(document.getElementById('maxHr')?.value) || null;
  const zones = { aet, ant, maxHr, updatedAt: Date.now() };
  localStorage.setItem('hf_zones', JSON.stringify(zones));
  return zones;
}

function saveHfZones() {
  const zones = saveHfZonesLocal();
  if (ghToken && ghRepo) {
    saveHfZonesToGH(zones).catch(e => alert('Speichern bei GitHub fehlgeschlagen: ' + e.message + '\n\nDer Wert ist trotzdem lokal in diesem Browser gespeichert.'));
  }
  const saved = document.getElementById('hfZonesSaved');
  if (saved) {
    saved.style.display = 'block';
    clearTimeout(saved._hideTimer);
    saved._hideTimer = setTimeout(() => { saved.style.display = 'none'; }, 2000);
  }
}

// Persönliche Daten (Name/Geburtstag/FTP/Größe) — ändern sich über die Zeit, daher als Einstellung
// statt fest im Code (siehe copyNoteForClaude(), das Alter wird aus dem Geburtstag berechnet).
function getAthleteProfile() {
  try { return JSON.parse(localStorage.getItem('athlete_profile') || '{}'); } catch(e) { return {}; }
}

function applyAthleteProfileToInputs() {
  const p = getAthleteProfile();
  document.getElementById('profileName').value = p.name ?? 'Thomas Wagner';
  document.getElementById('profileBirthDate').value = p.birthDate ?? '1975-07-16';
  document.getElementById('profileFtp').value = p.ftp ?? 250;
  document.getElementById('profileHeight').value = p.height ?? 172;
}

function saveAthleteProfileLocal() {
  const name = document.getElementById('profileName')?.value.trim() || 'Thomas Wagner';
  const birthDate = document.getElementById('profileBirthDate')?.value || null;
  const ftp = parseInt(document.getElementById('profileFtp')?.value) || null;
  const height = parseFloat(document.getElementById('profileHeight')?.value) || null;
  const profile = { name, birthDate, ftp, height, updatedAt: Date.now() };
  localStorage.setItem('athlete_profile', JSON.stringify(profile));
  return profile;
}

function saveAthleteProfile() {
  const profile = saveAthleteProfileLocal();
  if (ghToken && ghRepo) {
    saveAthleteProfileToGH(profile).catch(e => alert('Speichern bei GitHub fehlgeschlagen: ' + e.message + '\n\nDer Wert ist trotzdem lokal in diesem Browser gespeichert.'));
  }
  const saved = document.getElementById('profileSaved');
  if (saved) {
    saved.style.display = 'inline';
    clearTimeout(saved._hideTimer);
    saved._hideTimer = setTimeout(() => { saved.style.display = 'none'; }, 2000);
  }
}

function calcAge(birthDateStr) {
  if (!birthDateStr) return null;
  const b = new Date(birthDateStr + 'T00:00');
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

function saveManualRespirationValue(actId, raw) {
  if (!actId) return;
  const value = raw === '' || raw == null ? null : parseFloat(String(raw).replace(',', '.'));
  if (raw !== '' && raw != null && (isNaN(value) || value <= 0)) { alert('Bitte eine positive Zahl für Atmung eingeben.'); return; }
  const data = getManualRespiration();
  if (value == null) delete data[actId]; else data[actId] = value;
  data.updatedAt = Date.now();
  localStorage.setItem('manual_respiration', JSON.stringify(data));
  if (ghToken && ghRepo) {
    saveManualRespirationToGH(data).catch(e => alert('Speichern bei GitHub fehlgeschlagen: ' + e.message + '\n\nDer Wert ist trotzdem lokal in diesem Browser gespeichert.'));
  }
}

// Einstellungen: schwebendes Modal (wie der Morgen-Check) — links Themen-Liste (.settings-nav-item), rechts die passende .settings-pane
function openSettingsModal() {
  populateSettingsForm();
  selectSettingsPane('connections');
  document.getElementById('settingsModal').style.display = 'flex';
}
function closeSettingsModal() {
  document.getElementById('settingsModal').style.display = 'none';
}
function selectSettingsPane(name) {
  document.querySelectorAll('.settings-nav-item').forEach(n => n.classList.toggle('active', n.dataset.pane === name));
  document.querySelectorAll('.settings-pane').forEach(p => p.style.display = (p.id === 'pane-' + name) ? 'block' : 'none');
}

function populateSettingsForm() {
  document.getElementById('settingsAthleteId').value = athleteId;
  document.getElementById('settingsApiKey').value = apiKey;
  document.getElementById('settingsGhToken').value = ghToken;
  document.getElementById('settingsGhRepo').value = ghRepo;
  const days = getRestDays();
  for (let i = 0; i < 7; i++) document.getElementById('restDay'+i).checked = days.includes(i);
  applyAthleteProfileToInputs();
}

// Plan-Seite (Trainingsziel + Trainings-Soll + Wettkämpfe/Periodisierung) — separat von den Einstellungen, siehe populateSettingsForm()
function populatePlanForm() {
  const plan = getTrainingPlan();
  document.getElementById('settingsGoalWeekHours').value = plan.weekHours ?? '';
  document.getElementById('settingsGoalLaufenPct').value = plan.byTypePct?.Laufen ?? '';
  document.getElementById('settingsGoalRadPct').value = plan.byTypePct?.Rad ?? '';
  document.getElementById('settingsGoalKraftPct').value = plan.byTypePct?.Kraft ?? '';
  document.getElementById('settingsGoalMobilitaetPct').value = plan.byTypePct?.['Mobilität'] ?? '';
  updateGoalPctHint();
  renderRacesList(plan.races || []);
  renderPhaseTimeline();
}

// Wettkämpfe: Liste mit Name/Datum/Priorität (A/B/C), siehe UA-Rennsystem in cowork/skill-training-management.md.
// A treibt die Phasen-Zeitleiste, B/C sind reine Kalendermarkierungen im Wochenkalender (siehe buildWeekCalendar).
let _raceRowSeq = 0;
function renderRacesList(races) {
  const el = document.getElementById('raceList');
  _raceRowSeq = 0;
  el.innerHTML = races.map(r => raceRowHtml(r)).join('');
}
function raceRowHtml(r) {
  const id = 'race' + (_raceRowSeq++);
  const prio = r.priority || 'A';
  return `<div class="race-row" data-race-id="${id}">
    <input class="setup-input race-row-name" type="text" placeholder="Name" value="${escHtml(r.name || '')}">
    <input class="setup-input race-row-date" type="date" value="${r.date || ''}">
    <select class="setup-input race-row-prio">
      <option value="A"${prio==='A'?' selected':''}>A</option>
      <option value="B"${prio==='B'?' selected':''}>B</option>
      <option value="C"${prio==='C'?' selected':''}>C</option>
    </select>
    <button class="btn icon-btn" title="Entfernen" onclick="this.closest('.race-row').remove()">✕</button>
  </div>`;
}
function addRaceRow() {
  document.getElementById('raceList').insertAdjacentHTML('beforeend', raceRowHtml({ priority: 'A' }));
}
function readRacesFromForm() {
  return Array.from(document.querySelectorAll('#raceList .race-row')).map(row => ({
    name: row.querySelector('.race-row-name').value.trim(),
    date: row.querySelector('.race-row-date').value,
    priority: row.querySelector('.race-row-prio').value,
  })).filter(r => r.name && r.date);
}

// Uphill-Athlete-Periodisierung (siehe cowork/skill-training-management.md): 4 Phasen rückwärts vom
// Wettkampfdatum des A-Rennens, Dauer als Mittelwert der dort angegebenen Spannen.
const UA_PHASES = [
  { name: 'Basis',       days: 105, focus: 'AeT aufbauen, Volumen',              color: '#3b82f6' },
  { name: 'Intensität',  days: 49,  focus: 'Kraft + Bergläufe als Reiz',         color: '#8b5cf6' },
  { name: 'Spezifisch',  days: 35,  focus: 'Wettkampf-Intensitäten',             color: '#f59e0b' },
  { name: 'Taper',       days: 18,  focus: 'Frische aufbauen',                   color: '#10b981' },
];
// Jedes A-Rennen ab heute treibt einen eigenen Basis→Taper-Zyklus (7 Monate Abstand = zwei
// eigenständige Saisonziele, kein durchgehender Bogen — UA-Doku kennt nur den Einzelzyklus,
// methodisch braucht aber jedes A-Rennen seinen eigenen Reset). Ohne kommendes A-Rennen wird das
// letzte vergangene als Kontext genutzt (pastOnly). Liegt ein A-Rennen näher am vorherigen als eine
// volle Zyklusdauer, wird sein Zyklus proportional gestaucht statt sich zu überlappen.
function computeMultiCyclePhases(races, today) {
  const aRaces = (races || []).filter(r => r.priority === 'A' && r.date).sort((a,b) => a.date.localeCompare(b.date));
  if (!aRaces.length) return null;
  const todayStr = fmtDate(today);
  let relevant = aRaces.filter(r => r.date >= todayStr);
  let pastOnly = false;
  if (!relevant.length) { relevant = [aRaces[aRaces.length - 1]]; pastOnly = true; }

  const totalRawDays = UA_PHASES.reduce((s,p) => s + p.days, 0);
  const cycles = [];
  // Erster Zyklus wird gegen "heute" gestaucht (Vorbereitung läuft ab heute, nicht rückwirkend),
  // Folgezyklen gegen das jeweils vorherige A-Rennen. Beim reinen Vergangenheits-Kontext (pastOnly)
  // entfällt der heute-Anker, da der Zyklus dann ohnehin nur zur Einordnung dient.
  let prevRaceDate = pastOnly ? null : today;
  for (const race of relevant) {
    const raceDate = new Date(race.date + 'T00:00:00');
    if (isNaN(raceDate)) continue;
    let availableDays = totalRawDays;
    if (prevRaceDate) {
      const gapDays = (raceDate - prevRaceDate) / 86400000;
      if (gapDays < totalRawDays) availableDays = Math.max(gapDays, UA_PHASES.length);
    }
    const factor = availableDays / totalRawDays;
    let end = raceDate;
    const phases = [];
    let daysUsed = 0;
    for (let i = UA_PHASES.length - 1; i >= 0; i--) {
      // Basis (i=0, letzte Iteration) fängt den Rundungsrest exakt auf, statt selbst unabhängig
      // gerundet zu werden — sonst driftet der Zyklusstart leicht von "heute"/dem Vorgänger-Rennen
      // weg (einzelne Tage Differenz je nach Rundung der anderen drei Phasen).
      const days = i === 0
        ? Math.max(1, Math.round(availableDays) - daysUsed)
        : Math.max(1, Math.round(UA_PHASES[i].days * factor));
      if (i !== 0) daysUsed += days;
      const start = new Date(end); start.setDate(start.getDate() - days);
      phases.unshift({ ...UA_PHASES[i], days, start, end: new Date(end) });
      end = start;
    }
    cycles.push({ race, raceDate, phases });
    prevRaceDate = raceDate;
  }
  return { cycles, pastOnly };
}
function renderPhaseTimeline() {
  const el = document.getElementById('phaseTimeline');
  if (!el) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const result = computeMultiCyclePhases(readRacesFromForm(), today);
  if (!result || !result.cycles.length) {
    el.innerHTML = `<div class="setup-hint">Kein A-Wettkampf eingetragen — Basisphase.</div>`;
    return;
  }
  const { cycles, pastOnly } = result;
  const fmtShort = d => d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
  const first = cycles[0], last = cycles[cycles.length - 1];

  if (pastOnly && today > last.raceDate) {
    el.innerHTML = `<div class="setup-hint">"${escHtml(last.race.name)}" liegt in der Vergangenheit.</div>`;
    return;
  }
  if (today < first.phases[0].start) {
    el.innerHTML = `<div class="setup-hint">"${escHtml(first.race.name)}" noch weit voraus — Basisphase beginnt ${fmtShort(first.phases[0].start)}.</div>`;
    return;
  }

  const overallStart = first.phases[0].start;
  const overallEnd = last.raceDate;
  const totalDays = (overallEnd - overallStart) / 86400000;

  let segments = '';
  let prevEnd = overallStart;
  cycles.forEach(cycle => {
    const gapDays = (cycle.phases[0].start - prevEnd) / 86400000;
    if (gapDays > 0.5) {
      const gapWidth = gapDays / totalDays * 100;
      const gapCompact = gapWidth < 6 ? ' phase-compact' : '';
      segments += `<div class="phase-segment phase-gap${gapCompact}" style="width:${gapWidth.toFixed(2)}%" title="Übergang: ${fmtShort(prevEnd)}–${fmtShort(cycle.phases[0].start)}">
        <div class="phase-label">Übergang</div>
        <div class="phase-daterange">${fmtShort(prevEnd)}–${fmtShort(cycle.phases[0].start)}</div>
      </div>`;
    }
    cycle.phases.forEach(p => {
      const isCurrent = today >= p.start && today < p.end;
      const width = p.days / totalDays * 100;
      const compact = width < 6 ? ' phase-compact' : '';
      segments += `<div class="phase-segment${isCurrent ? ' current' : ''}${compact}" style="width:${width.toFixed(2)}%;background:${p.color}1a;border-color:${p.color};color:${p.color}" title="${p.name}: ${p.focus} (${fmtShort(p.start)}–${fmtShort(p.end)})">
        <div class="phase-label">${p.name}</div>
        <div class="phase-daterange">${fmtShort(p.start)}–${fmtShort(p.end)}</div>
      </div>`;
    });
    prevEnd = cycle.raceDate;
  });

  const todayPct = Math.min(100, Math.max(0, (today - overallStart) / (86400000 * totalDays) * 100));
  const subMarkers = renderSubRaceMarkers(overallStart, overallEnd, totalDays, fmtShort);
  const raceMarkers = cycles.map(cycle => {
    const pct = Math.min(100, Math.max(0, (cycle.raceDate - overallStart) / (86400000 * totalDays) * 100));
    return `<div class="phase-race-marker" style="left:${pct.toFixed(2)}%" title="A: ${escHtml(cycle.race.name)} (${fmtShort(cycle.raceDate)})"><span class="phase-race-flag">▲</span></div>`;
  }).join('');
  const regenZones = renderRegenZones(cycles, overallStart, totalDays);
  el.innerHTML = `<div class="phase-timeline">${segments}${regenZones}<div class="phase-marker" style="left:${todayPct}%" title="Heute"></div>${subMarkers}${raceMarkers}</div>`;
}

// Regenerationswochen als schraffierte Zonen direkt in der Phasen-Zeitleiste (statt eigener
// Wochen-Detailansicht — siehe skill-training-management.md „Makrozyklus-Wochentypen"): Basis,
// Intensität und Spezifisch bekommen alle 3–4 Wochen eine R-Woche (letzte Woche jedes Blocks),
// Taper nicht (siehe Wochenfolge-Muster: T T, kein R davor).
const PHASE_REGEN_BLOCK_DAYS = { Basis: 28, 'Intensität': 21, Spezifisch: 21 };
function renderRegenZones(cycles, overallStart, totalDays) {
  const totalMs = 86400000 * totalDays;
  let zones = '';
  cycles.forEach(cycle => {
    cycle.phases.forEach(phase => {
      const blockDays = PHASE_REGEN_BLOCK_DAYS[phase.name];
      if (!blockDays) return;
      let blockStart = new Date(phase.start);
      while (blockStart < phase.end) {
        let blockEnd = new Date(blockStart); blockEnd.setDate(blockEnd.getDate() + blockDays);
        if (blockEnd > phase.end) blockEnd = new Date(phase.end);
        const regenStart = new Date(blockEnd); regenStart.setDate(regenStart.getDate() - 7);
        const zoneStart = regenStart < blockStart ? blockStart : regenStart;
        const startPct = Math.max(0, (zoneStart - overallStart) / totalMs * 100);
        const endPct = Math.min(100, (blockEnd - overallStart) / totalMs * 100);
        if (endPct > startPct) {
          zones += `<div class="phase-regen-zone" style="left:${startPct.toFixed(2)}%;width:${(endPct - startPct).toFixed(2)}%" title="Regeneration"></div>`;
        }
        blockStart = blockEnd;
      }
    });
  });
  return zones;
}

// B/C-Rennen im laufenden A-Zyklus als Mini-Taper-Marker: schraffierte Zone (Volumen-Reduktion)
// kurz vor dem Rennen + dezente Markierungslinie mit Prioritäts-Tag. Unterbricht die
// Basis/Intensität/Spezifisch/Taper-Phasen nicht, überlagert sie nur.
const SUB_RACE_TAPER_DAYS = { B: 4, C: 2 };
function renderSubRaceMarkers(rangeStart, rangeEnd, totalDays, fmtShort) {
  const totalMs = 86400000 * totalDays;
  const subRaces = readRacesFromForm()
    .filter(r => (r.priority === 'B' || r.priority === 'C') && r.date)
    .map(r => ({ ...r, dateObj: new Date(r.date + 'T00:00:00') }))
    .filter(r => !isNaN(r.dateObj) && r.dateObj >= rangeStart && r.dateObj <= rangeEnd);
  return subRaces.map(r => {
    const pct = Math.min(100, Math.max(0, (r.dateObj - rangeStart) / totalMs * 100));
    const taperDays = SUB_RACE_TAPER_DAYS[r.priority];
    const taperStartPct = Math.max(0, ((r.dateObj - taperDays * 86400000) - rangeStart) / totalMs * 100);
    return `<div class="phase-subrace-taper" style="left:${taperStartPct.toFixed(2)}%;width:${(pct - taperStartPct).toFixed(2)}%"></div>
      <div class="phase-subrace-marker" style="left:${pct.toFixed(2)}%" title="${r.priority}: ${escHtml(r.name)} (${fmtShort(r.dateObj)})">
        <span class="phase-subrace-tag">${r.priority}</span>
      </div>`;
  }).join('');
}

// Trainingsfreie Wochentage: 0=Montag…6=Sonntag, wie Trainings-Soll/HF-Zonen per GitHub synchronisiert
function getRestDays() {
  try { return JSON.parse(localStorage.getItem('rest_days')).days || []; } catch { return []; }
}
function getRestDaysData() {
  try { return JSON.parse(localStorage.getItem('rest_days')) || {}; } catch { return {}; }
}
function updateGoalPctHint() {
  const num = id => { const v = parseFloat(document.getElementById(id).value); return isNaN(v) ? 0 : v; };
  const sum = num('settingsGoalLaufenPct') + num('settingsGoalRadPct') + num('settingsGoalKraftPct') + num('settingsGoalMobilitaetPct');
  const hint = document.getElementById('settingsGoalPctHint');
  hint.textContent = sum > 0
    ? `Summe: ${sum}% der Wochenstunden gesamt.${sum > 100 ? ' Achtung: über 100%.' : ''}`
    : 'Anteile in % der Wochenstunden gesamt. Pro Typ leer lassen, wenn kein Ziel gewünscht. Wird in der Trainingswoche als Soll-Ist-Balken angezeigt.';
}
function saveApiSettings() {
  athleteId = document.getElementById('settingsAthleteId').value.trim();
  apiKey    = document.getElementById('settingsApiKey').value.trim();
  ghToken   = document.getElementById('settingsGhToken').value.trim();
  ghRepo    = document.getElementById('settingsGhRepo').value.trim();
  localStorage.setItem('icu_athlete_id', athleteId);
  localStorage.setItem('icu_api_key', apiKey);
  localStorage.setItem('gh_token', ghToken);
  localStorage.setItem('gh_repo', ghRepo);

  syncTrainingPlanFromGH();
  syncManualRespirationFromGH();
  syncActivityMetaFromGH();
  syncPlanSessionsFromGH();
  syncHiddenActivitiesFromGH();
  syncHfZonesFromGH();
  syncRestDaysFromGH();
  syncAthleteProfileFromGH();
  loadAll();
  closeSettingsModal();
}

// Plan-Seite: Trainings-Soll (dauerhafte Seite, kein Modal — daher Flash-Bestätigung statt Schließen)
function saveTrainingGoals() {
  const num = id => { const v = parseFloat(document.getElementById(id).value); return isNaN(v) ? null : v; };
  const weekHours = num('settingsGoalWeekHours');
  const byTypePct = {};
  const lf = num('settingsGoalLaufenPct'), rd = num('settingsGoalRadPct'), kr = num('settingsGoalKraftPct'), mo = num('settingsGoalMobilitaetPct');
  if (lf !== null) byTypePct.Laufen = lf;
  if (rd !== null) byTypePct.Rad = rd;
  if (kr !== null) byTypePct.Kraft = kr;
  if (mo !== null) byTypePct['Mobilität'] = mo;
  const byType = {};
  if (weekHours) Object.entries(byTypePct).forEach(([t, pct]) => { byType[t] = Math.round(weekHours * pct / 100 * 10) / 10; });
  const races = readRacesFromForm();
  const plan = { weekHours, byTypePct, byType, races, updatedAt: Date.now() };
  localStorage.setItem('training_plan', JSON.stringify(plan));
  if (ghToken && ghRepo) {
    saveTrainingPlanToGH(plan).catch(e => alert('Speichern bei GitHub fehlgeschlagen: ' + e.message + '\n\nDer Wert ist trotzdem lokal in diesem Browser gespeichert.'));
  }

  renderCockpitWeek();
  renderPhaseTimeline();
  const saved = document.getElementById('trainingGoalSaved');
  if (saved) {
    saved.style.display = 'inline';
    clearTimeout(saved._hideTimer);
    saved._hideTimer = setTimeout(() => { saved.style.display = 'none'; }, 2000);
  }
}

// Einstellungen-Modal: Trainingsfreie Tage — schließt das Modal nach dem Speichern
function saveRestDays() {
  const days = [];
  for (let i = 0; i < 7; i++) if (document.getElementById('restDay'+i).checked) days.push(i);
  const data = { days, updatedAt: Date.now() };
  localStorage.setItem('rest_days', JSON.stringify(data));
  if (ghToken && ghRepo) {
    saveRestDaysToGH(data).catch(e => alert('Speichern bei GitHub fehlgeschlagen: ' + e.message + '\n\nDer Wert ist trotzdem lokal in diesem Browser gespeichert.'));
  }
  renderCockpitWeek();
  closeSettingsModal();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

const CHART_FONT = 'JetBrains Mono';
const CHART_GRID = '#dde2ea';
const CHART_TEXT = '#64748b';
let charts = {};

function init() {
  const scriptSrc = document.querySelector('script[src^="app.js"]')?.src || '';
  const ver = scriptSrc.split('?v=')[1];
  document.getElementById('appVersion').textContent = ver ? `Vers. ${ver}` : '';
  document.getElementById('dateLabel').textContent =
    `KW${getWeek(new Date())} · ` + new Date().toLocaleDateString('de-DE', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  setupNav();
  applyHfZonesToInputs();
  applyAthleteProfileToInputs();
  updateZones();
  populatePlanForm();
  syncTrainingPlanFromGH();
  syncManualRespirationFromGH();
  syncActivityMetaFromGH();
  syncPlanSessionsFromGH();
  syncHiddenActivitiesFromGH();
  syncHfZonesFromGH();
  syncRestDaysFromGH();
  syncAthleteProfileFromGH();
  loadAll();
}

(function(){
  if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');
  document.addEventListener('DOMContentLoaded', updateThemeIcon);
})();
const ICON_SUN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M4.4 4.4l1.7 1.7M17.9 17.9l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.4 19.6l1.7-1.7M17.9 6.1l1.7-1.7"/></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/></svg>';
function updateThemeIcon() {
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.innerHTML = document.body.classList.contains('dark') ? ICON_MOON : ICON_SUN;
}
function toggleTheme() {
  const dark = document.body.classList.toggle('dark');
  localStorage.setItem('theme', dark ? 'dark' : 'light');
  updateThemeIcon();
}

function goToCockpit() {
  document.querySelector('.nav-item[data-section="cockpit"]')?.click();
}

function setupNav() {
  const lastSection = sessionStorage.getItem('tb_active_section');

  // Immer zuerst auf Cockpit zurücksetzen
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelector('.nav-item[data-section="cockpit"]').classList.add('active');
  document.getElementById('section-cockpit').classList.add('active');
  document.getElementById('pageTitle').textContent = 'Dashboard';

  if (lastSection) {
    const savedItem = document.querySelector(`.nav-item[data-section="${lastSection}"]`);
    if (savedItem) {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      savedItem.classList.add('active');
      document.getElementById(`section-${lastSection}`)?.classList.add('active');
      document.getElementById('pageTitle').textContent = savedItem.textContent.trim();
    }
  }

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const sec = item.dataset.section;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      document.getElementById(`section-${sec}`).classList.add('active');
      document.getElementById('pageTitle').textContent = item.textContent.trim();
      sessionStorage.setItem('tb_active_section', sec);
    });
  });
}

// ─── Data Loading ─────────────────────────────────────────────────────────────

const FAST_LOAD_DAYS = 100; // deckt alle Zeitraum-Optionen bis 90 Tage mit Puffer ab, für schnellen ersten Render
const FULL_LOAD_DAYS = 400; // deckt die größte wählbare Kachel-Spanne ("Alle" = 365) mit Puffer ab

function applyIcuData(wellnessFull, activitiesFull, eventsFull) {
  _wellnessFull = wellnessFull;
  _activitiesFull = filterHiddenActivities(activitiesFull); // ausgeblendete Aktivitäten (nur lokal, intervals.icu bleibt unberührt)
  if (eventsFull) _icuEventsFull = eventsFull;
  // CTL/ATL/TSB aus Wellness-Daten extrahieren (wie im Original-Backend)
  _fitnessFull = wellnessFull
    .filter(d => d.ctl != null || d.atl != null)
    .map(d => ({
      date: d.id,
      ctl: parseFloat((d.ctl || 0).toFixed(1)),
      atl: parseFloat((d.atl || 0).toFixed(1)),
      tsb: parseFloat(((d.ctl || 0) - (d.atl || 0)).toFixed(1)),
    }));
}

async function loadAll() {
  applyStoredRanges();

  try {
    const [wellnessFull, activitiesFull, eventsFull] = await Promise.all([
      icuFetch(`/athlete/${athleteId}/wellness?oldest=${fmtDate(daysAgo(FAST_LOAD_DAYS))}`),
      icuFetch(`/athlete/${athleteId}/activities?oldest=${fmtDate(daysAgo(FAST_LOAD_DAYS))}`),
      // geplante Events (WORKOUT) aus Intervals.icu — inkl. dort/via Garmin direkt angelegter, nicht nur der von TrainIQ gepushten
      icuFetch(`/athlete/${athleteId}/events?oldest=${fmtDate(daysAgo(7))}&newest=${fmtDate(daysAgo(-60))}&category=WORKOUT`),
    ]);

    applyIcuData(wellnessFull, activitiesFull, eventsFull);
    setStatus(true);
    renderCockpitStatus(wellnessFull, _fitnessFull, _activitiesFull);
    renderFromCache();

    loadFullRangeInBackground();
    if (ghToken && ghRepo) {
      if (_notes.length === 0) loadNotesInBackground();
      else loadOlderNotesInBackground();
    }
  } catch(err) {
    console.error(err);
    setStatus(false);
  }
}

// Notizen werden einzeln nacheinander von GitHub geladen (siehe loadNotes) — bei vielen
// gespeicherten Notizen kann das mehrere Sekunden dauern. Blockiert deshalb nicht mehr den
// ersten Render, sondern lädt im Hintergrund nach und aktualisiert danach nur die
// notizabhängigen Teile (Mood-Kachel, Journal-Einträge in der Aktivitäten-Tabelle).
async function loadNotesInBackground() {
  try {
    _notes = await loadNotes();
    refreshCockpitMoodTile();
    renderFromCache();
    loadOlderNotesInBackground();
  } catch(err) {
    console.error('Notizen-Hintergrund-Nachladung fehlgeschlagen:', err);
  }
}

// Lädt nach dem schnellen ersten Render den vollen Zeitraum nach (für "Alle"/365-Ansicht und Jahres-Historie).
// Blockiert den ersten Render nicht; scheitert lautlos (Konsole), da die App mit den bereits geladenen
// FAST_LOAD_DAYS-Daten voll funktionsfähig bleibt.
async function loadFullRangeInBackground() {
  try {
    const [wellnessFull, activitiesFull] = await Promise.all([
      icuFetch(`/athlete/${athleteId}/wellness?oldest=${fmtDate(daysAgo(FULL_LOAD_DAYS))}`),
      icuFetch(`/athlete/${athleteId}/activities?oldest=${fmtDate(daysAgo(FULL_LOAD_DAYS))}`),
    ]);
    applyIcuData(wellnessFull, activitiesFull, null);
    renderCockpitStatus(wellnessFull, _fitnessFull, _activitiesFull);
    renderFromCache();
  } catch(err) {
    console.error('Hintergrund-Nachladung (voller Zeitraum) fehlgeschlagen:', err);
  }
}

function setStatus(ok) {
  document.getElementById('statusDot').className = 'status-dot ' + (ok ? 'live' : 'error');
  document.getElementById('statusText').textContent = ok ? 'Verbunden' : 'Fehler';
}

// ─── Cockpit ─────────────────────────────────────────────────────────────────

const TYPE_COLORS = {Laufen:'#3b82f6',Rad:'#10b981',Kraft:'#8b5cf6',Atmung:'#06b6d4',Mobilität:'#f59e0b'};
// Plan-Typen = Trainingsarten + Sonderfälle (kein echtes Training). Eigene Farben für die Sonderfälle.
// Wettkampf-Gold wird für die automatischen Renn-Marker im Wochenkalender wiederverwendet (siehe buildWeekCalendar) —
// bewusst NICHT Teil von PLAN_TYPES: Rennen werden ausschließlich über die Renn-Liste auf der Plan-Seite angelegt.
const PLAN_EXTRA_COLORS = {Ruhetag:'#94a3b8', Krankheit:'#dc2626', Wettkampf:'#eab308'};
// Atmung ist bei echten (abgeschlossenen) Aktivitäten weiter erkennbar/eingefärbt (TYPE_COLORS),
// aber als Plan-Typ zum manuellen Anlegen nicht mehr wählbar.
const PLAN_TYPES = [...Object.keys(TYPE_COLORS).filter(t => t !== 'Atmung'), 'Ruhetag', 'Krankheit'];
function planTypeColor(t) { return TYPE_COLORS[t] || PLAN_EXTRA_COLORS[t] || '#94a3b8'; }

// Automatisch berechneter Trainingsreiz (Pace bei Laufen, Watt bei Rad, sonst Load) —
// Standardwert für das editierbare "Training Effect"-Feld, solange keine manuelle Eingabe vorliegt.
function computeDefaultTrainingEffect(act, type) {
  if (type === 'Laufen' && act.average_speed) {
    const secPerKm = 1000 / act.average_speed;
    const m = Math.floor(secPerKm/60), s = Math.round(secPerKm%60);
    return `${m}:${String(s).padStart(2,'0')}/km`;
  }
  const watts = act.icu_weighted_avg_watts || act.icu_average_watts || act.average_watts;
  if (type === 'Rad' && watts) return `${Math.round(watts)} W`;
  if (act.icu_training_load) return `Load ${Math.round(act.icu_training_load)}`;
  return '';
}

// Trainingseffect-Kategorien (statt reiner Pace-/Watt-Zahl) — grobe Einstufung der Trainingsart,
// orientiert an gängiger Laufterminologie (Daniels/Uphill Athlete gemischt).
const EFFECT_CATEGORIES = ['Erholung','Basis','Pace','Tempo','Schwelle','VO2max','Anaerob','Sprint'];

// Ordnet anhand der Ø-Herzfrequenz und der bestehenden HF-Zonen (aet/ant/maxHr, siehe getHfZones)
// automatisch eine der 8 Kategorien zu — reine Heuristik, im Modal jederzeit überschreibbar.
// "Sprint" wird nie automatisch vorgeschlagen: bei kurzen Maximaleinsätzen bleibt die Ø-HF durch
// die HF-Trägheit zu niedrig, um verlässlich zu sein.
function suggestEffectCategory(act, type) {
  if (type !== 'Laufen' && type !== 'Rad') return '';
  const hr = act.average_heartrate;
  const { aet, ant, maxHr } = getHfZones();
  if (!hr || !aet || !ant) return '';
  const vo2Top = (ant + (maxHr || ant * 1.2)) / 2;
  if (hr < aet * 0.80) return 'Erholung';
  if (hr < aet) return 'Basis';
  if (hr < aet + 0.4 * (ant - aet)) return 'Pace';
  if (hr < ant * 0.97) return 'Tempo';
  if (hr < ant * 1.03) return 'Schwelle';
  if (hr < vo2Top) return 'VO2max';
  return 'Anaerob';
}

// Kategorien, für die ein Efficiency-Factor-Vergleich sportlich sinnvoll ist (aerobe Einheiten,
// bei denen Pace/Watt und HF weitgehend linear zusammenhängen). Bei harten Intervallen (Schwelle
// aufwärts) verzerrt die Anstrengung den Wert, deshalb dort keine Berechnung.
const EF_CATEGORIES = ['Erholung','Basis','Pace'];

// Efficiency Factor: Pace bzw. Leistung pro Herzschlag — steigt der Wert bei vergleichbarer
// Kategorie über die Zeit, deutet das auf eine verbesserte aerobe Fitness hin (klassische
// Endurance-Coaching-Kennzahl, z.B. "Watts per beat" beim Radfahren).
function computeEfficiencyFactor(act, type) {
  if (type !== 'Laufen' && type !== 'Rad') return null;
  const hr = act.average_heartrate;
  if (!hr || !act.moving_time || act.moving_time < 20 * 60) return null;
  const meta = getActivityMetaFor(act.id);
  const category = meta.effectCategory || suggestEffectCategory(act, type);
  if (!EF_CATEGORIES.includes(category)) return null;
  if (type === 'Laufen') {
    if (!act.average_speed) return null;
    return (act.average_speed * 60) / hr;
  }
  const watts = act.icu_weighted_avg_watts || act.icu_average_watts || act.average_watts;
  if (!watts) return null;
  return watts / hr;
}

// Vergleicht den Efficiency Factor der Aktivität mit dem Median der letzten vergleichbaren
// Einheiten (gleicher Typ + Kategorie, max. 120 Tage zurück) — gibt null zurück, wenn weder der
// Wert selbst noch genug Vergleichseinheiten vorhanden sind.
function computeEfficiencyTrend(act, type) {
  const value = computeEfficiencyFactor(act, type);
  if (value == null) return null;
  const category = getActivityMetaFor(act.id).effectCategory || suggestEffectCategory(act, type);
  const cutoff = new Date(act.start_date_local); cutoff.setDate(cutoff.getDate() - 120);
  const compare = (_activitiesFull || [])
    .filter(a => a.id !== act.id && normalizeType(a.type) === type && new Date(a.start_date_local) >= cutoff && new Date(a.start_date_local) < new Date(act.start_date_local))
    .filter(a => (getActivityMetaFor(a.id).effectCategory || suggestEffectCategory(a, type)) === category)
    .map(a => computeEfficiencyFactor(a, type))
    .filter(v => v != null)
    .slice(-10);
  if (!compare.length) return { value, trendPct: 0, label: '→', n: 0 };
  const sorted = [...compare].sort((a,b) => a-b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid]) / 2;
  const trendPct = Math.round(((value - median) / median) * 100);
  const label = trendPct > 2 ? '↑' : trendPct < -2 ? '↓' : '→';
  return { value, trendPct, label, n: compare.length };
}

function buildWeekCalendar(weekStart, weekActs) {
  const dayNames = ['MO','DI','MI','DO','FR','SA','SO'];
  const todayStr = fmtDate(new Date());
  const days = Array.from({length:7}, (_,i) => { const d=new Date(weekStart); d.setDate(weekStart.getDate()+i); return d; });

  const byDay = days.map(d => {
    const dStr = fmtDate(d);
    const acts = weekActs.filter(a => fmtDate(new Date(a.start_date_local)) === dStr)
      .sort((a,b) => new Date(a.start_date_local) - new Date(b.start_date_local));
    return { date: d, dStr, isToday: dStr === todayStr, acts };
  });

  // Eine Aktivität als abgerundeter, klickbarer Balken (öffnet das Aktivitäten-Fenster)
  // Zeigt bewusst nur Aktivität, Training Effect, Distanz, Dauer und Ø HF — Beschreibung/Name
  // und RPE stehen stattdessen im Detail-Fenster (openActivityModal).
  function activityBar(act) {
    const type = normalizeType(act.type);
    const color = TYPE_COLORS[type] || '#94a3b8';
    const km = act.distance ? (act.distance/1000).toFixed(1)+' km' : '';
    const dur = act.moving_time ? formatDur(act.moving_time) : '';
    const hr = act.average_heartrate ? Math.round(act.average_heartrate)+' bpm' : '';
    const meta = getActivityMetaFor(act.id);
    const trainingEffect = meta.trainingEffect || computeDefaultTrainingEffect(act, type);
    const stats = [km, dur, hr].filter(Boolean).join(' · ');
    return `<div class="wc-bar" style="background:${color}1a;--wc-c:${color}" onclick="openActivityModal('${act.id}')" title="Details &amp; Bewertung öffnen">
      <div class="wc-bar-top"><span class="wc-bar-type">${type.toUpperCase()}</span>${trainingEffect ? `<span class="wc-bar-te">${escHtml(trainingEffect)}</span>` : ''}</div>
      ${stats ? `<div class="wc-bar-sub">${stats}</div>` : ''}
    </div>`;
  }

  // Geplante Einheit als „Geister-Balken" (gestrichelt). done = es gab an dem Tag eine echte Einheit gleichen Typs.
  // ICU-Herkunft (direkt in Intervals.icu oder via Garmin geplant, nicht durch TrainIQ) ist schreibgeschützt.
  function planBar(dayStr, s, done) {
    const color = planTypeColor(s.type);
    const readOnly = s.source === 'icu';
    const hasPhases = s.phases && s.phases.length;
    const sub = [s.min ? s.min + ' min' : '', hasPhases ? `${s.phases.length} Phasen` : '', done ? 'erledigt' : 'geplant'].filter(Boolean).join(' · ');
    // ICU-eigene Einträge sind nicht editierbar (kein lokales Session-Objekt), aber löschbar
    const click = readOnly
      ? `onclick="event.stopPropagation();deleteIcuOnlyEvent(${s.icuEventId})"`
      : `onclick="event.stopPropagation();openPlanModal('${dayStr}','${s.id}')"`;
    const tag = done ? '✓' : (readOnly ? 'ICU' : 'GEPLANT');
    const title = readOnly ? 'Aus Intervals.icu — klicken zum Löschen'
      : hasPhases ? s.phases.map(p => `${p.label}: ${p.min}min${p.zone ? ' ('+p.zone+')' : ''}`).join(' → ')
      : 'Geplante Einheit bearbeiten';
    return `<div class="wc-planbar${done?' done':''}" style="--wc-c:${color}" ${click} title="${title}">
      <div class="wc-bar-top"><span class="wc-planbar-type">${s.type.toUpperCase()}</span><span class="wc-planbar-tag">${tag}</span></div>
      <div class="wc-bar-sub">${sub}</div>
    </div>`;
  }

  // Wettkämpfe (A/B/C, Plan-Seite) — automatischer Marker am jeweiligen Renntag, kein plan_session-Eintrag nötig.
  function raceBar(r) {
    const color = PLAN_EXTRA_COLORS.Wettkampf;
    return `<div class="wc-planbar wc-racebar" style="--wc-c:${color}" title="${escHtml(r.name)} (${r.priority}-Rennen)">
      <div class="wc-bar-top"><span class="wc-planbar-type">${escHtml(r.name).toUpperCase()}</span><span class="wc-planbar-tag">${r.priority}</span></div>
    </div>`;
  }

  // Geplante Einheit vergangener Tage, die nicht ausgeführt wurde, verschwindet ab dem Folgetag
  // aus dem Kalender (nur Anzeige — ICU-Events/plan_sessions bleiben in den Rohdaten erhalten).
  function visiblePlanSessionsFor(d) {
    const actualTypes = new Set(d.acts.map(a => normalizeType(a.type)));
    return getPlanSessionsFor(d.dStr).filter(s => d.dStr >= todayStr || actualTypes.has(s.type));
  }

  const head = days.map((d,i) => {
    const today = byDay[i].isToday;
    return `<div class="week-cal-head-cell${today?' today':''}">${dayNames[i]} ${d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}</div>`;
  }).join('') + `<div class="week-cal-head-cell week-cal-head-summary">DIESE WOCHE</div>`;

  // Fest eingestellte trainingsfreie Wochentage: nur heute/zukünftig, nur wenn der Tag sonst leer wäre
  // (echte Aktivität oder manueller Plan-Eintrag haben immer Vorrang) — reine Anzeige-Regel, kein Datenobjekt.
  const restDays = getRestDays();
  function isFixedRestDay(d) {
    const weekdayIdx = (d.date.getDay() + 6) % 7; // JS: 0=So…6=Sa → 0=Mo…6=So
    return d.dStr >= todayStr && restDays.includes(weekdayIdx);
  }

  const races = (getTrainingPlan().races || []).filter(r => r.name && r.date);

  // Pro Tag eine Spalte: echte Aktivitäten + geplante Einheiten (Geister-Balken) + Wettkämpfe + „+ planen" + Tagessumme
  const dayCols = byDay.map(d => {
    const dayMin = Math.round(d.acts.reduce((s,a) => s+(a.moving_time||0), 0) / 60);
    const actualTypes = new Set(d.acts.map(a => normalizeType(a.type)));
    const planned = visiblePlanSessionsFor(d);
    const dayRaces = races.filter(r => r.date === d.dStr);
    const actualBars = d.acts.map(activityBar).join('');
    const planBars = planned.map(s => planBar(d.dStr, s, actualTypes.has(s.type))).join('');
    const raceBars = dayRaces.map(raceBar).join('');
    const isEmpty = !d.acts.length && !planned.length && !dayRaces.length;
    const empty = isEmpty ? (isFixedRestDay(d) ? `<div class="wc-restday" style="--wc-c:${PLAN_EXTRA_COLORS.Ruhetag}">Trainingsfrei</div>` : `<div class="wc-empty">–</div>`) : '';
    // „+ planen" nur für heute & zukünftige Tage
    const addBtn = d.dStr >= todayStr ? `<button class="wc-add" onclick="event.stopPropagation();openPlanModal('${d.dStr}')" title="Einheit planen">+ planen</button>` : '';
    const total = dayMin > 0 ? `<div class="wc-day-total">${dayMin} min</div>` : '';
    return `<div class="week-cal-daycol${d.isToday?' today':''}"><div class="wc-daycol-scroll">${raceBars}${actualBars}${planBars}${empty}${addBtn}</div>${total}</div>`;
  }).join('');

  const plan = getTrainingPlan();
  const totalH = weekActs.reduce((s,a) => s+(a.moving_time||0), 0) / 3600;
  const totalVal = plan.weekHours
    ? `${totalH.toFixed(1)}<span class="week-cal-summary-unit">/${plan.weekHours} h</span>`
    : `${totalH.toFixed(1)}<span class="week-cal-summary-unit"> h</span>`;
  const typeTotals = {};
  Object.keys(TYPE_COLORS).filter(t => t !== 'Atmung').forEach(t => { typeTotals[t] = 0; });
  weekActs.forEach(a => { const t = normalizeType(a.type); if (t === 'Atmung') return; typeTotals[t] = (typeTotals[t]||0) + (a.moving_time||0); });
  // Geplante Minuten pro Typ (Summe über alle 7 Tage) — Marker im selben Balken, keine eigene Anzeige
  const plannedMinByType = {};
  byDay.forEach(d => visiblePlanSessionsFor(d).forEach(s => { if (s.min) plannedMinByType[s.type] = (plannedMinByType[s.type]||0) + s.min; }));
  const maxTypeT = Math.max(1, ...Object.values(typeTotals));
  const typeHBars = Object.entries(typeTotals).map(([t,s]) => {
    const color = TYPE_COLORS[t] || '#94a3b8';
    const targetH = plan.byType?.[t];
    const istH = (s/3600).toFixed(1);
    const pct = targetH ? Math.min(100, Math.round(s/(targetH*3600)*100)) : Math.round(s/maxTypeT*100);
    const label = targetH ? `${istH}/${targetH}h` : `${istH}h`;
    const title = targetH ? `${t}: ${formatDur(s)} von ${targetH} h Soll` : `${t}: ${formatDur(s)}`;
    // dünner Marker: wo läge der Balken, wenn alle geplanten Minuten dieses Typs absolviert wären
    const plannedMin = plannedMinByType[t];
    const plannedPct = plannedMin ? Math.min(100, Math.round((s/60 + plannedMin) / (targetH ? targetH*60 : maxTypeT/60) * 100)) : null;
    const marker = plannedPct != null ? `<div class="week-cal-hbar-marker" style="left:${plannedPct}%" title="Geplant: +${plannedMin} min"></div>` : '';
    return `<div class="week-cal-hbar-row" title="${title}">
      <span class="week-cal-hbar-label" style="color:${color}">${t}</span>
      <div class="week-cal-hbar-bar-wrap">
        <div class="week-cal-hbar-track" style="background:${color}30">
          <div class="week-cal-hbar-fill" style="width:${pct}%;background:${color}"></div>
          ${marker}
        </div>
        <div class="week-cal-hbar-hours">${label}</div>
      </div>
    </div>`;
  }).join('');
  const summaryCol = `<div class="week-cal-daycol week-cal-summary-col">
      <div class="week-cal-hbars">${typeHBars}</div>
    </div>`;

  return { html: head + dayCols + summaryCol, totalHtml: totalVal };
}

function cockpitWeekStart(offset) {
  const now = new Date();
  const ws = new Date(now);
  ws.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1) + offset*7);
  ws.setHours(0,0,0,0);
  return ws;
}
function weekActivities(weekStart) {
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate()+7);
  return _cockpitActivitiesFull.filter(a => { const d = new Date(a.start_date_local); return d >= weekStart && d < weekEnd; });
}
function weekRangeLabel(weekStart) {
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate()+7);
  return `KW${getWeek(weekStart)} · ${weekStart.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})} – ${new Date(weekEnd-1).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}`;
}

function renderCockpitWeek() {
  // aktuelle (gewählte) Woche
  const weekStart = cockpitWeekStart(cockpitWeekOffset);
  const weekActs = weekActivities(weekStart);
  document.getElementById('cockpitWeekLabel').textContent = weekRangeLabel(weekStart);
  const built = buildWeekCalendar(weekStart, weekActs);
  document.getElementById('cockpitWeekCal').innerHTML = built.html;
  document.getElementById('cockpitWeekTotal').innerHTML = built.totalHtml;

  // Vorschau: die darauffolgende Woche
  const nextStart = cockpitWeekStart(cockpitWeekOffset + 1);
  const nextEl = document.getElementById('cockpitWeekCalNext');
  if (nextEl) {
    nextEl.innerHTML = buildWeekCalendar(nextStart, weekActivities(nextStart)).html;
    const nextLabel = document.getElementById('cockpitWeekNextLabel');
    if (nextLabel) nextLabel.textContent = weekRangeLabel(nextStart);
  }

  // „Nächste Woche" ist jetzt immer erlaubt (beliebig weit vorausplanen)
  const nextBtn = document.getElementById('cockpitWeekNextBtn');
  if (nextBtn) nextBtn.disabled = false;
}

function navCockpitWeek(delta) {
  cockpitWeekOffset = delta === 0 ? 0 : cockpitWeekOffset + delta; // vor und zurück beliebig
  renderCockpitWeek();
}

let cockpitWeekOffset = 0;
let _cockpitActivitiesFull = [];

function renderCockpitStatus(wellness, fitness, activitiesFull) {
  _cockpitActivitiesFull = activitiesFull;

  const allW = sortedWellness(wellness).filter(d => d.hrv || d.restingHR);
  const hrvSeries = allW.filter(d => d.hrv);
  const rhfSeries = allW.filter(d => d.restingHR);
  const latest = allW[allW.length-1] || {};
  const latestHRV = hrvSeries[hrvSeries.length-1] || {};
  const latestRHF = rhfSeries[rhfSeries.length-1] || {};
  const latestF = fitness[fitness.length-1] || {};
  const todayHRV = latestHRV.hrv || 0;

  function trendArrow(curr, prev) {
    if (curr == null || prev == null) return '';
    const diff = curr - prev;
    if (Math.abs(diff) < 0.5) return '<span class="trend-kpi-trend flat">→</span>';
    return diff > 0 ? '<span class="trend-kpi-trend up">↑</span>' : '<span class="trend-kpi-trend down">↓</span>';
  }
  const prevF = fitness[fitness.length-8] || null;
  const prevHRV = hrvSeries[hrvSeries.length-8] || null;
  const prevRHF = rhfSeries[rhfSeries.length-8] || null;

  document.getElementById('cockpitHRV').innerHTML =
    (todayHRV ? Math.round(todayHRV) : '—') + ' ' + trendArrow(todayHRV || null, prevHRV?.hrv);
  document.getElementById('cockpitRHF').innerHTML =
    (latestRHF.restingHR || '—') + ' ' + trendArrow(latestRHF.restingHR, prevRHF?.restingHR);
  document.getElementById('cockpitCTL').innerHTML =
    (latestF.ctl ? Math.round(latestF.ctl) : '—') + ' ' + trendArrow(latestF.ctl, prevF?.ctl);
  document.getElementById('cockpitATL').innerHTML =
    (latestF.atl ? Math.round(latestF.atl) : '—') + ' ' + trendArrow(latestF.atl, prevF?.atl);
  document.getElementById('cockpitFormTSB').innerHTML =
    (latestF.tsb != null ? (latestF.tsb > 0 ? '+' : '') + Math.round(latestF.tsb) : '—') + ' ' + trendArrow(latestF.tsb, prevF?.tsb);

  const allWeight = sortedWellness(wellness).filter(d => d.weight != null);
  const latestWeight = allWeight[allWeight.length-1];
  const prevWeight = allWeight[allWeight.length-8] || null;
  document.getElementById('cockpitWeight').innerHTML =
    (latestWeight ? latestWeight.weight.toFixed(1) : '—') + ' ' + trendArrow(latestWeight?.weight, prevWeight?.weight);

  // Konditionstrend: Efficiency Factor der letzten dazu geeigneten (aeroben) Aktivität ggü. Verlauf
  const recentForEF = [...activitiesFull].filter(a => !a._noteOnly)
    .sort((a,b) => new Date(b.start_date_local) - new Date(a.start_date_local));
  let efTile = null;
  for (const a of recentForEF) {
    const t = normalizeType(a.type);
    const trend = computeEfficiencyTrend(a, t);
    if (trend) { efTile = trend; break; }
  }
  document.getElementById('cockpitEF').innerHTML = efTile
    ? efTile.value.toFixed(1) + ' ' + (efTile.n ? `<span class="trend-kpi-trend ${efTile.label==='↑'?'up':efTile.label==='↓'?'down':'flat'}">${efTile.label}</span>` : '')
    : '—';

  refreshCockpitMoodTile();

  // Trainingswoche (navigierbar) als Kalender (zwei Bänder: Ausdauer / Kraft)
  renderCockpitWeek();
}

// ─── Cockpit: Trainingsbelastung & Erholung (Fitness/Fatigue/Form, HRV-Trend, 80/20-Check) ────

function renderCockpitLoad() {
  const days = getRangeDays('cockpitLoad', 14);
  const rangeText = days === 365 ? 'Alle' : `Letzte ${days} Tage`;

  const fitnessSlice = sliceDays(_fitnessFull, days, d => new Date(d.date));
  const wellnessSorted = sortedWellness(_wellnessFull);
  const actSlice = sliceDays(_activitiesFull, days, a => new Date(a.start_date_local));
  const hrvByDate = {};
  const rhfByDate = {};
  wellnessSorted.forEach(d => {
    if (d.hrv) hrvByDate[d.id] = Math.round(d.hrv);
    if (d.restingHR) rhfByDate[d.id] = Math.round(d.restingHR);
  });
  const loadByDate = {};
  actSlice.forEach(a => {
    if (!a.icu_training_load) return;
    const day = fmtDate(new Date(a.start_date_local));
    loadByDate[day] = (loadByDate[day]||0) + a.icu_training_load;
  });
  const respByDate = {};
  actSlice.forEach(a => {
    const resp = respirationRate(a);
    if (resp == null) return;
    respByDate[fmtDate(new Date(a.start_date_local))] = Math.round(resp);
  });
  const fc = makeFitnessChart(fitnessSlice, hrvByDate, rhfByDate, loadByDate, respByDate); fc.options.maintainAspectRatio = false;
  renderChart('fitnessChart', fc);

  const wSlice = sliceDays(wellnessSorted, days, d => new Date(d.id));
  const aS = avg(wSlice.map(d=>d.sleepSecs).filter(Boolean));
  document.getElementById('avgSleep').textContent = aS ? (aS/3600).toFixed(1) : '—';

  const zones = window._zones;
  const zoneEl = document.getElementById('cockpitZoneCheck');
  if (zones && actSlice.length > 0) {
    let easy = 0, hard = 0, total = 0;
    actSlice.forEach(a => {
      if (!a.average_heartrate || !a.moving_time) return;
      total += a.moving_time;
      if (a.average_heartrate <= zones[1].high) easy += a.moving_time;
      else if (a.average_heartrate >= zones[3].low) hard += a.moving_time;
    });
    const ep = total ? Math.round(easy/total*100) : 0;
    const hp = total ? Math.round(hard/total*100) : 0;
    const ok = ep >= 70;
    zoneEl.innerHTML = `
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:12px;color:#10b981;font-weight:600">Zone 1&2 · Locker</span><span style="font-size:12px;font-weight:600">${ep}%</span></div>
        <div style="background:#e2e8f0;border-radius:4px;height:8px"><div style="background:#10b981;width:${ep}%;height:8px;border-radius:4px"></div></div>
      </div>
      <div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:12px;color:#ef4444;font-weight:600">Zone 4 · Hart</span><span style="font-size:12px;font-weight:600">${hp}%</span></div>
        <div style="background:#e2e8f0;border-radius:4px;height:8px"><div style="background:#ef4444;width:${hp}%;height:8px;border-radius:4px"></div></div>
      </div>
      <div style="font-size:12px;padding:8px;border-radius:6px;background:${ok?'rgba(16,185,129,0.1)':'rgba(245,158,11,0.1)'};color:${ok?'#10b981':'#d97706'}">
        ${ok ? `✓ Gute 80/20-Verteilung (${rangeText.toLowerCase()})` : '⚠ Zu wenig lockeres Training – mehr Zone 1 & 2'}
      </div>`;
  } else {
    zoneEl.innerHTML = '<div class="loading">Keine Daten</div>';
  }
}

// ─── Übersicht ────────────────────────────────────────────────────────────────

function renderOverviewGroup() {
  document.getElementById('ghSetupBanner').style.display = (ghToken && ghRepo) ? 'none' : 'block';

  const days = getRangeDays('overview', 14);

  const activities = sliceDays(_activitiesFull, days, a => new Date(a.start_date_local));
  const journalByDate = journalByDateMap();

  const activityDays = new Set(activities.map(a => fmtDate(new Date(a.start_date_local))));
  const from = daysAgo(days);
  const noteOnlyEntries = Object.keys(journalByDate)
    .filter(day => !activityDays.has(day) && new Date(day) >= from)
    .map(day => ({ id: 'note-' + day, _noteOnly: true, start_date_local: day + 'T12:00:00' }));
  const merged = [...activities, ...noteOnlyEntries]
    .sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local));

  // Angezeigte (im Zeitraum) / Gesamtzahl aller geladenen Aktivitäten
  document.getElementById('journalCount').textContent = `${activities.length} / ${_activitiesFull.length} Aktivitäten`;
  renderActivityTable(merged,'allActivities',null,journalByDate);

  const mix = {};
  Object.keys(TYPE_COLORS).filter(t => t !== 'Atmung').forEach(t => { mix[t] = 0; });
  activities.forEach(a => { const t = normalizeType(a.type); if (t === 'Atmung') return; mix[t] = (mix[t]||0) + (a.moving_time||0); });
  const tot = Object.values(mix).reduce((s,v) => s+v, 0);
  document.getElementById('activitiesMix').innerHTML = Object.entries(mix).map(([t,s]) => {
    const p = tot ? Math.round(s/tot*100) : 0;
    return `<div class="mix-item"><div class="mix-label" style="color:${TYPE_COLORS[t]||'#94a3b8'};font-size:12px;font-weight:600">${t}</div><div class="mix-bar-wrap"><div class="mix-bar" style="width:${p}%;background:${TYPE_COLORS[t]||'#94a3b8'}"></div></div><span class="mix-val">${p}%</span><span class="mix-time">${formatDur(s)}</span></div>`;
  }).join('');
}

async function refreshTagesjournal() {
  if (ghToken && ghRepo) _notes = await loadNotes();
  await loadAll();
}

function openHistoryModal() {
  const byYear = {};
  _activitiesFull.forEach(a => {
    const year = new Date(a.start_date_local).getFullYear();
    const type = normalizeType(a.type);
    if (!byYear[year]) byYear[year] = {};
    if (!byYear[year][type]) byYear[year][type] = { count: 0, seconds: 0, meters: 0 };
    byYear[year][type].count++;
    byYear[year][type].seconds += a.moving_time || 0;
    byYear[year][type].meters += a.distance || 0;
  });

  const years = Object.keys(byYear).sort((a,b) => b - a);
  document.getElementById('historyContent').innerHTML = years.length === 0
    ? '<div class="loading">Keine Daten</div>'
    : years.map(year => {
        const types = byYear[year];
        const yearSeconds = Object.values(types).reduce((s,t) => s + t.seconds, 0);
        const yearMeters = Object.values(types).reduce((s,t) => s + t.meters, 0);
        const rows = Object.entries(types).sort((a,b) => b[1].seconds - a[1].seconds).map(([type, t]) => `
          <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--bg3)">
            <span class="tag" style="background:${TYPE_COLORS[type]||'#94a3b8'}20;color:${TYPE_COLORS[type]||'#94a3b8'};min-width:80px;text-align:center">${type}</span>
            <span class="mono" style="font-size:12px;color:var(--text2)">${t.count} ×</span>
            <span class="mono" style="font-size:12px;margin-left:auto">${formatDur(t.seconds)}</span>
            <span class="mono" style="font-size:12px;min-width:70px;text-align:right">${t.meters?(t.meters/1000).toFixed(0)+' km':'—'}</span>
          </div>`).join('');
        return `<div style="margin-bottom:20px">
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px">
            <span style="font-size:15px;font-weight:700">${year}</span>
            <span class="mono" style="font-size:12px;color:var(--text2)">${formatDur(yearSeconds)} · ${(yearMeters/1000).toFixed(0)} km gesamt</span>
          </div>
          ${rows}
        </div>`;
      }).join('');

  document.getElementById('historyModal').style.display = 'flex';
}

function closeHistoryModal() {
  document.getElementById('historyModal').style.display = 'none';
}

// ─── HF-Zonen ────────────────────────────────────────────────────────────────

function updateZones() {
  const aet = parseInt(document.getElementById('aet')?.value)||148;
  const ant = parseInt(document.getElementById('ant')?.value)||168;
  const maxHr = parseInt(document.getElementById('maxHr')?.value) || null;
  const zones = [
    {low:Math.round(aet*0.80),high:Math.round(aet*0.90),name:'Zone 1',char:'Sehr leicht · aerobe Basis',color:'#60a5fa'},
    {low:Math.round(aet*0.90),high:aet,                  name:'Zone 2',char:'Locker · aerobe Kapazität',color:'#34d399'},
    {low:aet,                  high:ant,                  name:'Zone 3',char:'Mittel · Grauzone',color:'#fbbf24'},
    {low:ant,                  high:maxHr ?? '—',         name:'Zone 4',char:'Hart · anaerob',color:'#f87171'},
  ];
  const tbody = document.getElementById('zonesBody');
  if (!tbody) return;
  tbody.innerHTML = zones.map(z=>`<tr><td><span class="zone-dot" style="background:${z.color}"></span><span class="zone-name">${z.name}</span></td><td class="zone-range">${z.low} – ${z.high} bpm</td><td class="zone-desc">${z.char}</td></tr>`).join('');
  window._zones = zones;

  const gapEl = document.getElementById('aetAntGapCheck');
  if (gapEl && ant > 0) {
    const gapPct = Math.round((ant - aet) / ant * 100);
    gapEl.style.display = 'flex';
    if (gapPct > 10) {
      gapEl.className = 'recommendation warn';
      gapEl.innerHTML = `<div class="rec-icon">⚠</div><div><div class="rec-title">10%-Test: ${gapPct}% Abstand zwischen AeT und AnT</div><div class="rec-text">Ziel sind ~10%. Ein größerer Abstand ist ein Zeichen für eine unterentwickelte aerobe Basis ("Aerobic Deficiency") — geduldiges Training an/knapp unter der AeT schließt die Lücke über Zeit.</div></div>`;
    } else {
      gapEl.className = 'recommendation good';
      gapEl.innerHTML = `<div class="rec-icon">✓</div><div><div class="rec-title">10%-Test bestanden: ${gapPct}% Abstand zwischen AeT und AnT</div><div class="rec-text">Im gesunden Bereich (~10%) — gute aerobe Basis im Verhältnis zur anaeroben Schwelle.</div></div>`;
    }
  }
}

function renderZonesGroup() {
  const days = getRangeDays('zones', 14);
  const activities = sliceDays(_activitiesFull, days, a => new Date(a.start_date_local));

  updateZones();
  const zones = window._zones; if (!zones) return;
  const dist=[0,0,0,0]; let total=0;
  activities.forEach(a=>{
    if (!a.average_heartrate||!a.moving_time) return;
    const hr=a.average_heartrate,t=a.moving_time; total+=t;
    if(hr<=zones[0].high)dist[0]+=t;
    else if(hr<=zones[1].high)dist[1]+=t;
    else if(hr<=zones[2].high)dist[2]+=t;
    else dist[3]+=t;
  });
  const pcts = dist.map(d=>total?Math.round(d/total*100):0);
  const zn=['Zone 1','Zone 2','Zone 3','Zone 4'],zs=['Basis','Aerob','Grauzone','Intensiv'],zc=['#60a5fa','#34d399','#fbbf24','#f87171'];
  document.getElementById('distBars').innerHTML = pcts.map((p,i)=>`<div class="dist-item"><div class="dist-label"><div class="dist-zone" style="color:${zc[i]}">${zn[i]}</div><div class="dist-sub">${zs[i]}</div></div><div class="dist-bar-wrap"><div class="dist-bar" style="width:${p}%;background:${zc[i]}"></div></div><span class="dist-val">${p}%</span><span class="dist-time">${formatDur(dist[i])}</span></div>`).join('');

  const recEl = document.getElementById('zoneRecommendation');
  if (pcts[2]>30) { recEl.style.display='flex'; recEl.className='recommendation warn'; recEl.innerHTML=`<div class="rec-icon">⚠</div><div><div class="rec-title">Zu viel Zone 3 — klassische „Grauzone"</div><div class="rec-text">${pcts[2]}% deines Trainings liegt in Zone 3. Mehr Zone 1 & 2 stärkt die kardiovaskuläre Basis.</div></div>`; }
  else if (pcts[0]+pcts[1]>=70) { recEl.style.display='flex'; recEl.className='recommendation good'; recEl.innerHTML=`<div class="rec-icon">✓</div><div><div class="rec-title">Gute Zonenverteilung</div><div class="rec-text">${pcts[0]+pcts[1]}% in Zone 1 & 2. Ideal für die aerobe Basis.</div></div>`; }
  else { recEl.style.display='none'; }

  renderZoneTrend(activities);
}

function renderZoneTrend(activities) {
  const zones = window._zones; if (!zones) return;
  const weeks={};
  activities.forEach(a=>{
    if (!a.average_heartrate||!a.moving_time) return;
    const d=new Date(a.start_date_local),kw=`KW${getWeek(d)}`;
    if(!weeks[kw])weeks[kw]=[0,0,0,0];
    const hr=a.average_heartrate,t=a.moving_time;
    if(hr<=zones[0].high)weeks[kw][0]+=t;
    else if(hr<=zones[1].high)weeks[kw][1]+=t;
    else if(hr<=zones[2].high)weeks[kw][2]+=t;
    else weeks[kw][3]+=t;
  });
  const labels=Object.keys(weeks);
  const zc=['#60a5fa','#34d399','#fbbf24','#f87171'],zn=['Zone 1','Zone 2','Zone 3','Zone 4'];
  renderChart('zoneTrendChart',{type:'bar',data:{labels,datasets:zc.map((c,i)=>({label:zn[i],data:labels.map(kw=>{const t=weeks[kw].reduce((s,v)=>s+v,0);return t?Math.round(weeks[kw][i]/t*100):0;}),backgroundColor:c,stack:'z'}))},options:{plugins:{legend:{labels:{font:{family:CHART_FONT,size:11},boxWidth:10,color:CHART_TEXT}}},scales:{x:{stacked:true,grid:{display:false},ticks:{font:{family:CHART_FONT,size:10},color:CHART_TEXT}},y:{stacked:true,max:100,grid:{color:CHART_GRID},ticks:{font:{family:CHART_FONT,size:10},color:CHART_TEXT,callback:v=>v+'%'}}}}});
}

// ─── Fitness ─────────────────────────────────────────────────────────────────

// ─── Wellness ────────────────────────────────────────────────────────────────

function renderWellnessGroup() {
  const days = getRangeDays('wellness', 14);
  const wellness = sliceDays(_wellnessFull, days, d => new Date(d.id));

  const sorted=sortedWellness(wellness);
  const labels=sorted.map(d=>fmtAxisDate(d.id));
  renderChart('wellnessChart',{type:'line',data:{labels,datasets:[
    {label:'HRV (ms)',data:sorted.map(d=>d.hrv?Math.round(d.hrv):null),borderColor:'#10b981',tension:0.4,borderWidth:2,pointRadius:2,yAxisID:'y'},
    {label:'Ruhepuls',data:sorted.map(d=>d.restingHR||null),borderColor:'#3b82f6',tension:0.4,borderWidth:2,pointRadius:2,yAxisID:'y1'},
  ]},options:{maintainAspectRatio:false,layout:{padding:{top:8,bottom:4}},interaction:crosshairInteraction(),plugins:{legend:{labels:{font:{family:CHART_FONT,size:11},color:CHART_TEXT}}},scales:{x:{grid:{color:CHART_GRID},ticks:{font:{family:CHART_FONT,size:10},color:CHART_TEXT,maxTicksLimit:8}},y:{position:'left',grace:'10%',grid:{color:CHART_GRID},ticks:{font:{family:CHART_FONT,size:10},color:'#10b981'}},y1:{position:'right',grace:'10%',grid:{drawOnChartArea:false},ticks:{font:{family:CHART_FONT,size:10},color:'#3b82f6'}}}},plugins:[hoverCrosshairPlugin()]});
  renderChart('sleepChart',{type:'bar',data:{labels,datasets:[{label:'Schlaf (h)',data:sorted.map(d=>d.sleepSecs?(d.sleepSecs/3600).toFixed(1):0),backgroundColor:'rgba(59,130,246,0.3)',borderColor:'#3b82f6',borderWidth:1,borderRadius:4}]},options:{...lineOptions(),interaction:crosshairInteraction()},plugins:[hoverCrosshairPlugin()]});
  const weightSorted=sorted.filter(d=>d.weight!=null);
  renderChart('weightChart',{type:'line',data:{labels:weightSorted.map(d=>fmtAxisDate(d.id)),datasets:[{label:'Gewicht (kg)',data:weightSorted.map(d=>d.weight),borderColor:'#8b5cf6',backgroundColor:'rgba(139,92,246,0.07)',borderWidth:2,pointRadius:2,tension:0.4,fill:true}]},options:{...lineOptions(),interaction:crosshairInteraction()},plugins:[hoverCrosshairPlugin()]});
  renderStepsChart(sorted);
  renderWellnessDayList(sorted);
}

// Tagesübersicht der Gesundheitsdaten (Gewicht, Schlaf, Ruhepuls, HRV, Schritte, Schlafqualität) —
// analog zum Journal, aber als eigene Liste, seit Aktivitäts- und Gesundheitsdaten getrennt wurden.
// Klick auf einen Tag öffnet den Editor zum nachträglichen Korrigieren (siehe openWellnessEditModal).
function renderWellnessDayList(sorted) {
  const el = document.getElementById('wellnessDayList');
  if (!el) return;
  if (!sorted.length) { el.innerHTML = '<div class="loading">Keine Daten</div>'; return; }
  const journalByDate = journalByDateMap();
  const days = [...sorted].reverse(); // neueste zuerst

  let lastYear = null;
  el.innerHTML = days.map(d => {
    const year = parseInt(d.id.slice(0,4));
    const yearDivider = year !== lastYear
      ? `<div style="display:flex;align-items:center;gap:14px;margin:${lastYear!==null?'26px':'4px'} 0 12px;color:var(--text);font-size:20px;font-weight:700;letter-spacing:0.02em">${lastYear!==null?'<div style="flex:1;height:2px;background:var(--border)"></div>':''}<span class="mono">${year}</span><div style="flex:1;height:2px;background:var(--border)"></div></div>`
      : '';
    lastYear = year;
    const dateLabel = new Date(d.id + 'T00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});
    const weightVal = d.weight != null ? d.weight.toFixed(1)+' kg' : '—';
    const sleepVal = d.sleepSecs ? (d.sleepSecs/3600).toFixed(1)+' h' : '—';
    const rhrVal = d.restingHR != null ? Math.round(d.restingHR)+' bpm' : '—';
    const hrvVal = d.hrv != null ? Math.round(d.hrv)+' ms' : '—';
    const steps = wellnessSteps(d);
    const stepsVal = steps != null ? fmtNum(steps) : '—';
    const n = journalByDate[d.id];
    const moodVal = n && n.mood != null ? moodIcon(n.mood,16) : '—';

    return `${yearDivider}<div class="note-card" style="cursor:pointer;flex-wrap:wrap;row-gap:10px" onclick="openWellnessEditModal('${d.id}')" title="Tageswerte & Notiz bearbeiten">
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-start;min-width:70px">
        <span class="mono" style="font-size:12px">${dateLabel}</span>
      </div>
      ${statChip('Gewicht', weightVal)}
      ${statChip('Schlaf', sleepVal)}
      ${statChip('Ruhepuls', rhrVal)}
      ${statChip('HRV', hrvVal)}
      ${statChip('Schritte', stepsVal)}
      ${statChip('Schlafqual.', moodVal)}
    </div>`;
  }).join('');
}

let _wellnessEditDay = null;
let _wellnessEditNote = null;
let _wellnessEditLocalMode = false;

// Tageswerte (Intervals.icu) UND Tagesnotiz (GitHub/lokal) in einem Fenster — bewusst keine
// Wiederverwendung des separaten "Morgen-Check"-Dialogs (siehe openNoteEditor), da Wellness eine
// eigene Ansicht bleiben soll. Notiz-Zustand analog zu openNoteEditor()/openDayNoteEditor().
function openWellnessEditModal(dayStr) {
  _wellnessEditDay = dayStr;
  const d = _wellnessFull.find(x => x.id === dayStr) || {};
  document.getElementById('wellnessEditModalDate').textContent = new Date(dayStr + 'T00:00').toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  document.getElementById('wellnessEditWeight').value = d.weight != null ? d.weight : '';
  document.getElementById('wellnessEditRestingHR').value = d.restingHR != null ? Math.round(d.restingHR) : '';
  document.getElementById('wellnessEditHrv').value = d.hrv != null ? d.hrv : '';
  document.getElementById('wellnessEditError').style.display = 'none';

  _wellnessEditLocalMode = !(ghToken && ghRepo);
  _wellnessEditNote = _wellnessEditLocalMode
    ? (_localDayNotes.find(x => x.date.slice(0,10) === dayStr) || null)
    : (_notes.find(n => n.type !== 'trainer-summary' && n.date && n.date.slice(0,10) === dayStr) || null);
  renderMoodPicker(_wellnessEditNote ? _wellnessEditNote.mood : null, 'wellnessEditMoodPicker');
  document.getElementById('wellnessEditNoteContent').value = _wellnessEditNote ? _wellnessEditNote.body : '';
  document.getElementById('wellnessEditDeleteNoteBtn').style.display = _wellnessEditNote ? 'block' : 'none';

  document.getElementById('wellnessEditModal').style.display = 'flex';
}

function closeWellnessEditModal() {
  document.getElementById('wellnessEditModal').style.display = 'none';
  _wellnessEditDay = null;
  _wellnessEditNote = null;
  _wellnessEditLocalMode = false;
}

async function saveWellnessEdit() {
  if (!_wellnessEditDay) return;
  const num = id => { const v = document.getElementById(id).value.trim(); return v === '' ? null : parseFloat(v); };
  const body = {};
  const weight = num('wellnessEditWeight'); if (weight != null) body.weight = weight;
  const restingHR = num('wellnessEditRestingHR'); if (restingHR != null) body.restingHR = Math.round(restingHR);
  const hrv = num('wellnessEditHrv'); if (hrv != null) body.hrv = hrv;
  const errEl = document.getElementById('wellnessEditError');
  try {
    const updated = await icuWrite(`/athlete/${athleteId}/wellness/${_wellnessEditDay}`, 'PUT', body);
    let entry = _wellnessFull.find(x => x.id === _wellnessEditDay);
    if (!entry) { entry = { id: _wellnessEditDay }; _wellnessFull.push(entry); }
    Object.assign(entry, updated || body);
    await saveWellnessEditNote();
    closeWellnessEditModal();
    refreshCockpitMoodTile();
    renderFromCache();
  } catch(e) {
    errEl.textContent = 'Fehler beim Speichern: ' + e.message;
    errEl.style.display = 'block';
  }
}

// Speichert Schlafqualität/Freitext zusätzlich zu den Tageswerten — nur wenn tatsächlich etwas
// eingetragen ist, damit keine leeren Notizen für unberührte Tage entstehen (dafür gibt es den
// eigenen Löschen-Button, siehe deleteWellnessEditNote).
async function saveWellnessEditNote() {
  const moodSel = document.getElementById('wellnessEditMoodPicker').dataset.selected;
  const mood = moodSel ? parseInt(moodSel) : null;
  const contentVal = document.getElementById('wellnessEditNoteContent').value.trim();
  if (!contentVal && mood == null && !_wellnessEditNote) return;

  const title = _wellnessEditNote ? _wellnessEditNote.title : 'Morgenbericht';
  const timeVal = _wellnessEditNote && _wellnessEditNote.date ? _wellnessEditNote.date.slice(11,16) : nowLocalISO().slice(11,16);
  const date = _wellnessEditDay + 'T' + timeVal;

  if (_wellnessEditLocalMode) {
    if (_wellnessEditNote) {
      Object.assign(_wellnessEditNote, { title, body: contentVal, date, mood });
    } else {
      _localDayNotes.unshift({ id: Date.now(), trainer: 'head-coach', title, body: contentVal, date, mood });
    }
    saveLocalDayNotes();
    return;
  }

  const content = buildNoteContent(contentVal, 'journal', title, date, mood);
  const filename = _wellnessEditNote ? _wellnessEditNote.filename : `${Date.now()}-journal.md`;
  const sha = _wellnessEditNote ? _wellnessEditNote.sha : null;
  const res = await saveNoteToGH(filename, content, sha);
  if (_wellnessEditNote) {
    Object.assign(_wellnessEditNote, { title, body: contentVal, date, mood, sha: res.content.sha });
  } else {
    _notes.unshift({ filename, sha: res.content.sha, trainer: 'journal', title, date, mood, body: contentVal });
  }
}

async function deleteWellnessEditNote() {
  if (!_wellnessEditNote) return;
  if (!confirm('Notiz für diesen Tag wirklich löschen?')) return;
  const errEl = document.getElementById('wellnessEditError');
  try {
    if (_wellnessEditLocalMode) {
      _localDayNotes = _localDayNotes.filter(x => x.id !== _wellnessEditNote.id);
      saveLocalDayNotes();
    } else {
      await deleteNoteFromGH(_wellnessEditNote.filename, _wellnessEditNote.sha);
      _notes = _notes.filter(x => x.filename !== _wellnessEditNote.filename);
    }
    _wellnessEditNote = null;
    renderMoodPicker(null, 'wellnessEditMoodPicker');
    document.getElementById('wellnessEditNoteContent').value = '';
    document.getElementById('wellnessEditDeleteNoteBtn').style.display = 'none';
    refreshCockpitMoodTile();
    renderFromCache();
  } catch(e) {
    errEl.textContent = 'Fehler beim Löschen: ' + e.message;
    errEl.style.display = 'block';
  }
}

function wellnessSteps(d) { return d.steps ?? d.totalSteps ?? null; }

// Job-Belastung (Schritte/Tag) — automatisch via Garmin-Sync aus Intervals.icu (Wellness-API), analog zu
// Gewicht/Schlaf. Bewusst als eigene Kachel getrennt von CTL/ATL/TSB. Tage über Schwellenwert werden
// farblich hervorgehoben.
function stepsThreshold() {
  return parseInt(localStorage.getItem('steps_threshold')) || 13000;
}
function setStepsThreshold(v) {
  const n = parseInt(v);
  if (n > 0) localStorage.setItem('steps_threshold', n);
  renderWellnessGroup();
}
function renderStepsChart(sorted) {
  const el = document.getElementById('stepsThresholdInput');
  const threshold = stepsThreshold();
  if (el) el.value = threshold;
  const entries = sorted.filter(d => wellnessSteps(d) != null);
  renderChart('stepsChart',{type:'bar',data:{labels:entries.map(d=>fmtAxisDate(d.id)),datasets:[{label:'Schritte',data:entries.map(wellnessSteps),backgroundColor:entries.map(d=>wellnessSteps(d)>=threshold?'rgba(239,68,68,0.55)':'rgba(59,130,246,0.3)'),borderColor:entries.map(d=>wellnessSteps(d)>=threshold?'#ef4444':'#3b82f6'),borderWidth:1,borderRadius:4}]},options:{...lineOptions(),interaction:crosshairInteraction()},plugins:[hoverCrosshairPlugin()]});
}


const MOOD_OPTIONS = [
  {v:1, l:'Schlecht'},
  {v:2, l:'Mäßig'},
  {v:3, l:'Ok'},
  {v:4, l:'Gut'},
  {v:5, l:'Sehr gut'},
];
const MOOD_MOUTHS = {
  1: 'M8 16 Q12 12 16 16',
  2: 'M8 15.5 Q12 13.5 16 15.5',
  3: 'M8 15 H16',
  4: 'M8 14.5 Q12 16.5 16 14.5',
  5: 'M7 13 Q12 19 17 13',
};
function moodIcon(v, size) {
  size = size || 20;
  const mouth = MOOD_MOUTHS[v] || MOOD_MOUTHS[3];
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/><path d="${mouth}"/></svg>`;
}

// Empfundene Anstrengung (session-RPE 1–10, Ankertexte). Farbe: 1 = grün → 10 = rot.
const RPE_OPTIONS = [
  {v:1, l:'Sehr leicht'}, {v:2, l:'Leicht'}, {v:3, l:'Locker'}, {v:4, l:'Moderat'}, {v:5, l:'Etwas fordernd'},
  {v:6, l:'Fordernd'}, {v:7, l:'Anstrengend'}, {v:8, l:'Sehr anstrengend'}, {v:9, l:'Sehr hart'}, {v:10, l:'Maximum'},
];
function rpeHue(v) { return Math.round(130 - (v-1)/9*130); } // 130=grün, 0=rot

// Trainingsbefinden (5 Stufen, nutzt die Schlaf-Smileys moodIcon). Wie GUT hat sich das Training angefühlt.
const FEEL_OPTIONS = [
  {v:1, l:'Schwach'}, {v:2, l:'Zäh'}, {v:3, l:'Normal'}, {v:4, l:'Gut'}, {v:5, l:'Stark'},
];

// Trainer-Personas für Zusammenfassungen aus dem Claude.ai-Coaching-Chat (siehe openTrainerNoteModal).
const TRAINER_OPTIONS = [
  {v:'head-coach', l:'Head Coach'},
  {v:'reha', l:'Reha'},
  {v:'kraft', l:'Kraft'},
  {v:'ernaehrung', l:'Ernährung'},
  {v:'methodik', l:'UA-Methodik'},
  {v:'mobilitaet', l:'Mobilität'},
];

// Erkennt die Rollen-Überschriften aus den Team-Antworten (siehe projekt-anweisung.md, Abschnitt
// "Die Rollen") in reingekopiertem Chat-Text, um ihn automatisch pro Trainer aufzuteilen.
const TRAINER_HEADER_PATTERNS = [
  { trainer: 'head-coach', re: /^head coach$/i },
  { trainer: 'reha', re: /^reha(-trainer)?$/i },
  { trainer: 'kraft', re: /^kraft(-trainer)?$/i },
  { trainer: 'ernaehrung', re: /^(sporternährungs-coach|ernährungs-coach|ernährung)$/i },
  { trainer: 'methodik', re: /^(ua-methodik-berater|ua-methodik)$/i },
  { trainer: 'mobilitaet', re: /^(mobilitäts-trainer|mobilität)$/i },
];

// Entfernt Markdown-Betonung (**fett**, _kursiv_, #Überschrift) und Emoji/Symbole an den Rändern
// einer Zeile, schneidet Zusatztext nach "—"/":" ab (z.B. "Head Coach — Job-Load") — damit die
// Rollen-Erkennung auch bei unterschiedlicher Chat-Formatierung zuverlässig greift.
function normalizeHeaderCandidate(line) {
  let s = line.trim().replace(/^[*_#\s]+/, '').replace(/[*_#\s]+$/, '');
  s = s.replace(/^[^\p{L}]*/u, '');
  return s.split(/\s*[—:]\s*/)[0].trim();
}

// Teilt reingekopierten Team-Antwort-Text an den Rollen-Überschriften auf. Text ohne erkennbare
// Überschrift (oder vor der ersten) fällt auf Head Coach zurück, da der die koordinierende Rolle ist.
function splitTrainerSections(text) {
  const lines = text.split('\n');
  const sections = [];
  let current = null;
  lines.forEach(line => {
    const stripped = normalizeHeaderCandidate(line);
    const match = stripped.length < 40 && TRAINER_HEADER_PATTERNS.find(p => p.re.test(stripped));
    if (match) {
      current = { trainer: match.trainer, lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else if (line.trim()) {
      current = { trainer: 'head-coach', lines: [line] };
      sections.push(current);
    }
  });
  return sections.map(s => ({ trainer: s.trainer, body: s.lines.join('\n').trim() })).filter(s => s.body);
}

// ─── Tagesnotizen lokal (Fallback ohne GitHub) ────────────────────────────────

let _localDayNotes = JSON.parse(localStorage.getItem('tb_day_notes') || '[]');

function saveLocalDayNotes() {
  localStorage.setItem('tb_day_notes', JSON.stringify(_localDayNotes));
}

// Tagesnotiz (GitHub oder lokal) zu einem Datum (JJJJ-MM-TT) — trägt u.a. Schlafqualität (mood).
// Trainer-Zusammenfassungen (type:'trainer-summary') zählen bewusst nicht als "die" Tagesnotiz,
// da an einem Tag zusätzlich zur eigenen Notiz auch eine oder mehrere Trainer-Zusammenfassungen
// existieren können (siehe openTrainerNoteModal) — die eigene Notiz bleibt die für Schlafqualität/
// Titel maßgebliche.
function findDayNote(dateStr) {
  return [..._notes, ..._localDayNotes].find(n => n.type !== 'trainer-summary' && n.date && n.date.slice(0,10) === dateStr);
}

function todaysMoodValue() {
  const note = findDayNote(fmtDate(new Date()));
  return note && note.mood ? note.mood : null;
}

function refreshCockpitMoodTile() {
  const moodEl = document.getElementById('cockpitMood');
  if (!moodEl) return;
  const mood = todaysMoodValue();
  moodEl.innerHTML = mood ? moodIcon(mood, 24) : '—';
}

// ─── GitHub Notes API ─────────────────────────────────────────────────────────

const GH_NOTES_PATH = 'notes';
const GH_PLAN_FILE = 'settings/training-plan.json';
const GH_RESPIRATION_FILE = 'settings/respiration.json';
const GH_ZONES_FILE = 'settings/hf-zones.json';
const GH_ACTIVITY_META_FILE = 'settings/activity-meta.json';
const GH_PLAN_SESSIONS_FILE = 'settings/plan-sessions.json';
const GH_HIDDEN_ACTIVITIES_FILE = 'settings/hidden-activities.json';
const GH_REST_DAYS_FILE = 'settings/rest-days.json';
const GH_PROFILE_FILE = 'settings/athlete-profile.json';
let _notes = [];
let _editingNote = null;

function ghHeaders() {
  return {
    'Authorization': `Bearer ${ghToken}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

async function ghFetch(path, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, { ...options, headers: ghHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    const e = new Error(err.message || `GitHub ${res.status}`);
    e.status = res.status;
    throw e;
  }
  if (res.status === 204) return null;
  return res.json();
}

function b64enc(str) { return btoa(unescape(encodeURIComponent(str))); }
function b64dec(str) { return decodeURIComponent(escape(atob(str.replace(/\n/g,'')))); }

function parseFrontmatter(content) {
  const fm = {};
  let body = content;
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (m) {
    m[1].split('\n').forEach(line => {
      const idx = line.indexOf(':');
      if (idx > 0) fm[line.slice(0,idx).trim()] = line.slice(idx+1).trim();
    });
    body = m[2];
  }
  return { fm, body: body.trim() };
}

// isTrainerSummary markiert eine vom Nutzer aus dem Claude.ai-Coaching-Chat zurückgeschriebene
// Kurzzusammenfassung (siehe openTrainerNoteModal). Eigenes `type`-Feld statt nur `trainer`, damit
// ältere Notizen aus dem alten 5-Trainer-System (vor der Journal-Zusammenführung, trainer z.B.
// 'reha'/'kraft') nicht versehentlich als Trainer-Zusammenfassung fehlinterpretiert werden.
function buildNoteContent(body, trainer, title, date, mood, isTrainerSummary) {
  date = date || nowLocalISO();
  const moodLine = mood ? `\nmood: ${mood}` : '';
  const typeLine = isTrainerSummary ? `\ntype: trainer-summary` : '';
  return `---\ntrainer: ${trainer}\ntitle: ${title}\ndate: ${date}${moodLine}${typeLine}\n---\n\n${body}`;
}

// Notiz-Dateinamen beginnen mit dem Erstellungs-Zeitstempel (ms seit Epoch), siehe saveNoteEditor().
// Damit lässt sich vor dem Laden filtern, ohne den Dateiinhalt abzurufen.
const NOTES_FAST_LOAD_DAYS = 14; // deckt den Standard-Zeitraum der Journal-Übersicht ab
let _notesOlderPending = null; // Dateiliste älterer Notizen, die noch nachgeladen werden müssen
let _notesOlderLoading = false;

async function fetchNoteFile(f) {
  const file = await ghFetch(`/repos/${ghRepo}/contents/${GH_NOTES_PATH}/${f.name}`);
  const { fm, body } = parseFrontmatter(b64dec(file.content));
  return { filename: f.name, sha: file.sha, trainer: fm.trainer || 'head-coach', title: fm.title || f.name.replace('.md',''), date: fm.date || '', mood: fm.mood ? parseInt(fm.mood) : null, rpe: fm.rpe ? parseInt(fm.rpe) : null, feel: fm.feel ? parseInt(fm.feel) : null, type: fm.type || null, body };
}

async function loadNotes() {
  if (!ghToken || !ghRepo) return [];
  try {
    let files;
    try {
      files = await ghFetch(`/repos/${ghRepo}/contents/${GH_NOTES_PATH}`);
    } catch(e) {
      if (e.message.includes('404') || e.message.includes('Not Found')) return [];
      throw e;
    }
    if (!Array.isArray(files)) return [];
    const mdFiles = files.filter(f => f.name.endsWith('.md'));
    const cutoff = daysAgo(NOTES_FAST_LOAD_DAYS).getTime();
    const recent = mdFiles.filter(f => (parseInt(f.name) || 0) >= cutoff);
    const older = mdFiles.filter(f => (parseInt(f.name) || 0) < cutoff);

    // Nacheinander statt Promise.all: viele parallele Requests an die GitHub-API können deren
    // Missbrauchserkennung (Secondary Rate Limit) auslösen und dann wie ein CORS-Fehler aussehen.
    const notes = [];
    for (const f of recent) notes.push(await fetchNoteFile(f));
    _notesOlderPending = older.length ? older : null;
    return notes.sort((a,b) => b.date.localeCompare(a.date));
  } catch(e) {
    console.error('GitHub notes:', e);
    showGhSyncError(e.message);
    return [];
  }
}

// Notizen älter als NOTES_FAST_LOAD_DAYS werden erst nachgeladen, nachdem die aktuellen schon
// angezeigt werden — nötig z.B. für die 30/90/365-Tage-Ansicht der Journal-Übersicht.
async function loadOlderNotesInBackground() {
  if (!_notesOlderPending || !_notesOlderPending.length || _notesOlderLoading) return;
  _notesOlderLoading = true;
  const pending = _notesOlderPending;
  _notesOlderPending = null;
  try {
    for (const f of pending) _notes.push(await fetchNoteFile(f));
    _notes.sort((a,b) => b.date.localeCompare(a.date));
    refreshCockpitMoodTile();
    renderFromCache();
  } catch(err) {
    console.error('Ältere Notizen nachladen fehlgeschlagen:', err);
  } finally {
    _notesOlderLoading = false;
  }
}

async function saveNoteToGH(filename, content, sha) {
  const payload = { message: sha ? `Update: ${filename}` : `Add: ${filename}`, content: b64enc(content) };
  if (sha) payload.sha = sha;
  return ghFetch(`/repos/${ghRepo}/contents/${GH_NOTES_PATH}/${filename}`, { method:'PUT', body:JSON.stringify(payload) });
}

async function deleteNoteFromGH(filename, sha) {
  return ghFetch(`/repos/${ghRepo}/contents/${GH_NOTES_PATH}/${filename}`, {
    method:'DELETE', body:JSON.stringify({ message:`Delete: ${filename}`, sha })
  });
}

// Generischer Sync für Einstellungen, die als ein JSON-Objekt in localStorage +
// GitHub-Datei gehalten werden (Trainings-Soll, Atmungsdaten). Jedes Objekt trägt
// ein `updatedAt` (Date.now()), damit beim Sync die neuere Version gewinnt.
const _ghShaCache = {};

function showGhSyncError(message) {
  const banner = document.getElementById('ghSyncErrorBanner');
  const text = document.getElementById('ghSyncErrorText');
  if (!banner || !text) return;
  text.textContent = 'GitHub-Abgleich fehlgeschlagen: ' + message;
  banner.style.display = 'block';
}

async function loadJSONFromGH(ghPath) {
  if (!ghToken || !ghRepo) return null;
  try {
    const file = await ghFetch(`/repos/${ghRepo}/contents/${ghPath}`);
    _ghShaCache[ghPath] = file.sha;
    return JSON.parse(b64dec(file.content));
  } catch(e) {
    if (!e.message.includes('404') && !e.message.includes('Not Found')) {
      console.error(`GitHub ${ghPath}:`, e);
      showGhSyncError(e.message);
    }
    return null;
  }
}

async function saveJSONToGH(ghPath, data, message, _retry = true) {
  if (!ghToken || !ghRepo) return;
  try {
    const file = await ghFetch(`/repos/${ghRepo}/contents/${ghPath}`);
    _ghShaCache[ghPath] = file.sha;
  } catch(e) {
    if (!e.message.includes('404') && !e.message.includes('Not Found')) throw e;
    _ghShaCache[ghPath] = null;
  }
  const payload = { message, content: b64enc(JSON.stringify(data, null, 2)) };
  if (_ghShaCache[ghPath]) payload.sha = _ghShaCache[ghPath];
  try {
    const res = await ghFetch(`/repos/${ghRepo}/contents/${ghPath}`, { method:'PUT', body:JSON.stringify(payload) });
    _ghShaCache[ghPath] = res.content.sha;
  } catch(e) {
    // Sha war veraltet, z.B. weil ein anderes Tab/Gerät zwischenzeitlich geschrieben hat.
    // Einmal mit frischem Sha erneut versuchen, bevor der Fehler nach oben gereicht wird.
    if (_retry && e.status === 409) return saveJSONToGH(ghPath, data, message, false);
    throw e;
  }
}

async function syncJSONFromGH(ghPath, storageKey, getLocal, onApplied) {
  const remote = await loadJSONFromGH(ghPath);
  if (!remote) return;
  const local = getLocal();
  if ((remote.updatedAt || 0) <= (local.updatedAt || 0)) return;
  localStorage.setItem(storageKey, JSON.stringify(remote));
  if (onApplied) onApplied();
}

function saveTrainingPlanToGH(plan) { return saveJSONToGH(GH_PLAN_FILE, plan, 'Update training plan'); }
function syncTrainingPlanFromGH() { return syncJSONFromGH(GH_PLAN_FILE, 'training_plan', getTrainingPlan, () => { renderCockpitWeek(); populatePlanForm(); }); }
function saveManualRespirationToGH(data) { return saveJSONToGH(GH_RESPIRATION_FILE, data, 'Update Atmung-Daten'); }
function syncManualRespirationFromGH() { return syncJSONFromGH(GH_RESPIRATION_FILE, 'manual_respiration', getManualRespiration, renderFromCache); }
function saveActivityMetaToGH(data) { return saveJSONToGH(GH_ACTIVITY_META_FILE, data, 'Update Aktivitäts-Daten'); }
function syncActivityMetaFromGH() { return syncJSONFromGH(GH_ACTIVITY_META_FILE, 'activity_meta', getActivityMeta, renderFromCache); }
function savePlanSessionsToGH(data) { return saveJSONToGH(GH_PLAN_SESSIONS_FILE, data, 'Update Trainingsplan'); }
function syncPlanSessionsFromGH() { return syncJSONFromGH(GH_PLAN_SESSIONS_FILE, 'plan_sessions', getPlanSessions, renderCockpitWeek); }
function saveHfZonesToGH(zones) { return saveJSONToGH(GH_ZONES_FILE, zones, 'Update HF-Zonen'); }
function syncHfZonesFromGH() { return syncJSONFromGH(GH_ZONES_FILE, 'hf_zones', getHfZones, () => { applyHfZonesToInputs(); updateZones(); renderZonesGroup(); }); }
function saveRestDaysToGH(data) { return saveJSONToGH(GH_REST_DAYS_FILE, data, 'Update trainingsfreie Tage'); }
function syncRestDaysFromGH() { return syncJSONFromGH(GH_REST_DAYS_FILE, 'rest_days', getRestDaysData, () => { populateSettingsForm(); renderCockpitWeek(); }); }
function saveAthleteProfileToGH(profile) { return saveJSONToGH(GH_PROFILE_FILE, profile, 'Update Athletenprofil'); }
function syncAthleteProfileFromGH() { return syncJSONFromGH(GH_PROFILE_FILE, 'athlete_profile', getAthleteProfile, applyAthleteProfileToInputs); }

function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function nowLocalISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}


// ─── Note Editor ──────────────────────────────────────────────────────────────

// Schlaf-Picker im Morgen-Check ('moodPicker') — Schlafqualität gehört zum Tagesgesamtbild
// (Training + Planung), das der Morgen-Check erfasst, nicht zur Wellness-Seite (Wellness/
// Aktivitäten werden separat geführt).
function renderMoodPicker(selected, elId='moodPicker') {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = MOOD_OPTIONS.map(m =>
    `<button type="button" class="mood-btn${m.v===selected?' active':''}" data-mood="${m.v}" onclick="selectMood(${m.v},'${elId}')">${moodIcon(m.v,22)}<span class="mood-btn-label">${m.l}</span></button>`
  ).join('');
  el.dataset.selected = selected || '';
}

function selectMood(v, elId='moodPicker') {
  const el = document.getElementById(elId);
  el.querySelectorAll('.mood-btn').forEach(b => b.classList.toggle('active', +b.dataset.mood === v));
  el.dataset.selected = v;
}

function renderRpePicker(selected) {
  const el = document.getElementById('rpePicker');
  if (!el) return;
  el.dataset.selected = selected || '';
  el.innerHTML = RPE_OPTIONS.map(o => {
    const h = rpeHue(o.v), on = o.v === selected;
    const style = on
      ? `background:hsl(${h},70%,45%);border-color:hsl(${h},70%,45%);color:#fff`
      : `background:hsla(${h},70%,45%,0.14);border-color:transparent;color:var(--text)`;
    return `<button type="button" class="rpe-btn${on?' active':''}" data-rpe="${o.v}" title="${o.l}" onclick="selectRpe(${o.v})" style="${style}">${o.v}</button>`;
  }).join('');
  const lab = document.getElementById('rpeLabel');
  if (lab) lab.textContent = selected ? `${selected}/10 · ${RPE_OPTIONS.find(o=>o.v===selected).l}` : '';
}

function selectRpe(v) {
  const el = document.getElementById('rpePicker');
  const cur = parseInt(el.dataset.selected) || null;
  renderRpePicker(cur === v ? null : v); // erneut tippen = abwählen
}

function renderFeelPicker(selected) {
  const el = document.getElementById('feelPicker');
  if (!el) return;
  el.innerHTML = FEEL_OPTIONS.map(m =>
    `<button type="button" class="feel-btn${m.v===selected?' active':''}" data-feel="${m.v}" onclick="selectFeel(${m.v})">${moodIcon(m.v,22)}<span class="mood-btn-label">${m.l}</span></button>`
  ).join('');
  el.dataset.selected = selected || '';
}

function selectFeel(v) {
  document.querySelectorAll('.feel-btn').forEach(b => b.classList.toggle('active', +b.dataset.feel === v));
  document.getElementById('feelPicker').dataset.selected = v;
}

// ─── Aktivitäten-Modal (Trainingsbewertung pro Einheit) ───────────────────────
let _activityModalId = null;

function findActivityById(id) {
  return (_activitiesFull || []).find(a => String(a.id) === String(id))
      || (_cockpitActivitiesFull || []).find(a => String(a.id) === String(id))
      || null;
}

// Automatisch aus Intervals.icu abgeleitete Kennzahlen einer Aktivität — Basis für die editierbaren
// Felder im Aktivitäts-Modal. Ø Geschwindigkeit wird aus Distanz/Zeit berechnet, da Intervals.icu
// sie nicht direkt liefert.
function autoActivityStats(act) {
  const distKm = act.distance ? act.distance/1000 : null;
  const timeMin = act.moving_time ? act.moving_time/60 : null;
  const hrBpm = act.average_heartrate || null;
  const elevM = act.total_elevation_gain || null;
  const wattsW = act.icu_weighted_avg_watts || act.icu_average_watts || act.average_watts || null;
  const speedKmh = (distKm != null && timeMin) ? distKm / (timeMin/60) : null;
  return { distKm, timeMin, hrBpm, elevM, wattsW, speedKmh };
}

const ACTIVITY_STAT_DEFS = [
  { key:'distKm',   label:'Distanz',      dec:1, unit:' km' },
  { key:'timeMin',  label:'Zeit (min)',   dec:0, unit:' min' },
  { key:'hrBpm',    label:'Ø HF',         dec:0, unit:' bpm' },
  { key:'speedKmh', label:'Ø Geschw.',    dec:1, unit:' km/h' },
  { key:'elevM',    label:'Höhe',         dec:0, unit:' hm' },
  { key:'wattsW',   label:'Ø Leistung',   dec:0, unit:' W' },
];

// Manuell korrigierte Werte (activity_meta) haben Vorrang vor den automatischen Intervals.icu-Werten —
// z.B. bei fehlerhaften Sensor-Messungen (Ø HF bei Hitze o.ä.).
function effectiveActivityStats(act, meta) {
  const auto = autoActivityStats(act);
  const eff = {};
  ACTIVITY_STAT_DEFS.forEach(d => { eff[d.key] = meta[d.key] != null ? meta[d.key] : auto[d.key]; });
  return { auto, eff };
}

// Ruhetage ohne echte Intervals.icu-Aktivität (id "note-<Datum>", siehe renderOverviewGroup) haben
// kein Objekt in _activitiesFull — synthetisches Fallback-Objekt, damit RPE/Befinden/Bemerkung auch
// für sie unter derselben (stabilen) id gespeichert werden können wie für echte Aktivitäten.
function openActivityModal(actId) {
  const isNoteOnlyId = String(actId).startsWith('note-');
  const act = isNoteOnlyId
    ? { id: actId, _noteOnly: true, name: 'Ruhetag', start_date_local: String(actId).slice(5) + 'T12:00:00' }
    : findActivityById(actId);
  if (!act) return;
  _activityModalId = act.id;
  const type = isNoteOnlyId ? 'Ruhetag' : normalizeType(act.type);
  const color = isNoteOnlyId ? PLAN_EXTRA_COLORS.Ruhetag : (TYPE_COLORS[type] || '#94a3b8');
  document.getElementById('activityModalType').innerHTML = `<span class="tag" style="background:${color}20;color:${color}">${type}</span>`;
  document.getElementById('activityModalTitle').textContent = act.name || type;
  document.getElementById('activityModalDate').textContent = new Date(act.start_date_local).toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

  // Kennzahlen aus Intervals.icu, editierbar — bei Sensor-Fehlern (z.B. HF bei Hitze) korrigierbar.
  // Manuell geänderte Werte überschreiben den Automatik-Wert dauerhaft (activity_meta), bis das Feld
  // wieder geleert wird.
  const meta = getActivityMetaFor(act.id);
  const { auto, eff } = effectiveActivityStats(act, meta);
  document.getElementById('activityModalStats').innerHTML = ACTIVITY_STAT_DEFS
    .filter(d => auto[d.key] != null || eff[d.key] != null)
    .map(d => {
      const val = eff[d.key] != null ? (+eff[d.key]).toFixed(d.dec) : '';
      const placeholder = auto[d.key] != null ? `auto: ${(+auto[d.key]).toFixed(d.dec)}` : '';
      return `<div class="setup-field" style="margin-bottom:0">
        <label class="setup-label">${d.label}</label>
        <input class="setup-input" data-stat-key="${d.key}" type="text" inputmode="decimal" value="${val}" placeholder="${placeholder}"></div>`;
    }).join('') || '<div class="setup-hint">Keine Kennzahlen vorhanden.</div>';
  if (act.icu_training_load) {
    document.getElementById('activityModalStats').insertAdjacentHTML('beforeend',
      `<div class="setup-field" style="margin-bottom:0">
        <label class="setup-label">Load</label>
        <input class="setup-input" value="${Math.round(act.icu_training_load)}" disabled></div>`);
  }

  // Bewertungs-Felder: RPE/Befinden/Bemerkung aus activity_meta, Atmung aus manual_respiration
  renderRpePicker(meta.rpe || null);
  renderFeelPicker(meta.feel || null);
  document.getElementById('actNote').value = meta.note || '';
  const effectSel = document.getElementById('actTrainingEffect');
  effectSel.innerHTML = '<option value="">– wählen –</option>' + EFFECT_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
  effectSel.value = meta.effectCategory || suggestEffectCategory(act, type) || '';
  document.getElementById('actTemp').value = meta.temp != null ? meta.temp : '';
  document.getElementById('actWeather').value = meta.weather || '';
  const resp = getManualRespiration()[act.id];
  document.getElementById('actRespiration').value = resp != null ? resp : '';
  const ef = computeEfficiencyTrend(act, type);
  const efEl = document.getElementById('activityModalEF');
  if (ef) {
    efEl.style.display = 'block';
    const unit = type === 'Rad' ? ' W/bpm' : ' m/min/bpm';
    const trendText = ef.n ? `Trend ggü. letzten ${ef.n} vergleichbaren Einheiten: ${ef.label} ${ef.trendPct > 0 ? '+' : ''}${ef.trendPct}%` : 'noch keine Vergleichswerte';
    efEl.textContent = `Effizienz: ${ef.value.toFixed(1)}${unit} · ${trendText}`;
  } else {
    efEl.style.display = 'none';
  }

  document.getElementById('activityModalError').style.display = 'none';
  document.getElementById('activityModalHideBtn').style.display = isNoteOnlyId ? 'none' : 'block';
  document.getElementById('activityModal').style.display = 'flex';
}

function closeActivityModal() {
  document.getElementById('activityModal').style.display = 'none';
  _activityModalId = null;
}

function deleteActivityModal() {
  if (!_activityModalId) return;
  if (!confirm('Diese Einheit nur auf dem Dashboard ausblenden? Bei intervals.icu bleibt sie erhalten.')) return;
  hideActivity(_activityModalId);
  _activitiesFull = filterHiddenActivities(_activitiesFull);
  _cockpitActivitiesFull = filterHiddenActivities(_cockpitActivitiesFull);
  closeActivityModal();
  renderFromCache();
  renderCockpitWeek();
}

async function saveActivityModal() {
  if (!_activityModalId) return;
  const rpeSel  = document.getElementById('rpePicker').dataset.selected;
  const feelSel = document.getElementById('feelPicker').dataset.selected;
  const rpe  = rpeSel  ? parseInt(rpeSel)  : null;
  const feel = feelSel ? parseInt(feelSel) : null;
  const note = document.getElementById('actNote').value.trim();
  const effectCategory = document.getElementById('actTrainingEffect').value;
  const tempRaw = document.getElementById('actTemp').value.trim();
  const temp = tempRaw ? parseFloat(tempRaw) : null;
  const weather = document.getElementById('actWeather').value.trim();
  const statPatch = {};
  document.querySelectorAll('#activityModalStats [data-stat-key]').forEach(inp => {
    const raw = inp.value.trim().replace(',', '.');
    const num = parseFloat(raw);
    statPatch[inp.dataset.statKey] = raw && !isNaN(num) ? num : null;
  });
  saveActivityMetaValue(_activityModalId, { rpe, feel, note, effectCategory, temp, weather, ...statPatch });
  // Atmung läuft weiter über den bestehenden Atmungs-Speicher
  saveManualRespirationValue(_activityModalId, document.getElementById('actRespiration').value.trim());
  closeActivityModal();
  refreshCockpitMoodTile();
  renderFromCache();
}

// Kopiert die geöffnete Aktivität (inkl. RPE/Befinden/Atmung/Notiz/Temperatur/Witterung/
// Trainingseffect/Efficiency Factor) für den KI-Trainer — analog zu copyNoteForClaude(),
// aber pro Einheit statt pro Journal-Eintrag. Kein 7-Tage-Kontext mehr (redundant, da der
// Trainer bei Bedarf selbst in training-notes/notes/ auf GitHub nachschauen kann).
async function copyActivityForClaude() {
  if (!_activityModalId) return;
  const isNoteOnlyId = String(_activityModalId).startsWith('note-');
  const act = isNoteOnlyId
    ? { id: _activityModalId, _noteOnly: true, name: 'Ruhetag', start_date_local: String(_activityModalId).slice(5) + 'T12:00:00' }
    : findActivityById(_activityModalId);
  if (!act) return;
  const type = isNoteOnlyId ? 'Ruhetag' : normalizeType(act.type);
  const dateLong = new Date(act.start_date_local).toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });

  const meta = getActivityMetaFor(act.id);
  const resp = getManualRespiration()[act.id];
  const { eff } = effectiveActivityStats(act, meta);
  const statParts = [];
  if (eff.distKm != null) statParts.push(eff.distKm.toFixed(1)+' km');
  if (eff.timeMin != null) statParts.push(formatDur(Math.round(eff.timeMin*60)));
  if (eff.hrBpm != null) statParts.push('Ø '+Math.round(eff.hrBpm)+' bpm');
  if (eff.wattsW != null) statParts.push('Ø '+Math.round(eff.wattsW)+' W');
  if (eff.speedKmh != null) statParts.push('Ø '+eff.speedKmh.toFixed(1)+' km/h');
  if (eff.elevM != null) statParts.push(Math.round(eff.elevM)+' hm');

  const lines = [
    `# Trainingsbericht — ${dateLong}`,
    `${type}: ${act.name || type}${statParts.length ? ' — '+statParts.join(' · ') : ''}`,
    '',
  ];
  if (meta.effectCategory) lines.push(`Trainingseffect: ${meta.effectCategory}`);
  if (resp != null) lines.push(`Atmung ${resp}/min`);
  if (meta.temp != null || meta.weather) lines.push(`Witterung: ${meta.temp != null ? meta.temp+'°C' : ''}${meta.temp != null && meta.weather ? ', ' : ''}${meta.weather || ''}`);
  if (meta.rpe) lines.push(`RPE ${meta.rpe}/10 (${RPE_OPTIONS.find(o=>o.v===meta.rpe)?.l})`);
  if (meta.feel) lines.push(`Befinden ${meta.feel}/5 (${FEEL_OPTIONS.find(o=>o.v===meta.feel)?.l})`);
  if (meta.note) lines.push(`Bemerkung: ${meta.note}`);
  const ef = computeEfficiencyTrend(act, type);
  if (ef) lines.push(`Efficiency Factor: ${ef.value.toFixed(1)}${type === 'Rad' ? ' W/bpm' : ' m/min/bpm'}${ef.n ? ` · Trend ggü. letzten ${ef.n} Einheiten: ${ef.label} ${ef.trendPct > 0 ? '+' : ''}${ef.trendPct}%` : ''}`);

  lines.push('', '---', '_Kontext aus TrainIQ — bei Bedarf Trainingsverlauf & Reha-Status aus dem Repo (GitHub) heranziehen._');

  const btn = document.getElementById('copyActivityBtn');
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    btn.textContent = '✓ Kopiert!';
    setTimeout(() => { btn.textContent = '✦ Aktivität für Claude kopieren'; }, 2500);
  } catch(e) { alert('Kopieren fehlgeschlagen.'); }
}

// ─── Plan-Modal (geplante Einheit im Wochenkalender anlegen/bearbeiten) ────────
let _planDay = null, _planId = null;

function openPlanModal(dayStr, id) {
  _planDay = dayStr; _planId = id || null;
  const s = id ? getPlanSessionsFor(dayStr).find(x => x.id === id) : null;
  document.getElementById('planModalHeading').textContent = s ? 'Geplante Einheit bearbeiten' : 'Einheit planen';
  document.getElementById('planModalDate').textContent = new Date(dayStr + 'T00:00').toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  document.getElementById('planType').innerHTML = PLAN_TYPES.map(t => `<option value="${t}"${s && s.type===t ? ' selected' : ''}>${t}</option>`).join('');
  if (!s) document.getElementById('planType').value = 'Laufen';
  document.getElementById('planMin').value = s && s.min ? s.min : '';
  document.getElementById('planNote').value = s ? (s.note || '') : '';
  document.getElementById('planPhases').value = s && s.phases && s.phases.length
    ? s.phases.map(p => `${p.label} | ${p.min} | ${p.zone || ''}`).join('\n') : '';
  onPlanPhasesInput();
  document.getElementById('planDeleteBtn').style.display = s ? 'block' : 'none';
  document.getElementById('planModal').style.display = 'flex';
}

function closePlanModal() {
  document.getElementById('planModal').style.display = 'none';
  _planDay = null; _planId = null;
}

// Parst die optionale Phasen-Struktur im Plan-Modal: eine Phase pro Zeile „Label | Minuten | Zone".
function parsePlanPhases(text) {
  return (text || '').split('\n').map(l => l.trim()).filter(Boolean)
    .map(line => {
      const [label, minRaw, zone] = line.split('|').map(p => p.trim());
      const min = minRaw ? parseInt(minRaw.replace(/\D/g,'')) : null;
      return label && min ? { label, min, zone: zone || '' } : null;
    })
    .filter(Boolean);
}

// Sobald Phasen eingetragen sind, wird "Dauer (min)" automatisch aus deren Summe berechnet
// und ist nicht mehr frei editierbar.
function onPlanPhasesInput() {
  const phases = parsePlanPhases(document.getElementById('planPhases').value);
  const minEl = document.getElementById('planMin');
  if (phases.length) {
    minEl.value = phases.reduce((s,p) => s + p.min, 0);
    minEl.readOnly = true;
  } else {
    minEl.readOnly = false;
  }
}

async function savePlanModal() {
  if (!_planDay) return;
  const type = document.getElementById('planType').value;
  const phases = parsePlanPhases(document.getElementById('planPhases').value);
  const minRaw = document.getElementById('planMin').value.trim();
  const min = phases.length ? phases.reduce((s,p) => s + p.min, 0) : (minRaw ? parseInt(minRaw) : null);
  const note = document.getElementById('planNote').value.trim();
  const existing = _planId ? getPlanSessionsFor(_planDay).find(s => s.id === _planId) : null;
  const icuEventId = existing && existing.icuEventId;
  await upsertPlanSession(_planDay, { id: _planId || 'p' + Date.now(), type, min, note, ...(phases.length ? { phases } : {}), ...(icuEventId ? { icuEventId } : {}) });
  closePlanModal();
  renderCockpitWeek();
}

async function deletePlanModalSession() {
  if (!_planDay || !_planId) return;
  await removePlanSession(_planDay, _planId);
  closePlanModal();
  renderCockpitWeek();
}

// ─── KI-Trainer-Plan importieren ──────────────────────────────────────────────
const PLAN_WEEKDAYS = { mo:0, di:1, mi:2, do:3, fr:4, sa:5, so:6, montag:0, dienstag:1, mittwoch:2, donnerstag:3, freitag:4, samstag:5, sonntag:6 };

// Parst Trainer-Text: eine Einheit pro Zeile „Datum|Typ|Minuten|Notiz". Datum = JJJJ-MM-TT ODER Wochentag (bezogen auf angezeigte Woche).
function parsePlanText(text) {
  const shownWeekStart = cockpitWeekStart(cockpitWeekOffset);
  const sessions = [], errors = [];
  (text || '').split('\n').forEach(raw => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 2) { errors.push(line); return; }
    const [d, typeRaw, minRaw, ...noteRest] = parts;
    let dateStr = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) dateStr = d;
    else {
      const wd = PLAN_WEEKDAYS[d.toLowerCase().replace(/\./g,'')];
      if (wd != null) { const dt = new Date(shownWeekStart); dt.setDate(shownWeekStart.getDate() + wd); dateStr = fmtDate(dt); }
    }
    const type = PLAN_TYPES.find(t => t.toLowerCase() === (typeRaw || '').toLowerCase());
    if (!dateStr || !type) { errors.push(line); return; }
    const min = minRaw && /\d/.test(minRaw) ? parseInt(minRaw.replace(/\D/g,'')) : null;
    const note = (min != null ? noteRest : [minRaw, ...noteRest]).filter(Boolean).join(' ').trim();
    sessions.push({ date: dateStr, type, min, note });
  });
  return { sessions, errors };
}

function openPlanImport() {
  document.getElementById('planImportText').value = '';
  document.getElementById('planImportPreview').innerHTML = '';
  document.getElementById('planImportModal').style.display = 'flex';
}
function closePlanImport() { document.getElementById('planImportModal').style.display = 'none'; }

function previewPlanImport() {
  const { sessions, errors } = parsePlanText(document.getElementById('planImportText').value);
  const el = document.getElementById('planImportPreview');
  if (!sessions.length && !errors.length) { el.innerHTML = '<span class="setup-hint">Vorschau erscheint hier…</span>'; return; }
  const byDay = {};
  sessions.forEach(s => { (byDay[s.date] = byDay[s.date] || []).push(s); });
  let html = `<div style="font-weight:600;font-size:12px;margin-bottom:6px">${sessions.length} Einheit(en) erkannt${errors.length ? ` · ${errors.length} Zeile(n) ignoriert` : ''}</div>`;
  html += Object.keys(byDay).sort().map(day => {
    const label = new Date(day + 'T00:00').toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit' });
    return `<div style="font-size:12px;margin-bottom:2px"><span class="mono">${label}</span> — ${byDay[day].map(s => `${s.type}${s.min ? ' ' + s.min + ' min' : ''}`).join(', ')}</div>`;
  }).join('');
  el.innerHTML = html;
}

async function confirmPlanImport() {
  const { sessions } = parsePlanText(document.getElementById('planImportText').value);
  if (!sessions.length) { closePlanImport(); return; }
  const data = getPlanSessions();
  const affectedDays = [...new Set(sessions.map(s => s.date))];
  // alte Intervals.icu-Events der betroffenen Tage entfernen, bevor die Tage neu befüllt werden
  await Promise.all(affectedDays.flatMap(day => (Array.isArray(data[day]) ? data[day] : []).map(deleteSessionFromICU)));
  affectedDays.forEach(day => { data[day] = []; });
  const newSessions = sessions.map(s => ({ id: 'p' + Date.now() + Math.random().toString(36).slice(2,6), type: s.type, min: s.min, note: s.note, date: s.date }));
  await Promise.all(newSessions.map(s => syncSessionToICU(s.date, s)));
  newSessions.forEach(s => { const { date, ...session } = s; data[date].push(session); });
  savePlanSessions(data);
  closePlanImport();
  renderCockpitWeek();
}

let _noteEditorLocalMode = false;
let _editingLocalNoteId = null;
let _noteEditorDate = null;
let _noteEditorTitle = 'Morgenbericht';

function openNoteEditor(dateStr) {
  if (!ghToken || !ghRepo) { openSettingsModal(); return; }
  _noteEditorLocalMode = false;
  _editingLocalNoteId = null;
  const targetDate = dateStr || fmtDate(new Date());
  const existing = _notes.find(n => n.type !== 'trainer-summary' && n.date && n.date.slice(0,10) === targetDate);
  _editingNote = existing ? { filename: existing.filename, sha: existing.sha, date: existing.date } : null;
  _noteEditorDate = targetDate;
  _noteEditorTitle = existing ? existing.title : 'Morgenbericht';
  document.getElementById('noteEditorHeading').textContent = existing ? '✎ Morgen-Check bearbeiten' : '✎ Morgen-Check';
  document.getElementById('noteEditorModalDate').textContent = new Date(targetDate + 'T00:00').toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  document.getElementById('noteEditorContent').value = existing ? existing.body : '';
  renderMoodPicker(existing ? existing.mood : null, 'moodPicker');

  document.getElementById('noteEditorError').style.display = 'none';
  document.getElementById('localDayNotesSection').style.display = 'none';
  // Löschen-Button nur bei bestehender Notiz zeigen
  document.getElementById('noteEditorDeleteBtn').style.display = existing ? 'block' : 'none';
  document.getElementById('noteEditorModal').style.display = 'flex';
}

function openDayNoteEditor(localNoteId) {
  if (ghToken && ghRepo) {
    openNoteEditor();
    return;
  }
  _editingNote = null;
  _noteEditorLocalMode = true;
  _editingLocalNoteId = localNoteId || null;
  const n = localNoteId ? _localDayNotes.find(x => x.id === localNoteId) : null;
  _noteEditorDate = n ? n.date.slice(0,10) : fmtDate(new Date());
  _noteEditorTitle = n ? n.title : 'Morgenbericht';
  document.getElementById('noteEditorHeading').textContent = n ? '✎ Morgen-Check bearbeiten' : '✎ Morgen-Check';
  document.getElementById('noteEditorModalDate').textContent = new Date(_noteEditorDate + 'T00:00').toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  document.getElementById('noteEditorContent').value = n ? n.body : '';
  renderMoodPicker(n ? n.mood : null, 'moodPicker');
  document.getElementById('noteEditorError').style.display = 'none';
  document.getElementById('localDayNotesSection').style.display = 'block';
  // Lokaler Modus hat eigene Löschliste unten — Editor-Löschbutton hier aus
  document.getElementById('noteEditorDeleteBtn').style.display = 'none';
  renderLocalDayNotesList();
  document.getElementById('noteEditorModal').style.display = 'flex';
}

function closeNoteEditor() {
  document.getElementById('noteEditorModal').style.display = 'none';
  _editingNote = null;
  _noteEditorLocalMode = false;
  _editingLocalNoteId = null;
}

function renderLocalDayNotesList() {
  const el = document.getElementById('localDayNotesList');
  if (!el) return;
  if (_localDayNotes.length === 0) { el.innerHTML = '<div class="setup-hint">Noch keine Einträge.</div>'; return; }
  el.innerHTML = _localDayNotes.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(n => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:6px">
      <div style="display:flex;align-items:center;gap:10px;color:var(--text2)">
        ${moodIcon(n.mood || 3, 20)}
        <div>
          <div class="mono" style="font-size:10px">${new Date(n.date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'})}</div>
          <div style="font-size:12px;color:var(--text)">${escHtml((n.body||'').slice(0,60)) || '<span style="color:var(--text2)">(keine Notiz)</span>'}</div>
        </div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn" style="padding:4px 8px" onclick="openDayNoteEditor(${n.id})" title="Bearbeiten">✎</button>
        <button class="btn" style="padding:4px 8px;color:var(--red);border-color:var(--red)" onclick="deleteLocalDayNote(${n.id})" title="Löschen">✕</button>
      </div>
    </div>`
  ).join('');
}

function deleteLocalDayNote(id) {
  if (!confirm('Eintrag wirklich löschen?')) return;
  _localDayNotes = _localDayNotes.filter(n => n.id !== id);
  saveLocalDayNotes();
  renderLocalDayNotesList();
  refreshCockpitMoodTile();
  renderFromCache();
}

async function saveNoteEditor() {
  const title   = _noteEditorTitle;
  const body    = document.getElementById('noteEditorContent').value.trim();
  const dateVal = _noteEditorDate || fmtDate(new Date());
  const existing = _editingNote || (_editingLocalNoteId ? _localDayNotes.find(x => x.id === _editingLocalNoteId) : null);
  const timeVal  = existing && existing.date ? existing.date.slice(11, 16) : nowLocalISO().slice(11, 16);
  const date     = dateVal + 'T' + timeVal;
  const moodSel = document.getElementById('moodPicker').dataset.selected;
  const mood    = moodSel ? parseInt(moodSel) : null;
  const errEl   = document.getElementById('noteEditorError');
  errEl.style.display = 'none';

  if (_noteEditorLocalMode) {
    if (_editingLocalNoteId) {
      const n = _localDayNotes.find(x => x.id === _editingLocalNoteId);
      if (n) { n.title = title; n.body = body; n.date = date; n.mood = mood; }
    } else {
      _localDayNotes.unshift({ id: Date.now(), trainer: 'head-coach', title, body, date, mood });
    }
    saveLocalDayNotes();
    closeNoteEditor();
    refreshCockpitMoodTile();
    renderFromCache();
    return;
  }

  const content  = buildNoteContent(body, 'journal', title, date, mood);
  const filename = _editingNote ? _editingNote.filename : `${Date.now()}-journal.md`;
  const sha      = _editingNote ? _editingNote.sha : null;
  try {
    const res = await saveNoteToGH(filename, content, sha);
    if (_editingNote) {
      const n = _notes.find(x => x.filename === filename);
      if (n) { n.title = title; n.body = body; n.date = date; n.mood = mood; n.sha = res.content.sha; }
    } else {
      _notes.unshift({ filename, sha: res.content.sha, trainer: 'journal', title, date, mood, body });
    }
    closeNoteEditor();
    refreshCockpitMoodTile();
    renderFromCache();
  } catch(e) {
    errEl.textContent = 'Fehler: ' + e.message;
    errEl.style.display = 'block';
  }
}

// Neueste Reha-Trainerzusammenfassung (unabhängig vom Tag) als Statuszeile für den Morgen-Check —
// so muss der Head Coach Gate/Fenster/Ausschluss nicht aus Skill-Datei/Gedächtnis ziehen. Pflege
// bleibt bewusst manuell über den bestehenden 💬-Mechanismus, keine neue Datenstruktur nötig.
// Details zu Gate-Kriterien bleiben in skill-reha-management.md — hier nur der Kurzstatus.
function latestRehaStatusLine() {
  const rehaNotes = (_notes || [])
    .filter(n => n.type === 'trainer-summary' && n.trainer === 'reha' && n.date)
    .sort((a,b) => b.date.localeCompare(a.date));
  if (!rehaNotes.length) return 'unverändert';
  // Sicherheitsnetz: nur die erste Zeile der Notiz, falls sie doch mal mehrzeilig verfasst wird —
  // die Notiz selbst soll bereits als Ein-Satz-Status geschrieben werden (Details in skill-reha-management.md).
  const firstLine = rehaNotes[0].body.split('\n').map(l => l.trim()).find(l => l);
  return (firstLine || 'unverändert').replace(/\*\*/g, '').replace(/^[-•]\s*/, '');
}

async function copyNoteForClaude() {
  const body  = document.getElementById('noteEditorContent').value.trim();
  const moodSel = document.getElementById('moodPicker').dataset.selected;
  const mood  = moodSel ? parseInt(moodSel) : null;
  const dateLong = new Date().toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });

  const text = id => document.getElementById(id)?.textContent.trim() || '—';

  const stepsOn = d => { const w = (_wellnessFull || []).find(x => x.id === fmtDate(d)); return w ? wellnessSteps(w) : null; };
  const stepsYesterday = stepsOn(daysAgo(1));
  const stepsDayBefore = stepsOn(daysAgo(2));

  const todaySessions = getPlanSessionsFor(fmtDate(new Date()));
  const todayPlan = todaySessions.length
    ? todaySessions.map(s => s.type + (s.min ? ` (${s.min} min)` : '')).join(', ')
    : 'Ruhetag';

  const lines = [
    `Morgen-Check — ${dateLong}`,
    '',
    `HRV: ${text('cockpitHRV')} · Ruhepuls: ${text('cockpitRHF')} · Schlaf: ${mood ? MOOD_OPTIONS.find(m=>m.v===mood)?.l : '—'}`,
    `Reha: ${latestRehaStatusLine()}`,
    `Job-Belastung gestern: ${stepsYesterday ?? '—'} (Vortag: ${stepsDayBefore ?? '—'})`,
    `Heute geplant: ${todayPlan}`,
    `Befinden: ${body || '—'}`,
  ];

  const btn = document.getElementById('copyNoteBtn');
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    btn.textContent = '✓ Kopiert!';
    setTimeout(() => { btn.textContent = '✦ Morgen-Check + Notiz für Claude kopieren'; }, 2500);
  } catch(e) { alert('Kopieren fehlgeschlagen.'); }
}

// ─── Note Viewer ──────────────────────────────────────────────────────────────

// Löscht die im Editor gerade bearbeitete (bestehende) Notiz aus dem GitHub-Repo
async function deleteEditingNote() {
  if (!_editingNote) return;
  const title = _noteEditorTitle || 'Notiz';
  if (!confirm(`Notiz "${title}" wirklich löschen?`)) return;
  try {
    await deleteNoteFromGH(_editingNote.filename, _editingNote.sha);
    _notes = _notes.filter(x => x.filename !== _editingNote.filename);
    closeNoteEditor();
    refreshCockpitMoodTile();
    renderFromCache();
  } catch(e) {
    const errEl = document.getElementById('noteEditorError');
    errEl.textContent = 'Fehler beim Löschen: ' + e.message;
    errEl.style.display = 'block';
  }
}

// ─── Trainer-Zusammenfassungen ─────────────────────────────────────────────────
// Kurzfassung der Trainer-Rückmeldung aus dem Claude.ai-Coaching-Chat, manuell zurück ins
// training-notes-Repo geschrieben (eigene Datei pro Zusammenfassung, type:'trainer-summary').
// Ergänzt die Journal-Notizen, ersetzt sie nicht — ein Tag kann eine eigene Tagesnotiz UND eine
// oder mehrere Trainer-Zusammenfassungen haben.

function trainerNotesFor(dayStr) {
  return [..._notes].filter(n => n.type === 'trainer-summary' && n.date && n.date.slice(0,10) === dayStr);
}

function trainerLabel(slug) { return TRAINER_OPTIONS.find(t => t.v === slug)?.l || slug; }

let _trainerNoteDay = null;

function openTrainerNoteModal(dateStr) {
  if (!ghToken || !ghRepo) { openSettingsModal(); return; }
  _trainerNoteDay = dateStr || fmtDate(new Date());
  document.getElementById('trainerNoteDateDisplay').textContent = new Date(_trainerNoteDay + 'T00:00').toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  document.getElementById('trainerNoteContent').value = '';
  document.getElementById('trainerNoteError').style.display = 'none';
  document.getElementById('trainerNoteModal').style.display = 'flex';
}

function closeTrainerNoteModal() {
  document.getElementById('trainerNoteModal').style.display = 'none';
  _trainerNoteDay = null;
}

async function saveTrainerNoteModal() {
  const dateVal = _trainerNoteDay || fmtDate(new Date());
  const rawBody = document.getElementById('trainerNoteContent').value.trim();
  const errEl = document.getElementById('trainerNoteError');
  if (!rawBody) { errEl.textContent = 'Zusammenfassung darf nicht leer sein.'; errEl.style.display = 'block'; return; }
  const date = dateVal + 'T' + nowLocalISO().slice(11,16);
  const sections = splitTrainerSections(rawBody);
  try {
    for (let i = 0; i < sections.length; i++) {
      const { trainer, body } = sections[i];
      const title = `${trainerLabel(trainer)}-Zusammenfassung`;
      const content = buildNoteContent(body, trainer, title, date, null, true);
      const filename = `${Date.now() + i}-trainer-${trainer}.md`;
      const res = await saveNoteToGH(filename, content, null);
      _notes.unshift({ filename, sha: res.content.sha, trainer, title, date, mood: null, type: 'trainer-summary', body });
    }
    closeTrainerNoteModal();
    renderFromCache();
  } catch(e) {
    errEl.textContent = 'Fehler beim Speichern: ' + e.message;
    errEl.style.display = 'block';
  }
}

let _trainerNotesViewerDay = null;

function openTrainerNotesViewer(dateStr) {
  _trainerNotesViewerDay = dateStr;
  const notes = trainerNotesFor(dateStr).sort((a,b) => a.date.localeCompare(b.date));
  document.getElementById('trainerNotesViewerDate').textContent = new Date(dateStr + 'T00:00').toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  document.getElementById('trainerNotesViewerList').innerHTML = notes.map(n => `
    <div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px">
      <div style="font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:0.04em">${trainerLabel(n.trainer)}</div>
      <div style="font-size:13px;white-space:pre-wrap;margin-top:4px">${escHtml(n.body)}</div>
    </div>`
  ).join('') || '<div class="setup-hint">Keine Trainer-Zusammenfassungen für diesen Tag.</div>';
  document.getElementById('trainerNotesViewerModal').style.display = 'flex';
}

function closeTrainerNotesViewer() {
  document.getElementById('trainerNotesViewerModal').style.display = 'none';
  _trainerNotesViewerDay = null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Ein-/Ausblenden-Status der Legenden-Datensätze im Trainingsbelastung-Chart (per Label persistiert),
// damit ein per Legende ausgeblendeter Wert (z.B. HRV) beim Zeitraum-Wechsel oder Reload nicht wieder
// auftaucht — Chart.js selbst haelt diesen Status nur am Chart-Objekt, das bei jedem Neuzeichnen neu entsteht.
function getFitnessChartHidden() {
  try { return JSON.parse(localStorage.getItem('fitnessChartHidden')) || {}; } catch { return {}; }
}
function setFitnessChartHidden(label, hidden) {
  const h = getFitnessChartHidden();
  if (hidden) h[label] = true; else delete h[label];
  localStorage.setItem('fitnessChartHidden', JSON.stringify(h));
}

function makeFitnessChart(fitness, hrvByDate, rhfByDate, loadByDate, respByDate) {
  const labels=fitness.map(d=>fmtAxisDate(d.date));
  const datasets=[];
  if (loadByDate) {
    datasets.push({type:'bar',label:'Belastung (Ist)',data:fitness.map(d=>loadByDate[d.date]||0),backgroundColor:'rgba(59,130,246,0.25)',borderWidth:0,order:3});
  }
  datasets.push(
    {type:'line',label:'Fitness (CTL)',data:fitness.map(d=>d.ctl?Math.round(d.ctl):null),borderColor:'#3b82f6',backgroundColor:'transparent',borderWidth:2,pointRadius:1.5,pointHoverRadius:4,pointBorderWidth:1,tension:0.4,order:1},
    {type:'line',label:'Fatigue (ATL)',data:fitness.map(d=>d.atl?Math.round(d.atl):null),borderColor:'#dc2626',backgroundColor:'transparent',borderWidth:2,borderDash:[6,3],pointRadius:1.5,pointHoverRadius:4,pointBorderWidth:1,tension:0.4,order:1},
    {type:'line',label:'Form (TSB)',   data:fitness.map(d=>d.tsb?Math.round(d.tsb):null),borderColor:'#d97706',backgroundColor:'transparent',borderWidth:2,borderDash:[2,2],pointRadius:1.5,pointHoverRadius:4,pointBorderWidth:1,tension:0.4,order:1},
  );
  const options = lineOptions();
  options.interaction = crosshairInteraction();
  options.plugins.legend.position = 'top';
  options.plugins.legend.align = 'center';
  options.plugins.legend.labels.boxWidth = 18;
  options.plugins.legend.labels.boxHeight = 2;
  options.plugins.legend.labels.padding = 18;
  options.plugins.legend.labels.usePointStyle = false;
  options.scales.y.position = 'left';
  options.scales.y.suggestedMin = -20;
  options.scales.y.suggestedMax = 60;
  options.scales.y.grace = '20%';
  options.scales.y.ticks.stepSize = 20;
  options.scales.x.stacked = false;
  options.scales.y.grid.color = ctx => ctx.tick?.value === 0 ? 'rgba(100,100,100,0.6)' : CHART_GRID;
  options.scales.y.grid.lineWidth = ctx => ctx.tick?.value === 0 ? 2 : 1;
  if (hrvByDate) {
    datasets.push({type:'line',label:'HRV',data:fitness.map(d=>hrvByDate[d.date]||null),borderColor:'#10b981',backgroundColor:'transparent',borderWidth:2,borderDash:[1,3],pointRadius:1.5,pointHoverRadius:4,pointBorderWidth:1,tension:0.4,spanGaps:true,order:1});
  }
  if (rhfByDate) {
    datasets.push({type:'line',label:'Ruhepuls',data:fitness.map(d=>rhfByDate[d.date]||null),borderColor:'#06b6d4',backgroundColor:'transparent',borderWidth:2,borderDash:[8,2,2,2],pointRadius:1.5,pointHoverRadius:4,pointBorderWidth:1,tension:0.4,spanGaps:true,order:1});
  }
  if (respByDate) {
    datasets.push({type:'line',label:'Ø Atmung/Min',data:fitness.map(d=>respByDate[d.date]||null),borderColor:'#f472b6',backgroundColor:'transparent',borderWidth:2,borderDash:[3,3],pointRadius:1.5,pointHoverRadius:4,pointBorderWidth:1,tension:0.4,spanGaps:true,order:1});
  }
  const hiddenMap = getFitnessChartHidden();
  datasets.forEach(d => { if (hiddenMap[d.label]) d.hidden = true; });
  options.plugins.legend.onClick = (evt, legendItem, legend) => {
    const chart = legend.chart;
    const wasVisible = chart.isDatasetVisible(legendItem.datasetIndex);
    chart.setDatasetVisibility(legendItem.datasetIndex, !wasVisible);
    setFitnessChartHidden(legendItem.text, wasVisible);
    chart.update();
  };
  const todayLabel = fmtAxisDate(fmtDate(new Date()));
  const todayIndex = labels.indexOf(todayLabel);
  const plugins = [];
  if (todayIndex >= 0) {
    plugins.push({
      id: 'todayMarker',
      afterDraw(chart) {
        const xScale = chart.scales.x;
        const {top, bottom} = chart.chartArea;
        const x = xScale.getPixelForValue(todayIndex);
        const ctx = chart.ctx;
        ctx.save();
        ctx.strokeStyle = 'rgba(100,100,100,0.6)';
        ctx.setLineDash([4,4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
        ctx.restore();
      }
    });
  }
  plugins.push(hoverCrosshairPlugin());
  return {type:'line',data:{labels,datasets},options,plugins};
}

function respirationRate(act) {
  const manual = getManualRespiration()[act.id];
  if (manual != null) return manual;
  // Fallback, falls Intervals.icu die Atemfrequenz doch einmal direkt mitliefert (Feldname unbestätigt)
  return act.icu_average_respiration ?? act.average_respiration ?? act.icu_respiration_rate ?? act.respiration_rate ?? null;
}

function journalByDateMap() {
  const map = {};
  [..._notes, ..._localDayNotes].forEach(n => {
    if (!n.date || n.type === 'trainer-summary') return;
    const day = n.date.slice(0,10);
    if (!(day in map)) map[day] = n;
  });
  return map;
}

function statChip(label, valueHtml) {
  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:48px">
    <span style="font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:0.04em">${label}</span>
    <span class="mono" style="font-size:12px;display:flex;align-items:center;justify-content:center;min-height:18px">${valueHtml}</span>
  </div>`;
}

function renderActivityTable(activities, containerId, limit=null, journalByDate=null) {
  const el=document.getElementById(containerId); if(!el) return;
  const list=limit?activities.slice(0,limit):activities;
  if(!list.length){el.innerHTML='<div class="loading">Keine Aktivitäten</div>';return;}

  let lastYear = null;
  el.innerHTML = list.map(a => {
    const isNoteOnly = a._noteOnly === true;
    const activityDate = new Date(a.start_date_local);
    const year = activityDate.getFullYear();
    const yearDivider = year !== lastYear
      ? `<div style="display:flex;align-items:center;gap:14px;margin:${lastYear!==null?'26px':'4px'} 0 12px;color:var(--text);font-size:20px;font-weight:700;letter-spacing:0.02em">${lastYear!==null?'<div style="flex:1;height:2px;background:var(--border)"></div>':''}<span class="mono">${year}</span><div style="flex:1;height:2px;background:var(--border)"></div></div>`
      : '';
    lastYear = year;
    const date=activityDate.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});
    const km=a.distance?(a.distance/1000).toFixed(1)+' km':'—';
    const dur=a.moving_time?formatDur(a.moving_time):'—';
    const hr=a.average_heartrate?Math.round(a.average_heartrate)+' bpm':'—';
    const watts=isNoteOnly?null:(a.icu_weighted_avg_watts||a.icu_average_watts||a.average_watts);
    const wattVal=watts?Math.round(watts)+' W':'—';
    const resp=respirationRate(a);
    const respVal=isNoteOnly?'—':(resp!=null?Math.round(resp)+'/min':'—');
    const elev=a.total_elevation_gain?Math.round(a.total_elevation_gain)+' m':'—';
    const nameVal = isNoteOnly ? '<span style="color:var(--text2)">Ruhetag</span>' : escHtml(a.name||normalizeType(a.type));
    const typName = normalizeType(a.type);
    const typColor = TYPE_COLORS[typName] || '#94a3b8';
    const typVal = isNoteOnly ? '<span style="color:var(--text2)">—</span>' : `<span class="tag" style="background:${typColor}20;color:${typColor}">${typName}</span>`;
    const dayKey = fmtDate(new Date(a.start_date_local));

    // Trainer-Zusammenfassungen sind separate Notizen, unabhängig von der Tagesnotiz (die jetzt
    // ausschließlich unter Wellness gelesen/bearbeitet wird, siehe renderWellnessDayList) — eigener
    // klickbarer Chip, falls für den Tag mindestens eine vorliegt.
    let trainerChipHtml = '';
    if (journalByDate) {
      const trainerCount = trainerNotesFor(dayKey).length;
      if (trainerCount) {
        trainerChipHtml = `<span style="cursor:pointer;font-size:10px;color:var(--text2);display:inline-block" onclick="event.stopPropagation();openTrainerNotesViewer('${dayKey}')" title="Trainer-Zusammenfassungen anzeigen">💬 ${trainerCount}</span>`;
      }
    }
    // RPE, Trainingsbefinden und Bemerkung jetzt pro Aktivität (activity_meta) — bei Ruhetagen unter
    // derselben stabilen "note-<Datum>"-id wie im Detail-Fenster (openActivityModal).
    const meta = getActivityMetaFor(a.id);
    const rpeVal = meta.rpe!=null ? `<span style="color:hsl(${rpeHue(meta.rpe)},70%,45%);font-weight:600">${meta.rpe}</span>` : '—';
    const feelVal = meta.feel!=null ? moodIcon(meta.feel,16) : '—';
    const remark = meta.note ? escHtml(meta.note) : '';

    return `${yearDivider}<div class="note-card" style="cursor:pointer;flex-wrap:wrap;row-gap:10px" onclick="openActivityModal('${a.id}')" title="Details & Bewertung öffnen">
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-start;min-width:70px">
        <span class="mono" style="font-size:12px">${date}</span>
      </div>
      <div style="display:flex;flex-direction:column;width:150px;flex-shrink:0">
        <span style="font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:0.04em">Aktivität</span>
        <span style="font-size:12px;font-weight:600;min-height:18px;line-height:1.3;word-break:break-word">${nameVal}</span>
        ${remark?`<span style="font-size:10px;color:var(--text2);line-height:1.3;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${remark}">✎ ${remark}</span>`:''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-start;min-width:60px">
        <span style="font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:0.04em">Typ</span>
        <span style="display:flex;align-items:center;min-height:18px">${typVal}</span>
      </div>
      ${statChip('Distanz', km)}
      ${statChip('Zeit', dur)}
      ${statChip('Ø HF', hr)}
      ${statChip('Ø Watt', wattVal)}
      ${statChip('Atmung', respVal)}
      ${statChip('Höhe', elev)}
      ${journalByDate?statChip('Anstreng.', rpeVal):''}
      ${journalByDate?statChip('Befinden', feelVal):''}
      ${trainerChipHtml?`<div class="trend-kpi-sep" style="min-height:32px"></div><div style="display:flex;align-items:center;gap:8px;margin-left:auto">${trainerChipHtml}</div>`:''}
    </div>`;
  }).join('');
}

if (window.Chart) {
  Chart.defaults.animation = false;
  Chart.defaults.transitions.active.animation.duration = 0;
}

function renderChart(id, config) {
  const canvas=document.getElementById(id); if(!canvas) return;
  if(charts[id])charts[id].destroy();
  charts[id]=new Chart(canvas,config);
}

function lineOptions() {
  return {maintainAspectRatio:false,layout:{padding:{top:8,bottom:4}},plugins:{legend:{labels:{font:{family:CHART_FONT,size:11},color:CHART_TEXT}}},scales:{x:{grid:{color:CHART_GRID},ticks:{font:{family:CHART_FONT,size:10},color:CHART_TEXT,maxTicksLimit:8}},y:{grace:'10%',grid:{color:CHART_GRID},ticks:{font:{family:CHART_FONT,size:10},color:CHART_TEXT}}}};
}

// Graue Hilfslinie, die der Maus/dem Finger frei folgt (nicht ans Datenpunkt-Raster gebunden) —
// gemeinsam genutzt von allen Charts, die Werte per Tooltip an der Cursor-Position zeigen sollen.
function hoverCrosshairPlugin() {
  return {
    id: 'hoverCrosshair',
    // Chart.js leitet standardmäßig nur mousemove/mouseout/click/touchstart/touchmove an Plugins
    // weiter (chart.options.events) — touchend/touchcancel sind NICHT dabei. Ohne eigenen,
    // direkt am Canvas registrierten Listener bleibt der Crosshair auf Touch-Geräten nach dem
    // Anheben des Fingers stehen, weil das Plugin das "Loslassen" nie mitbekommt.
    afterInit(chart) {
      // Chart.js selbst kennt touchend/touchcancel ebenfalls nicht (siehe afterEvent-Kommentar
      // unten) — ohne die Zeilen hier bleibt zusätzlich zur grauen Linie auch der eingebaute
      // Tooltip (Werte-Box) nach dem Loslassen sichtbar hängen, weil Chart.js dessen internen
      // Hover-/Active-Elements-Status nie zurücksetzt.
      // Immer bedingungslos zuruecksetzen statt erst chart.tooltip.opacity>0 zu pruefen: bei einem
      // schnellen Tap (ohne Ziehen) feuert touchend teils bevor die Tooltip-Fade-in-Animation
      // ueberhaupt gestartet ist (opacity noch 0) — die Pruefung liess das Zuruecksetzen dann
      // aus, die Animation zeigte das Tooltip danach ungestoert an, ohne dass es je wieder verschwand.
      const clear = () => {
        chart._crosshairX = null;
        chart.setActiveElements([]);
        chart.tooltip.setActiveElements([], {x:0, y:0});
        chart.update();
      };
      chart._crosshairClear = clear;
      chart._crosshairCanvas = chart.canvas;
      chart.canvas.addEventListener('touchend', clear, {passive:true});
      chart.canvas.addEventListener('touchcancel', clear, {passive:true});
    },
    afterDestroy(chart) {
      if (chart._crosshairClear && chart._crosshairCanvas) {
        chart._crosshairCanvas.removeEventListener('touchend', chart._crosshairClear);
        chart._crosshairCanvas.removeEventListener('touchcancel', chart._crosshairClear);
      }
    },
    afterEvent(chart, args) {
      const e = args.event;
      if (e.type === 'mousemove' || e.type === 'touchmove') {
        const {left, right, top, bottom} = chart.chartArea;
        chart._crosshairX = (e.x >= left && e.x <= right && e.y >= top && e.y <= bottom) ? e.x : null;
        args.changed = true;
      } else if (e.type === 'mouseout' || e.type === 'click') {
        // iOS loest bei einem reinen Tap (ohne Wischen) ~300ms nach touchend zusaetzlich ein
        // synthetisches "click"-Event aus. Chart.js selbst reagiert darauf (click steht in seiner
        // Standard-Event-Liste) und aktiviert erneut Hover-Elemente -> Tooltip erscheint wieder,
        // nachdem unser touchend-Fix es bereits geschlossen hatte. Deshalb hier nicht nur die
        // eigene Crosshair-Linie, sondern auch Chart.js' aktive Elemente/Tooltip explizit leeren.
        chart._crosshairX = null;
        chart.setActiveElements([]);
        chart.tooltip.setActiveElements([], {x:0, y:0});
        args.changed = true;
      }
    },
    afterDraw(chart) {
      if (chart._crosshairX == null) return;
      const {top, bottom} = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = 'rgba(100,100,100,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(chart._crosshairX, top);
      ctx.lineTo(chart._crosshairX, bottom);
      ctx.stroke();
      ctx.restore();
    }
  };
}

// Tooltip zeigt alle Werte an der x-Position, unabhängig vom vertikalen Abstand zur Linie —
// wichtig fürs iPad, wo exaktes Treffen einer dünnen Linie mit dem Finger unzuverlässig ist.
function crosshairInteraction() {
  return {mode:'index', intersect:false, axis:'x'};
}

function fmtAxisDate(id) { const [y,m,d] = id.split('-'); return `${d}.${m}.${y.slice(2)}`; }
function fmtNum(n) { return n == null ? n : n.toLocaleString('de-DE'); }
function sortedWellness(w) { return [...w].sort((a,b)=>a.id>b.id?1:-1); }
function avg(arr) { return arr.length?arr.reduce((s,v)=>s+v,0)/arr.length:0; }

// HRV-Bewertung nach individuellen SD-Bändern (Plews-Methode, ln-transformiert), Stand 25.07.2026.
function formatDur(secs) { const h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60); return h>0?`${h}h ${m}m`:`${m}m`; }
function normalizeType(type) {
  if(!type) return 'Mobilität';
  if(type.match(/Run|Lauf/i)) return 'Laufen';
  if(type.match(/Mountain|Ride|Cycling|Bike/i)) return 'Rad';
  if(type.match(/Weight|Workout|Strength|Kraft/i)) return 'Kraft';
  if(type.match(/Breathwork|Atmung/i)) return 'Atmung';
  return 'Mobilität';
}
function daysAgo(n) { const d=new Date(); d.setDate(d.getDate()-n); return d; }
function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function getWeek(date) {
  const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));
  d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));
  return Math.ceil((((d-new Date(Date.UTC(d.getUTCFullYear(),0,1)))/86400000)+1)/7);
}

// Bei Reload: automatisch einloggen wenn Session noch gültig (muss am Ende stehen — nach allen const-Deklarationen)
if (localStorage.getItem('tb_pw_hash') && isSessionValid()) {
  unlockApp(true); // Reload: Position beibehalten
}
