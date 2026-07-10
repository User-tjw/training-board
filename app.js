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
// Nur "echte" Trainingsarten werden zu Intervals.icu (und damit an Garmin Connect) übertragen.
// Ruhetag/Krankheit/Atmung/Mobilität bleiben rein lokal in Training Board.
const PLAN_TO_ICU_TYPE = { Laufen: 'Run', Rad: 'Ride', Kraft: 'WeightTraining' };

// Legt/aktualisiert das zugehörige Intervals.icu-Event für eine geplante Einheit (falls Typ unterstützt).
// Gibt die Session mit gesetzter/entfernter icuEventId zurück; scheitert lautlos (Konsole), damit
// lokales Speichern nie an einem ICU-Fehler hängen bleibt.
async function syncSessionToICU(dateStr, session) {
  const icuType = PLAN_TO_ICU_TYPE[session.type];
  if (!icuType) {
    // Typ wurde auf einen nicht übertragbaren geändert (z.B. Laufen → Ruhetag) → verwaistes Event entfernen
    if (session.icuEventId) { await deleteSessionFromICU(session); delete session.icuEventId; }
    return session;
  }
  const body = {
    category: 'WORKOUT',
    start_date_local: `${dateStr}T00:00:00`,
    type: icuType,
    name: session.note || session.type,
    moving_time: session.min ? session.min * 60 : undefined,
    // Reine Zeitangabe (moving_time) allein erzeugt keine Workout-Struktur (workout_doc.steps bleibt leer) —
    // Garmin Connect pusht aber offenbar nur strukturierte Workouts. Ein Schritt in Intervals.icus
    // Text-Workout-Syntax reicht, um beim Anlegen echte Steps zu erzeugen.
    description: session.min ? `- ${session.min}m` : undefined,
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
// Löscht ein Event, das nicht von Training Board angelegt wurde (direkt in ICU oder via Garmin geplant),
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
// Wandelt ein von Intervals.icu geladenes Event (nicht durch Training Board angelegt, z.B. direkt
// in ICU oder via Garmin geplant) in eine anzeigbare, schreibgeschützte Plan-Session um.
function icuEventToPlanSession(ev) {
  const type = normalizeType(ev.type || '');
  if (!PLAN_TO_ICU_TYPE[type]) return null;
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

let _settingsReturnSection = 'cockpit';
function openSettingsPage() {
  const current = document.querySelector('.nav-item.active');
  _settingsReturnSection = current ? current.dataset.section : 'cockpit';
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-settings').classList.add('active');
  document.getElementById('pageTitle').textContent = 'Einstellungen';
  populateSettingsForm();
}
function closeSettingsPage() {
  const item = document.querySelector(`.nav-item[data-section="${_settingsReturnSection}"]`) || document.querySelector('.nav-item[data-section="cockpit"]');
  item.click();
}
function populateSettingsForm() {
  document.getElementById('settingsAthleteId').value = athleteId;
  document.getElementById('settingsApiKey').value = apiKey;
  document.getElementById('settingsGhToken').value = ghToken;
  document.getElementById('settingsGhRepo').value = ghRepo;
  const plan = getTrainingPlan();
  document.getElementById('settingsTrainingGoal').value = plan.trainingGoal || '';
  document.getElementById('settingsGoalWeekHours').value = plan.weekHours ?? '';
  document.getElementById('settingsGoalLaufenPct').value = plan.byTypePct?.Laufen ?? '';
  document.getElementById('settingsGoalRadPct').value = plan.byTypePct?.Rad ?? '';
  document.getElementById('settingsGoalKraftPct').value = plan.byTypePct?.Kraft ?? '';
  document.getElementById('settingsGoalMobilitaetPct').value = plan.byTypePct?.['Mobilität'] ?? '';
  updateGoalPctHint();
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
  loadAll();
  closeSettingsPage();
}

function saveTrainingGoals() {
  const trainingGoal = document.getElementById('settingsTrainingGoal').value.trim();

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
  const plan = { weekHours, byTypePct, byType, trainingGoal, updatedAt: Date.now() };
  localStorage.setItem('training_plan', JSON.stringify(plan));
  if (ghToken && ghRepo) {
    saveTrainingPlanToGH(plan).catch(e => alert('Speichern bei GitHub fehlgeschlagen: ' + e.message + '\n\nDer Wert ist trotzdem lokal in diesem Browser gespeichert.'));
  }

  renderCockpitWeek();
  closeSettingsPage();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

const CHART_FONT = 'JetBrains Mono';
const CHART_GRID = '#dde2ea';
const CHART_TEXT = '#64748b';
let charts = {};

function init() {
  document.getElementById('dateLabel').textContent =
    `KW${getWeek(new Date())} · ` + new Date().toLocaleDateString('de-DE', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  setupNav();
  applyHfZonesToInputs();
  updateZones();
  syncTrainingPlanFromGH();
  syncManualRespirationFromGH();
  syncActivityMetaFromGH();
  syncPlanSessionsFromGH();
  syncHiddenActivitiesFromGH();
  syncHfZonesFromGH();
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

async function loadAll() {
  const maxDays = 400; // deckt die größte wählbare Kachel-Spanne ("Alle" = 365) mit Puffer ab
  applyStoredRanges();

  try {
    const [wellnessFull, activitiesFull, eventsFull] = await Promise.all([
      icuFetch(`/athlete/${athleteId}/wellness?oldest=${fmtDate(daysAgo(maxDays))}`),
      icuFetch(`/athlete/${athleteId}/activities?oldest=${fmtDate(daysAgo(maxDays))}`),
      // geplante Events (WORKOUT) aus Intervals.icu — inkl. dort/via Garmin direkt angelegter, nicht nur der von Training Board gepushten
      icuFetch(`/athlete/${athleteId}/events?oldest=${fmtDate(daysAgo(7))}&newest=${fmtDate(daysAgo(-60))}&category=WORKOUT`),
    ]);

    if (ghToken && ghRepo && _notes.length === 0) _notes = await loadNotes();

    _wellnessFull = wellnessFull;
    _activitiesFull = filterHiddenActivities(activitiesFull); // ausgeblendete Aktivitäten (nur lokal, intervals.icu bleibt unberührt)
    _icuEventsFull = eventsFull;
    // CTL/ATL/TSB aus Wellness-Daten extrahieren (wie im Original-Backend)
    _fitnessFull = wellnessFull
      .filter(d => d.ctl != null || d.atl != null)
      .map(d => ({
        date: d.id,
        ctl: parseFloat((d.ctl || 0).toFixed(1)),
        atl: parseFloat((d.atl || 0).toFixed(1)),
        tsb: parseFloat(((d.ctl || 0) - (d.atl || 0)).toFixed(1)),
      }));

    setStatus(true);
    renderCockpitStatus(wellnessFull, _fitnessFull, _activitiesFull);
    renderFromCache();
  } catch(err) {
    console.error(err);
    setStatus(false);
  }
}

function setStatus(ok) {
  document.getElementById('statusDot').className = 'status-dot ' + (ok ? 'live' : 'error');
  document.getElementById('statusText').textContent = ok ? 'Verbunden' : 'Fehler';
}

// ─── Cockpit ─────────────────────────────────────────────────────────────────

const TYPE_COLORS = {Laufen:'#3b82f6',Rad:'#10b981',Kraft:'#8b5cf6',Atmung:'#06b6d4',Mobilität:'#f59e0b'};
// Plan-Typen = Trainingsarten + Sonderfälle (kein echtes Training). Eigene Farben für die Sonderfälle.
const PLAN_EXTRA_COLORS = {Ruhetag:'#94a3b8', Krankheit:'#dc2626'};
const PLAN_TYPES = [...Object.keys(TYPE_COLORS), 'Ruhetag', 'Krankheit'];
function planTypeColor(t) { return TYPE_COLORS[t] || PLAN_EXTRA_COLORS[t] || '#94a3b8'; }

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

  function mainBenefit(act, type) {
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

  // Eine Aktivität als abgerundeter, klickbarer Balken (öffnet das Aktivitäten-Fenster)
  function activityBar(act) {
    const type = normalizeType(act.type);
    const color = TYPE_COLORS[type] || '#94a3b8';
    const km = act.distance ? (act.distance/1000).toFixed(1)+' km' : '';
    const dur = act.moving_time ? formatDur(act.moving_time) : '';
    const hr = act.average_heartrate ? Math.round(act.average_heartrate)+' bpm' : '';
    const benefit = mainBenefit(act, type);
    const meta = getActivityMetaFor(act.id);
    const rpeBadge = meta.rpe ? `<span class="wc-bar-rpe" style="background:hsl(${rpeHue(meta.rpe)},70%,45%)" title="RPE ${meta.rpe}/10">${meta.rpe}</span>` : '';
    const stats = [km, dur, hr, benefit].filter(Boolean).join(' · ');
    return `<div class="wc-bar" style="background:${color}1a;--wc-c:${color}" onclick="openActivityModal('${act.id}')" title="Details &amp; Bewertung öffnen">
      <div class="wc-bar-top"><span class="wc-bar-type">${type.toUpperCase()}</span>${rpeBadge}</div>
      <div class="wc-bar-name">${escHtml(act.name || type)}</div>
      ${stats ? `<div class="wc-bar-sub">${stats}</div>` : ''}
    </div>`;
  }

  // Geplante Einheit als „Geister-Balken" (gestrichelt). done = es gab an dem Tag eine echte Einheit gleichen Typs.
  // ICU-Herkunft (direkt in Intervals.icu oder via Garmin geplant, nicht durch Training Board) ist schreibgeschützt.
  function planBar(dayStr, s, done) {
    const color = planTypeColor(s.type);
    const readOnly = s.source === 'icu';
    const sub = [s.min ? s.min + ' min' : '', done ? 'erledigt' : 'geplant'].filter(Boolean).join(' · ');
    // ICU-eigene Einträge sind nicht editierbar (kein lokales Session-Objekt), aber löschbar
    const click = readOnly
      ? `onclick="event.stopPropagation();deleteIcuOnlyEvent(${s.icuEventId})"`
      : `onclick="event.stopPropagation();openPlanModal('${dayStr}','${s.id}')"`;
    const tag = done ? '✓' : (readOnly ? 'ICU' : 'GEPLANT');
    const title = readOnly ? 'Aus Intervals.icu — klicken zum Löschen' : 'Geplante Einheit bearbeiten';
    return `<div class="wc-planbar${done?' done':''}" style="--wc-c:${color}" ${click} title="${title}">
      <div class="wc-bar-top"><span class="wc-planbar-type">${s.type.toUpperCase()}</span><span class="wc-planbar-tag">${tag}</span></div>
      ${s.note?`<div class="wc-bar-name">${escHtml(s.note)}</div>`:''}
      <div class="wc-bar-sub">${sub}</div>
    </div>`;
  }

  const head = days.map((d,i) => {
    const today = byDay[i].isToday;
    return `<div class="week-cal-head-cell${today?' today':''}">${dayNames[i]} ${d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}</div>`;
  }).join('') + `<div class="week-cal-head-cell week-cal-head-summary">DIESE WOCHE</div>`;

  // Pro Tag eine Spalte: echte Aktivitäten + geplante Einheiten (Geister-Balken) + „+ planen" + Tagessumme
  const dayCols = byDay.map(d => {
    const dayMin = Math.round(d.acts.reduce((s,a) => s+(a.moving_time||0), 0) / 60);
    const actualTypes = new Set(d.acts.map(a => normalizeType(a.type)));
    const planned = getPlanSessionsFor(d.dStr);
    const actualBars = d.acts.map(activityBar).join('');
    const planBars = planned.map(s => planBar(d.dStr, s, actualTypes.has(s.type))).join('');
    const empty = (!d.acts.length && !planned.length) ? `<div class="wc-empty">–</div>` : '';
    // „+ planen" nur für heute & zukünftige Tage
    const addBtn = d.dStr >= todayStr ? `<button class="wc-add" onclick="event.stopPropagation();openPlanModal('${d.dStr}')" title="Einheit planen">+ planen</button>` : '';
    const total = dayMin > 0 ? `<div class="wc-day-total">${dayMin} min</div>` : '';
    return `<div class="week-cal-daycol${d.isToday?' today':''}">${actualBars}${planBars}${empty}${addBtn}${total}</div>`;
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
  byDay.forEach(d => getPlanSessionsFor(d.dStr).forEach(s => { if (s.min) plannedMinByType[s.type] = (plannedMinByType[s.type]||0) + s.min; }));
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

  // HRV Ampel
  const hrv7 = hrvSeries.slice(-7).map(d => d.hrv).filter(Boolean);
  const hrv7avg = avg(hrv7);
  const todayHRV = latestHRV.hrv || 0;
  const pct = hrv7avg ? ((todayHRV - hrv7avg) / hrv7avg) * 100 : 0;

  let verdict, desc, cls;
  if (!todayHRV) {
    verdict = '● Keine HRV-Daten'; desc = 'Noch kein HRV-Wert für heute.'; cls = 'neutral';
  } else if (pct >= -3) {
    verdict = '● Bereit · Hart trainieren';
    desc = `HRV ${Math.round(todayHRV)} ms liegt im Bereich des 7-Tage-Ø (${Math.round(hrv7avg)} ms). Guter Tag für Qualitätseinheiten.`;
    cls = 'up';
  } else if (pct >= -10) {
    verdict = '● Moderat · Locker bleiben';
    desc = `HRV ${Math.round(todayHRV)} ms leicht unter dem 7-Tage-Ø (${Math.round(hrv7avg)} ms). Nur lockeres Training.`;
    cls = 'neutral';
  } else {
    verdict = '● Erholen · Ruhetag';
    desc = `HRV ${Math.round(todayHRV)} ms deutlich unter dem 7-Tage-Ø (${Math.round(hrv7avg)} ms). Erholung empfohlen.`;
    cls = 'down';
  }
  const vEl = document.getElementById('cockpitVerdict');
  vEl.textContent = verdict; vEl.className = 'trend-verdict ' + cls;
  document.getElementById('cockpitDesc').textContent = desc;

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

  const rhfDiff2 = (latestRHF.restingHR != null && prevRHF?.restingHR != null) ? Math.round(latestRHF.restingHR - prevRHF.restingHR) : null;
  const hrvDiff2 = (todayHRV && prevHRV?.hrv != null) ? Math.round(todayHRV - prevHRV.hrv) : null;
  let cardioDesc;
  if (rhfDiff2 == null || hrvDiff2 == null) {
    cardioDesc = 'Noch nicht genug Daten für eine Herz-Kreislauf-Einschätzung.';
  } else if (rhfDiff2 <= 0 && hrvDiff2 >= 0) {
    cardioDesc = `Ruhepuls ${rhfDiff2 < 0 ? 'sinkt' : 'stabil'}, HRV ${hrvDiff2 > 0 ? 'steigt' : 'stabil'} — das Herz-Kreislauf-System erholt sich gut.`;
  } else if (rhfDiff2 > 0 && hrvDiff2 < 0) {
    cardioDesc = 'Ruhepuls steigt, HRV sinkt — mehr Erholung einplanen.';
  } else {
    cardioDesc = 'Ruhepuls und HRV zeigen ein gemischtes Bild — weiter beobachten.';
  }
  document.getElementById('cockpitCardioDesc').textContent = cardioDesc;
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

  refreshCockpitMoodTile();

  // Trainingswoche (navigierbar) als Kalender (zwei Bänder: Ausdauer / Kraft)
  renderCockpitWeek();

  // HRV-Tagesstatus-Ampel: immer die letzten 7 echten Tage, unabhängig von der Kachel-Auswahl
  const hrv7data = hrvSeries.slice(-7);
  const hrv7rolling = hrv7data.map((d,i) => {
    const win = hrvSeries.slice(Math.max(0, hrvSeries.length-7+i-6), hrvSeries.length-7+i+1);
    return avg(win.map(w=>w.hrv).filter(Boolean));
  });
  document.getElementById('cockpitHRVDots').innerHTML = hrv7data.map((d,i) => {
    if (!d.hrv) return '<span style="color:#e2e8f0">●</span>';
    const p = hrv7rolling[i] ? ((d.hrv-hrv7rolling[i])/hrv7rolling[i])*100 : 0;
    const col = p >= -3 ? '#10b981' : p >= -10 ? '#f59e0b' : '#ef4444';
    const day = new Date(d.id).toLocaleDateString('de-DE',{weekday:'short'});
    return `<span title="${day}: ${Math.round(d.hrv)} ms" style="color:${col};cursor:default">●</span>`;
  }).join('');
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

  document.getElementById('avgHR').textContent = avg(actSlice.map(a=>a.average_heartrate).filter(Boolean)) ? Math.round(avg(actSlice.map(a=>a.average_heartrate).filter(Boolean))) : '—';
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
  const weightByDate = {};
  const sleepByDate = {};
  _wellnessFull.forEach(d => {
    if (d.weight != null) weightByDate[d.id] = d.weight;
    if (d.sleepSecs) sleepByDate[d.id] = d.sleepSecs;
  });
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
  renderActivityTable(merged,'allActivities',null,weightByDate,sleepByDate,journalByDate);

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
  ]},options:{layout:{padding:{top:8,bottom:4}},plugins:{legend:{labels:{font:{family:CHART_FONT,size:11},color:CHART_TEXT}}},scales:{x:{grid:{color:CHART_GRID},ticks:{font:{family:CHART_FONT,size:10},color:CHART_TEXT,maxTicksLimit:8}},y:{position:'left',grace:'10%',grid:{color:CHART_GRID},ticks:{font:{family:CHART_FONT,size:10},color:'#10b981'}},y1:{position:'right',grace:'10%',grid:{drawOnChartArea:false},ticks:{font:{family:CHART_FONT,size:10},color:'#3b82f6'}}}}});
  renderChart('sleepChart',{type:'bar',data:{labels,datasets:[{label:'Schlaf (h)',data:sorted.map(d=>d.sleepSecs?(d.sleepSecs/3600).toFixed(1):0),backgroundColor:'rgba(59,130,246,0.3)',borderColor:'#3b82f6',borderWidth:1,borderRadius:4}]},options:lineOptions()});
  const weightSorted=sorted.filter(d=>d.weight!=null);
  renderChart('weightChart',{type:'line',data:{labels:weightSorted.map(d=>fmtAxisDate(d.id)),datasets:[{label:'Gewicht (kg)',data:weightSorted.map(d=>d.weight),borderColor:'#8b5cf6',backgroundColor:'rgba(139,92,246,0.07)',borderWidth:2,pointRadius:2,tension:0.4,fill:true}]},options:lineOptions()});
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

// ─── Tagesnotizen lokal (Fallback ohne GitHub) ────────────────────────────────

let _localDayNotes = JSON.parse(localStorage.getItem('tb_day_notes') || '[]');

function saveLocalDayNotes() {
  localStorage.setItem('tb_day_notes', JSON.stringify(_localDayNotes));
}

function todaysMoodValue() {
  const todayStr = fmtDate(new Date());
  const all = [..._notes, ..._localDayNotes];
  const note = all.find(n => n.date && n.date.slice(0,10) === todayStr && n.mood);
  return note ? note.mood : null;
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
    throw new Error(err.message || `GitHub ${res.status}`);
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

function buildNoteContent(body, trainer, title, date, mood) {
  date = date || nowLocalISO();
  const moodLine = mood ? `\nmood: ${mood}` : '';
  return `---\ntrainer: ${trainer}\ntitle: ${title}\ndate: ${date}${moodLine}\n---\n\n${body}`;
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
    // Nacheinander statt Promise.all: viele parallele Requests an die GitHub-API können deren
    // Missbrauchserkennung (Secondary Rate Limit) auslösen und dann wie ein CORS-Fehler aussehen.
    const notes = [];
    for (const f of mdFiles) {
      const file = await ghFetch(`/repos/${ghRepo}/contents/${GH_NOTES_PATH}/${f.name}`);
      const { fm, body } = parseFrontmatter(b64dec(file.content));
      notes.push({ filename: f.name, sha: file.sha, trainer: fm.trainer || 'head-coach', title: fm.title || f.name.replace('.md',''), date: fm.date || '', mood: fm.mood ? parseInt(fm.mood) : null, rpe: fm.rpe ? parseInt(fm.rpe) : null, feel: fm.feel ? parseInt(fm.feel) : null, body });
    }
    return notes.sort((a,b) => b.date.localeCompare(a.date));
  } catch(e) {
    console.error('GitHub notes:', e);
    showGhSyncError(e.message);
    return [];
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

async function saveJSONToGH(ghPath, data, message) {
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
  const res = await ghFetch(`/repos/${ghRepo}/contents/${ghPath}`, { method:'PUT', body:JSON.stringify(payload) });
  _ghShaCache[ghPath] = res.content.sha;
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
function syncTrainingPlanFromGH() { return syncJSONFromGH(GH_PLAN_FILE, 'training_plan', getTrainingPlan, renderCockpitWeek); }
function saveManualRespirationToGH(data) { return saveJSONToGH(GH_RESPIRATION_FILE, data, 'Update Atmung-Daten'); }
function syncManualRespirationFromGH() { return syncJSONFromGH(GH_RESPIRATION_FILE, 'manual_respiration', getManualRespiration, renderFromCache); }
function saveActivityMetaToGH(data) { return saveJSONToGH(GH_ACTIVITY_META_FILE, data, 'Update Aktivitäts-Daten'); }
function syncActivityMetaFromGH() { return syncJSONFromGH(GH_ACTIVITY_META_FILE, 'activity_meta', getActivityMeta, renderFromCache); }
function savePlanSessionsToGH(data) { return saveJSONToGH(GH_PLAN_SESSIONS_FILE, data, 'Update Trainingsplan'); }
function syncPlanSessionsFromGH() { return syncJSONFromGH(GH_PLAN_SESSIONS_FILE, 'plan_sessions', getPlanSessions, renderCockpitWeek); }
function saveHfZonesToGH(zones) { return saveJSONToGH(GH_ZONES_FILE, zones, 'Update HF-Zonen'); }
function syncHfZonesFromGH() { return syncJSONFromGH(GH_ZONES_FILE, 'hf_zones', getHfZones, () => { applyHfZonesToInputs(); updateZones(); renderZonesGroup(); }); }

function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function nowLocalISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}


// ─── Note Editor ──────────────────────────────────────────────────────────────

// elId erlaubt mehrere Schlaf-Picker (Morgen-Check: 'moodPicker', Aktivitäten-Fenster: 'actMoodPicker')
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
let _activityModalDay = null;

function findActivityById(id) {
  return (_activitiesFull || []).find(a => String(a.id) === String(id))
      || (_cockpitActivitiesFull || []).find(a => String(a.id) === String(id))
      || null;
}

function openActivityModal(actId) {
  const act = findActivityById(actId);
  if (!act) return;
  _activityModalId = act.id;
  const type = normalizeType(act.type);
  const color = TYPE_COLORS[type] || '#94a3b8';
  document.getElementById('activityModalType').innerHTML = `<span class="tag" style="background:${color}20;color:${color}">${type}</span>`;
  document.getElementById('activityModalTitle').textContent = act.name || type;
  document.getElementById('activityModalDate').textContent = new Date(act.start_date_local).toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

  // Fixe Kennzahlen aus intervals.icu (nur Anzeige)
  const stats = [];
  if (act.distance) stats.push(['Distanz', (act.distance/1000).toFixed(1)+' km']);
  if (act.moving_time) stats.push(['Zeit', formatDur(act.moving_time)]);
  if (act.average_heartrate) stats.push(['Ø HF', Math.round(act.average_heartrate)+' bpm']);
  if (act.total_elevation_gain) stats.push(['Höhe', Math.round(act.total_elevation_gain)+' m']);
  const watts = act.icu_weighted_avg_watts || act.icu_average_watts || act.average_watts;
  if (watts) stats.push(['Ø Leistung', Math.round(watts)+' W']);
  if (act.icu_training_load) stats.push(['Load', Math.round(act.icu_training_load)]);
  document.getElementById('activityModalStats').innerHTML = stats.map(([l,v]) =>
    `<div class="activity-stat"><span class="activity-stat-label">${l}</span><span class="activity-stat-val">${v}</span></div>`
  ).join('') || '<div class="setup-hint">Keine Kennzahlen vorhanden.</div>';

  // Bewertungs-Felder: RPE/Befinden/Bemerkung aus activity_meta, Atmung aus manual_respiration
  const meta = getActivityMetaFor(act.id);
  renderRpePicker(meta.rpe || null);
  renderFeelPicker(meta.feel || null);
  document.getElementById('actNote').value = meta.note || '';
  const resp = getManualRespiration()[act.id];
  document.getElementById('actRespiration').value = resp != null ? resp : '';

  // Schlaf des Tages (pro Tag, aus der Tagesnotiz)
  _activityModalDay = fmtDate(new Date(act.start_date_local));
  const dayNote = [..._notes, ..._localDayNotes].find(n => n.date && n.date.slice(0,10) === _activityModalDay);
  renderMoodPicker(dayNote && dayNote.mood != null ? dayNote.mood : null, 'actMoodPicker');

  document.getElementById('activityModalError').style.display = 'none';
  document.getElementById('activityModal').style.display = 'flex';
}

function closeActivityModal() {
  document.getElementById('activityModal').style.display = 'none';
  _activityModalId = null;
  _activityModalDay = null;
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
  saveActivityMetaValue(_activityModalId, { rpe, feel, note });
  // Atmung läuft weiter über den bestehenden Atmungs-Speicher
  saveManualRespirationValue(_activityModalId, document.getElementById('actRespiration').value.trim());
  // Schlaf des Tages in die Tagesnotiz schreiben
  const moodSel = document.getElementById('actMoodPicker').dataset.selected;
  const mood = moodSel ? parseInt(moodSel) : null;
  try {
    if (_activityModalDay) await saveDayMood(_activityModalDay, mood);
  } catch(e) {
    const errEl = document.getElementById('activityModalError');
    errEl.textContent = 'Schlafdaten konnten nicht gespeichert werden: ' + e.message;
    errEl.style.display = 'block';
    return;
  }
  closeActivityModal();
  refreshCockpitMoodTile();
  renderFromCache();
}

// Schreibt die Schlafqualität in die Tagesnotiz (legt sie bei Bedarf an); GitHub- oder lokaler Modus
async function saveDayMood(dayStr, mood) {
  if (ghToken && ghRepo) {
    const existing = _notes.find(n => n.date && n.date.slice(0,10) === dayStr);
    if (!existing && mood == null) return;
    const title = existing ? existing.title : 'Tagesnotiz';
    const body  = existing ? existing.body : '';
    const date  = existing && existing.date ? existing.date : dayStr + 'T' + nowLocalISO().slice(11,16);
    const content  = buildNoteContent(body, existing ? existing.trainer : 'journal', title, date, mood);
    const filename = existing ? existing.filename : `${Date.now()}-journal.md`;
    const res = await saveNoteToGH(filename, content, existing ? existing.sha : null);
    if (existing) { existing.mood = mood; existing.sha = res.content.sha; }
    else { _notes.unshift({ filename, sha: res.content.sha, trainer:'journal', title, date, mood, body }); }
    return;
  }
  const existing = _localDayNotes.find(n => n.date && n.date.slice(0,10) === dayStr);
  if (existing) existing.mood = mood;
  else if (mood != null) _localDayNotes.unshift({ id: Date.now(), trainer:'head-coach', title:'Tagesnotiz', body:'', date: dayStr + 'T' + nowLocalISO().slice(11,16), mood });
  saveLocalDayNotes();
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
  document.getElementById('planDeleteBtn').style.display = s ? 'block' : 'none';
  document.getElementById('planModal').style.display = 'flex';
}

function closePlanModal() {
  document.getElementById('planModal').style.display = 'none';
  _planDay = null; _planId = null;
}

async function savePlanModal() {
  if (!_planDay) return;
  const type = document.getElementById('planType').value;
  const minRaw = document.getElementById('planMin').value.trim();
  const min = minRaw ? parseInt(minRaw) : null;
  const note = document.getElementById('planNote').value.trim();
  const existing = _planId ? getPlanSessionsFor(_planDay).find(s => s.id === _planId) : null;
  const icuEventId = existing && existing.icuEventId;
  await upsertPlanSession(_planDay, { id: _planId || 'p' + Date.now(), type, min, note, ...(icuEventId ? { icuEventId } : {}) });
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

function openNoteEditor(dateStr) {
  if (!ghToken || !ghRepo) { openSettingsPage(); return; }
  _noteEditorLocalMode = false;
  _editingLocalNoteId = null;
  const targetDate = dateStr || fmtDate(new Date());
  const existing = _notes.find(n => n.date && n.date.slice(0,10) === targetDate);
  _editingNote = existing ? { filename: existing.filename, sha: existing.sha, date: existing.date } : null;
  document.getElementById('noteEditorHeading').textContent = existing ? '✎ Morgen-Check bearbeiten' : '✎ Morgen-Check';
  document.getElementById('noteEditorTitleInput').value = existing ? existing.title : 'Tagesnotiz';
  document.getElementById('noteEditorDate').value = targetDate;
  document.getElementById('noteEditorContent').value = existing ? existing.body : '';
  renderMoodPicker(existing ? existing.mood : null);

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
  document.getElementById('noteEditorHeading').textContent = n ? '✎ Morgen-Check bearbeiten' : '✎ Morgen-Check';
  document.getElementById('noteEditorTitleInput').value = n ? n.title : 'Tagesnotiz';
  document.getElementById('noteEditorDate').value = n ? n.date.slice(0,10) : fmtDate(new Date());
  document.getElementById('noteEditorContent').value = n ? n.body : '';
  renderMoodPicker(n ? n.mood : null);
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
  const title   = document.getElementById('noteEditorTitleInput').value.trim();
  const body    = document.getElementById('noteEditorContent').value.trim();
  const dateVal = document.getElementById('noteEditorDate').value || fmtDate(new Date());
  const existing = _editingNote || (_editingLocalNoteId ? _localDayNotes.find(x => x.id === _editingLocalNoteId) : null);
  const timeVal  = existing && existing.date ? existing.date.slice(11, 16) : nowLocalISO().slice(11, 16);
  const date     = dateVal + 'T' + timeVal;
  const moodSel = document.getElementById('moodPicker').dataset.selected;
  const mood    = moodSel ? parseInt(moodSel) : null;
  const errEl   = document.getElementById('noteEditorError');
  if (!title) { errEl.textContent = 'Titel erforderlich.'; errEl.style.display='block'; return; }
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

async function copyNoteForClaude() {
  const title = document.getElementById('noteEditorTitleInput').value.trim();
  const body  = document.getElementById('noteEditorContent').value.trim();
  const moodSel = document.getElementById('moodPicker').dataset.selected;
  const mood  = moodSel ? parseInt(moodSel) : null;
  const dateVal = document.getElementById('noteEditorDate').value || fmtDate(new Date());
  const dateLong = new Date(dateVal + 'T00:00').toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });

  const text = id => document.getElementById(id)?.textContent.trim() || '—';
  const lines = [
    `# Tagesbericht — ${dateLong}`,
    `Athlet: Thomas Wagner | 50J | 74.6kg | FTP 250W | Max-HF 183`,
    '',
    '## Automatische Einschätzung (Training Board)',
    text('cockpitVerdict'),
    text('cockpitDesc'),
    '',
    '## Weitere Werte',
    `Ruhepuls: ${text('cockpitRHF')} bpm · Gewicht: ${text('cockpitWeight')} kg · CTL/ATL/TSB: ${text('cockpitCTL')}/${text('cockpitATL')}/${text('cockpitFormTSB')}`,
  ];

  // Letzte Trainingseinheiten (7 Tage) als Kontext für die Trainer-Empfehlung
  const since = daysAgo(7);
  const recent = (_activitiesFull || [])
    .filter(a => !a._noteOnly && new Date(a.start_date_local) >= since)
    .sort((a,b) => new Date(b.start_date_local) - new Date(a.start_date_local));
  if (recent.length) {
    lines.push('', '## Trainingseinheiten der letzten 7 Tage');
    recent.forEach(a => {
      const d = new Date(a.start_date_local).toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit' });
      const parts = [];
      if (a.moving_time) parts.push(formatDur(a.moving_time));
      if (a.distance) parts.push((a.distance/1000).toFixed(1)+' km');
      if (a.average_heartrate) parts.push('Ø '+Math.round(a.average_heartrate)+' bpm');
      if (a.total_elevation_gain) parts.push(Math.round(a.total_elevation_gain)+' hm');
      lines.push(`- ${d} · ${normalizeType(a.type)}: ${a.name || normalizeType(a.type)}${parts.length ? ' — '+parts.join(' · ') : ''}`);
      // eigene Trainingsbewertung pro Einheit (RPE / Befinden / Atmung / Bemerkung)
      const m = getActivityMetaFor(a.id);
      const resp = getManualRespiration()[a.id];
      const evalParts = [];
      if (m.rpe) evalParts.push(`RPE ${m.rpe}/10 (${RPE_OPTIONS.find(o=>o.v===m.rpe)?.l})`);
      if (m.feel) evalParts.push(`Befinden ${m.feel}/5 (${FEEL_OPTIONS.find(o=>o.v===m.feel)?.l})`);
      if (resp != null) evalParts.push(`Atmung ${resp}/min`);
      if (evalParts.length) lines.push(`  · ${evalParts.join(' · ')}`);
      if (m.note) lines.push(`  · Bemerkung: ${m.note}`);
    });
  }

  lines.push('', `## ${title || 'Journal-Eintrag'}`);
  if (mood) lines.push(`Schlafqualität: ${MOOD_OPTIONS.find(m=>m.v===mood)?.l} (${mood}/5)`);
  lines.push(body || '_Keine Notiz eingegeben._');
  lines.push('');
  lines.push('## Falls du einen Trainingsplan vorschlägst');
  lines.push('Gib ihn bitte maschinenlesbar aus — eine Einheit pro Zeile, Format: `Datum | Typ | Minuten | Notiz`');
  lines.push('(Datum als JJJJ-MM-TT; Typen: Laufen, Rad, Kraft, Mobilität, Atmung, Ruhetag, Krankheit). Beispiel:');
  lines.push('2026-07-14 | Laufen | 60 | GA1 locker');
  lines.push('');
  lines.push('---');
  lines.push('_Kontext aus Training Board — bitte berücksichtigen._');

  const btn = document.getElementById('copyNoteBtn');
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    btn.textContent = '✓ Kopiert!';
    setTimeout(() => { btn.textContent = '✦ Tagesbericht + Notiz für Claude kopieren'; }, 2500);
  } catch(e) { alert('Kopieren fehlgeschlagen.'); }
}

// ─── Note Viewer ──────────────────────────────────────────────────────────────

// Löscht die im Editor gerade bearbeitete (bestehende) Notiz aus dem GitHub-Repo
async function deleteEditingNote() {
  if (!_editingNote) return;
  const title = document.getElementById('noteEditorTitleInput').value.trim() || 'Notiz';
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  options.interaction = {mode:'nearest', intersect:true};
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
  plugins.push({
    id: 'hoverCrosshair',
    afterEvent(chart, args) {
      const e = args.event;
      if (e.type === 'mousemove') {
        const {left, right, top, bottom} = chart.chartArea;
        chart._crosshairX = (e.x >= left && e.x <= right && e.y >= top && e.y <= bottom) ? e.x : null;
        args.changed = true;
      } else if (e.type === 'mouseout') {
        chart._crosshairX = null;
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
  });
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
    if (!n.date) return;
    const day = n.date.slice(0,10);
    if (!(day in map)) map[day] = n;
  });
  return map;
}

function pencilIcon(size) {
  size = size || 15;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
}

function statChip(label, valueHtml) {
  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:48px">
    <span style="font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:0.04em">${label}</span>
    <span class="mono" style="font-size:12px;display:flex;align-items:center;justify-content:center;min-height:18px">${valueHtml}</span>
  </div>`;
}

function renderActivityTable(activities, containerId, limit=null, weightByDate=null, sleepByDate=null, journalByDate=null) {
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
    const resp=respirationRate(a);
    const respVal=isNoteOnly?'—':(resp!=null?Math.round(resp)+'/min':'—');
    const elev=a.total_elevation_gain?Math.round(a.total_elevation_gain)+' m':'—';
    const nameVal = isNoteOnly ? '<span style="color:var(--text2)">Ruhetag</span>' : escHtml(a.name||normalizeType(a.type));
    const typName = normalizeType(a.type);
    const typColor = TYPE_COLORS[typName] || '#94a3b8';
    const typVal = isNoteOnly ? '<span style="color:var(--text2)">—</span>' : `<span class="tag" style="background:${typColor}20;color:${typColor}">${typName}</span>`;
    const dayKey = fmtDate(new Date(a.start_date_local));

    let weightVal = '—', sleepVal = '—', moodVal = '—', titleHtml = '<span style="color:var(--text2)">—</span>';
    if (weightByDate) { const w = weightByDate[dayKey]; weightVal = w!=null?w.toFixed(1)+' kg':'—'; }
    if (sleepByDate) { const s = sleepByDate[dayKey]; sleepVal = s!=null?(s/3600).toFixed(1)+' h':'—'; }
    if (journalByDate) {
      const n = journalByDate[dayKey];
      moodVal = n && n.mood!=null ? moodIcon(n.mood,16) : '—'; // Schlafqualität bleibt pro Tag (Notiz)
      titleHtml = n
        ? `<span style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${escHtml(n.title)}</span>`
        : '<span style="color:var(--text2)">—</span>';
    }
    // RPE, Trainingsbefinden und Bemerkung jetzt pro Aktivität (activity_meta)
    const meta = isNoteOnly ? {} : getActivityMetaFor(a.id);
    const rpeVal = meta.rpe!=null ? `<span style="color:hsl(${rpeHue(meta.rpe)},70%,45%);font-weight:600">${meta.rpe}</span>` : '—';
    const feelVal = meta.feel!=null ? moodIcon(meta.feel,16) : '—';
    const remark = meta.note ? escHtml(meta.note) : '';

    return `${yearDivider}<div class="note-card" style="cursor:default;flex-wrap:wrap;row-gap:10px">
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-start;min-width:70px">
        <span class="mono" style="font-size:12px">${date}</span>
      </div>
      <div style="display:flex;flex-direction:column;width:150px;flex-shrink:0">
        <span style="font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:0.04em">Aktivität</span>
        <span style="font-size:12px;font-weight:600;min-height:18px;line-height:1.3;word-break:break-word${isNoteOnly?'':';cursor:pointer'}"${isNoteOnly?'':` onclick="openActivityModal('${a.id}')" title="Details & Bewertung öffnen"`}>${nameVal}</span>
        ${remark?`<span style="font-size:10px;color:var(--text2);line-height:1.3;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${remark}">✎ ${remark}</span>`:''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-start;min-width:60px">
        <span style="font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:0.04em">Typ</span>
        <span style="display:flex;align-items:center;min-height:18px">${typVal}</span>
      </div>
      ${statChip('Distanz', km)}
      ${statChip('Zeit', dur)}
      ${statChip('Ø HF', hr)}
      ${statChip('Atmung', respVal)}
      ${statChip('Höhe', elev)}
      ${journalByDate?statChip('Anstreng.', rpeVal):''}
      ${journalByDate?statChip('Befinden', feelVal):''}
      ${(journalByDate||sleepByDate||weightByDate)?`<div class="trend-kpi-sep" style="min-height:32px"></div>`:''}
      ${weightByDate?statChip('Gewicht', weightVal):''}
      ${sleepByDate?statChip('Schlaf', sleepVal):''}
      ${journalByDate?statChip('Schlafqual.', moodVal):''}
      ${journalByDate?`<div style="display:flex;align-items:center;gap:8px;margin-left:auto">${titleHtml}<button style="width:24px;height:24px;padding:0;border-radius:6px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer" title="${isNoteOnly?'Morgen-Check bearbeiten':'Bearbeiten — Details & Bewertung'}" onclick="${isNoteOnly?`openNoteEditor('${dayKey}')`:`openActivityModal('${a.id}')`}">${pencilIcon(13)}</button></div>`:''}
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
  return {layout:{padding:{top:8,bottom:4}},plugins:{legend:{labels:{font:{family:CHART_FONT,size:11},color:CHART_TEXT}}},scales:{x:{grid:{color:CHART_GRID},ticks:{font:{family:CHART_FONT,size:10},color:CHART_TEXT,maxTicksLimit:8}},y:{grace:'10%',grid:{color:CHART_GRID},ticks:{font:{family:CHART_FONT,size:10},color:CHART_TEXT}}}};
}

function fmtAxisDate(id) { const [y,m,d] = id.split('-'); return `${d}.${m}.${y.slice(2)}`; }
function sortedWellness(w) { return [...w].sort((a,b)=>a.id>b.id?1:-1); }
function avg(arr) { return arr.length?arr.reduce((s,v)=>s+v,0)/arr.length:0; }
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
