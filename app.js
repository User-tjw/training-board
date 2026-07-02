// ─── Zeitraum pro Kachel-Gruppe ────────────────────────────────────────────────

const RANGE_OPTIONS = [7, 14, 30, 90, 365];
let _wellnessFull = [], _activitiesFull = [], _fitnessFull = [];

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
    s.value = getRangeDays(firstKey, parseInt(s.dataset.default) || 30);
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
  sessionStorage.removeItem('tb_active_trainer');
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
    sessionStorage.removeItem('tb_active_trainer');
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

function getHfZones() {
  try { return JSON.parse(localStorage.getItem('hf_zones') || '{}'); } catch(e) { return {}; }
}

function applyHfZonesToInputs() {
  const z = getHfZones();
  document.getElementById('aet').value = z.aet ?? 148;
  document.getElementById('ant').value = z.ant ?? 168;
}

function saveHfZonesLocal() {
  const aet = parseInt(document.getElementById('aet')?.value) || 148;
  const ant = parseInt(document.getElementById('ant')?.value) || 168;
  const zones = { aet, ant, updatedAt: Date.now() };
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

let _editingRespirationActId = null;

function promptRespiration(actId) {
  _editingRespirationActId = actId;
  const data = getManualRespiration();
  document.getElementById('respirationInput').value = data[actId] ?? '';
  document.getElementById('respirationModal').style.display = 'flex';
  document.getElementById('respirationInput').focus();
}

function closeRespirationEditor() {
  document.getElementById('respirationModal').style.display = 'none';
  _editingRespirationActId = null;
}

function saveRespirationEditor() {
  if (!_editingRespirationActId) return;
  const raw = document.getElementById('respirationInput').value.trim();
  const value = raw === '' ? null : parseFloat(raw.replace(',', '.'));
  if (raw !== '' && (isNaN(value) || value <= 0)) { alert('Bitte eine positive Zahl eingeben.'); return; }
  const data = getManualRespiration();
  if (value == null) delete data[_editingRespirationActId]; else data[_editingRespirationActId] = value;
  data.updatedAt = Date.now();
  localStorage.setItem('manual_respiration', JSON.stringify(data));
  if (ghToken && ghRepo) {
    saveManualRespirationToGH(data).catch(e => alert('Speichern bei GitHub fehlgeschlagen: ' + e.message + '\n\nDer Wert ist trotzdem lokal in diesem Browser gespeichert.'));
  }
  closeRespirationEditor();
  renderFromCache();
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
  syncHfZonesFromGH();
  loadAll();
  renderTeam();
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
  renderTeam();
  applyHfZonesToInputs();
  updateZones();
  syncTrainingPlanFromGH();
  syncManualRespirationFromGH();
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
    const navSection = lastSection === 'trainer' ? 'team' : lastSection;
    const savedItem = document.querySelector(`.nav-item[data-section="${navSection}"]`);
    if (savedItem) {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      savedItem.classList.add('active');
      document.getElementById(`section-${navSection}`)?.classList.add('active');
      document.getElementById('pageTitle').textContent = navSection === 'team' ? 'KI-Trainer' : savedItem.textContent.trim();
      if (navSection === 'team' && lastSection !== 'team') sessionStorage.setItem('tb_active_section', 'team');
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
      document.getElementById('pageTitle').textContent = sec === 'team' ? 'KI-Trainer' : item.textContent.trim();
      sessionStorage.setItem('tb_active_section', sec);
      if (sec === 'team') renderTeam();
    });
  });
}

// ─── Data Loading ─────────────────────────────────────────────────────────────

async function loadAll() {
  const maxDays = 400; // deckt die größte wählbare Kachel-Spanne ("Alle" = 365) mit Puffer ab
  applyStoredRanges();

  try {
    const [wellnessFull, activitiesFull] = await Promise.all([
      icuFetch(`/athlete/${athleteId}/wellness?oldest=${fmtDate(daysAgo(maxDays))}`),
      icuFetch(`/athlete/${athleteId}/activities?oldest=${fmtDate(daysAgo(maxDays))}`),
    ]);

    if (ghToken && ghRepo && _notes.length === 0) _notes = await loadNotes();

    _wellnessFull = wellnessFull;
    _activitiesFull = activitiesFull;
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
    renderCockpitStatus(wellnessFull, _fitnessFull, activitiesFull);
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

function buildWeekCalendar(weekStart, weekActs) {
  const dayNames = ['MO','DI','MI','DO','FR','SA','SO'];
  const todayStr = fmtDate(new Date());
  const days = Array.from({length:7}, (_,i) => { const d=new Date(weekStart); d.setDate(weekStart.getDate()+i); return d; });

  const byDay = days.map(d => {
    const dStr = fmtDate(d);
    const dayActs = weekActs.filter(a => fmtDate(new Date(a.start_date_local)) === dStr);
    return {
      isToday: dStr === todayStr,
      endurance: dayActs.filter(a => normalizeType(a.type) !== 'Kraft'),
      strength: dayActs.filter(a => normalizeType(a.type) === 'Kraft'),
    };
  });

  function mainBenefit(act, type) {
    if (type === 'Laufen' && act.average_speed) {
      const secPerKm = 1000 / act.average_speed;
      const m = Math.floor(secPerKm/60), s = Math.round(secPerKm%60);
      return `${m}:${String(s).padStart(2,'0')}/km`;
    }
    const watts = act.icu_weighted_avg_watts || act.icu_average_watts || act.average_watts;
    if (type === 'Rad' && watts) {
      return `${Math.round(watts)} W`;
    }
    if (type === 'Kraft' && act.icu_training_load) {
      return `Load ${Math.round(act.icu_training_load)}`;
    }
    if (act.icu_training_load) return `Load ${Math.round(act.icu_training_load)}`;
    return '';
  }

  function goalLabel(act, type) {
    if (type === 'Kraft') return 'Kraft/Mobilität';
    if (type === 'Atmung') return 'Atemarbeit';
    const zones = window._zones;
    const hr = act.average_heartrate;
    if (!zones || !hr) return '';
    if (hr <= zones[1].high) return 'Ausdauer';
    if (hr <= zones[2].high) return 'Entwicklung';
    return 'Schwelle';
  }

  function cell(act) {
    if (!act) return { html: `<div class="week-cal-cell-empty">—</div>`, color: null };
    const type = normalizeType(act.type);
    const color = TYPE_COLORS[type] || '#94a3b8';
    const km = act.distance ? (act.distance/1000).toFixed(1)+' km' : '';
    const dur = act.moving_time ? formatDur(act.moving_time) : '';
    const hr = act.average_heartrate ? Math.round(act.average_heartrate)+' bpm' : '';
    const benefit = mainBenefit(act, type);
    const goal = goalLabel(act, type);
    const html = `<div class="week-cal-type" style="color:${color}">${type.toUpperCase()}</div>
      ${goal ? `<div class="week-cal-goal" style="color:${color}">${goal}</div>` : ''}
      <div class="week-cal-main">${km || dur || '—'}</div>
      <div class="week-cal-sub">${[km?dur:'', hr].filter(Boolean).join(' · ')}</div>
      ${benefit ? `<div class="week-cal-benefit" style="color:${color}">${benefit}</div>` : ''}`;
    return { html, color };
  }

  function cellWrap(c, extraClass) {
    const style = c.color ? ` style="background:${c.color}12"` : '';
    const cls = c.color ? ` week-cal-cell-tinted` : '';
    return `<div class="week-cal-cell${extraClass}${cls}"${style}>${c.html}</div>`;
  }

  const head = days.map((d,i) => {
    const today = byDay[i].isToday;
    return `<div class="week-cal-head-cell${today?' today':''}">${dayNames[i]} ${d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}</div>`;
  }).join('') + `<div class="week-cal-head-cell">DIESE WOCHE</div>`;

  const enduranceRow = byDay.map(d => cellWrap(cell(d.endurance[0]), d.isToday?' today':'')).join('');
  const strengthRow = byDay.map(d => cellWrap(cell(d.strength[0]), ' week-band-sep'+(d.isToday?' today':''))).join('');

  const dayTotalRow = byDay.map((d,i) => {
    const today = d.isToday;
    const dayMin = Math.round(([...d.endurance, ...d.strength]).reduce((s,a) => s+(a.moving_time||0), 0) / 60);
    return `<div class="week-cal-head-cell week-cal-day-total${today?' today':''}">${dayMin > 0 ? dayMin+' min' : '–'}</div>`;
  }).join('') + `<div class="week-cal-head-cell week-cal-day-total"></div>`;

  const plan = getTrainingPlan();
  const totalH = weekActs.reduce((s,a) => s+(a.moving_time||0), 0) / 3600;
  const totalVal = plan.weekHours
    ? `${totalH.toFixed(1)}<span class="week-cal-summary-unit">/${plan.weekHours} h</span>`
    : `${totalH.toFixed(1)}<span class="week-cal-summary-unit"> h</span>`;
  const typeTotals = {};
  Object.keys(TYPE_COLORS).forEach(t => { typeTotals[t] = 0; });
  weekActs.forEach(a => { const t = normalizeType(a.type); typeTotals[t] = (typeTotals[t]||0) + (a.moving_time||0); });
  const maxTypeT = Math.max(1, ...Object.values(typeTotals));
  const typeHBars = Object.entries(typeTotals).map(([t,s]) => {
    const color = TYPE_COLORS[t] || '#94a3b8';
    const targetH = plan.byType?.[t];
    const istH = (s/3600).toFixed(1);
    const pct = targetH ? Math.min(100, Math.round(s/(targetH*3600)*100)) : Math.round(s/maxTypeT*100);
    const label = targetH ? `${istH}/${targetH}h` : `${istH}h`;
    const title = targetH ? `${t}: ${formatDur(s)} von ${targetH} h Soll` : `${t}: ${formatDur(s)}`;
    return `<div class="week-cal-hbar-row" title="${title}">
      <span class="week-cal-hbar-label" style="color:${color}">${t}</span>
      <div class="week-cal-hbar-bar-wrap">
        <div class="week-cal-hbar-track" style="background:${color}30">
          <div class="week-cal-hbar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="week-cal-hbar-hours">${label}</div>
      </div>
    </div>`;
  }).join('');
  const summarySpan = `<div class="week-cal-cell week-cal-summary-cell week-cal-summary-span">
      <div class="week-cal-hbars">${typeHBars}</div>
    </div>`;

  return { html: head + enduranceRow + summarySpan + strengthRow + dayTotalRow, totalHtml: totalVal };
}

function renderCockpitWeek() {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1) + cockpitWeekOffset*7);
  weekStart.setHours(0,0,0,0);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate()+7);
  const weekActs = _cockpitActivitiesFull.filter(a => {
    const d = new Date(a.start_date_local);
    return d >= weekStart && d < weekEnd;
  });

  document.getElementById('cockpitWeekLabel').textContent =
    `KW${getWeek(weekStart)} · ${weekStart.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})} – ${new Date(weekEnd-1).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}`;
  const built = buildWeekCalendar(weekStart, weekActs);
  document.getElementById('cockpitWeekCal').innerHTML = built.html;
  document.getElementById('cockpitWeekTotal').innerHTML = built.totalHtml;

  const nextBtn = document.getElementById('cockpitWeekNextBtn');
  if (nextBtn) nextBtn.disabled = cockpitWeekOffset >= 0;
}

function navCockpitWeek(delta) {
  cockpitWeekOffset = delta === 0 ? 0 : Math.min(0, cockpitWeekOffset + delta);
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
  const days = getRangeDays('cockpitLoad', 30);
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
  const days = getRangeDays('overview', 90);

  const activities = sliceDays(_activitiesFull, days, a => new Date(a.start_date_local));
  const weightByDate = {};
  _wellnessFull.forEach(d => { if (d.weight != null) weightByDate[d.id] = d.weight; });
  renderActivityTable(activities,'allActivities',null,weightByDate);

  const mix = {};
  Object.keys(TYPE_COLORS).forEach(t => { mix[t] = 0; });
  activities.forEach(a => { const t = normalizeType(a.type); mix[t] = (mix[t]||0) + (a.moving_time||0); });
  const tot = Object.values(mix).reduce((s,v) => s+v, 0);
  document.getElementById('activitiesMix').innerHTML = Object.entries(mix).map(([t,s]) => {
    const p = tot ? Math.round(s/tot*100) : 0;
    return `<div class="mix-item"><div class="mix-label" style="color:${TYPE_COLORS[t]||'#94a3b8'};font-size:12px;font-weight:600">${t}</div><div class="mix-bar-wrap"><div class="mix-bar" style="width:${p}%;background:${TYPE_COLORS[t]||'#94a3b8'}"></div></div><span class="mix-val">${p}%</span><span class="mix-time">${formatDur(s)}</span></div>`;
  }).join('');
}

// ─── HF-Zonen ────────────────────────────────────────────────────────────────

function updateZones() {
  const aet = parseInt(document.getElementById('aet')?.value)||148;
  const ant = parseInt(document.getElementById('ant')?.value)||168;
  const zones = [
    {low:Math.round(aet*0.80),high:Math.round(aet*0.90),name:'Zone 1',char:'Sehr leicht · aerobe Basis',color:'#60a5fa'},
    {low:Math.round(aet*0.90),high:aet,                  name:'Zone 2',char:'Locker · aerobe Kapazität',color:'#34d399'},
    {low:aet,                  high:ant,                  name:'Zone 3',char:'Mittel · Grauzone',color:'#fbbf24'},
    {low:ant,                  high:'—',                  name:'Zone 4',char:'Hart · anaerob',color:'#f87171'},
  ];
  const tbody = document.getElementById('zonesBody');
  if (!tbody) return;
  tbody.innerHTML = zones.map(z=>`<tr><td><span class="zone-dot" style="background:${z.color}"></span><span class="zone-name">${z.name}</span></td><td class="zone-range">${z.low} – ${z.high} bpm</td><td class="zone-desc">${z.char}</td></tr>`).join('');
  window._zones = zones;
}

function renderZonesGroup() {
  const days = getRangeDays('zones', 90);
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
  renderChart('zoneDonut',{type:'doughnut',data:{labels:zn,datasets:[{data:pcts,backgroundColor:zc,borderWidth:0}]},options:{cutout:'65%',plugins:{legend:{position:'bottom',labels:{font:{family:CHART_FONT,size:11},boxWidth:10,padding:10,color:CHART_TEXT}}}}});

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
  renderChart('zoneTrendChart',{type:'bar',data:{labels,datasets:zc.map((c,i)=>({label:zn[i],data:labels.map(kw=>{const t=weeks[kw].reduce((s,v)=>s+v,0);return t?Math.round(weeks[kw][i]/t*100):0;}),backgroundColor:c,stack:'z'}))},options:{plugins:{legend:{labels:{font:{family:CHART_FONT,size:11},boxWidth:10,color:CHART_TEXT}}},scales:{x:{grid:{display:false},ticks:{font:{family:CHART_FONT,size:10},color:CHART_TEXT}},y:{stacked:true,max:100,grid:{color:CHART_GRID},ticks:{font:{family:CHART_FONT,size:10},color:CHART_TEXT,callback:v=>v+'%'}}}}});
}

// ─── Fitness ─────────────────────────────────────────────────────────────────

// ─── Wellness ────────────────────────────────────────────────────────────────

function renderWellnessGroup() {
  const days = getRangeDays('wellness', 30);
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

// ─── Trainer Team ─────────────────────────────────────────────────────────────

const TRAINERS = [
  {slug:'head-coach', icon:'⊙', name:'Head Coach',    role:'Tagessteuerung & Planung',       color:'#3b82f6', desc:'HRV-Ampel, Check-In, Wochenplanung, Load-Management und Saisonplanung.'},
  {slug:'reha',       icon:'◈', name:'Reha-Trainer',  role:'Verletzung & Prävention',         color:'#dc2626', desc:'Gate-System, Protokolle für parallele Reha-Programme, Schmerzmonitoring.'},
  {slug:'kraft',      icon:'◆', name:'Kraft-Trainer', role:'Kraft & Stabilität',              color:'#8b5cf6', desc:'Ganzkörper-Programm, Posterior Chain, Progression, Heimtraining.'},
  {slug:'ernaehrung', icon:'◐', name:'Sporternährung',role:'Ernährung & Supplements',         color:'#10b981', desc:'Basis-Protokoll, Race-Day-Ernährung, Taper, Protein-Strategie.'},
  {slug:'methodik',   icon:'▲', name:'UA-Methodik',   role:'Uphill Athlete Prinzipien',       color:'#b45309', desc:'Polarisiertes Training, AeT/AnT, 80/20-Verteilung, Zonenlogik.'},
];

const TRAINER_SVG_PATHS = {
  'head-coach': '<path d="M12 3.5l2.5 5.3 5.8.7-4.3 4 1.2 5.8-5.2-3.1-5.2 3.1 1.2-5.8-4.3-4 5.8-.7L12 3.5z"/>',
  'reha':       '<path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z"/><line x1="12" y1="9" x2="12" y2="14"/><line x1="9.5" y1="11.5" x2="14.5" y2="11.5"/>',
  'kraft':      '<rect x="1.5" y="9" width="3" height="6" rx="1"/><rect x="19.5" y="9" width="3" height="6" rx="1"/><line x1="6.5" y1="12" x2="17.5" y2="12"/><rect x="6" y="6.5" width="2.5" height="11" rx="1"/><rect x="15.5" y="6.5" width="2.5" height="11" rx="1"/>',
  'ernaehrung': '<path d="M19 4C12 4 5 8 5 15c0 2.5 2 4.5 4.5 4.5C16 19.5 19 11 19 4z"/><line x1="9" y1="19" x2="18" y2="6"/>',
  'methodik':   '<path d="M3 18l6-10 4 6 2-3 6 7H3z"/>',
};

function trainerIconSvg(slug, size) {
  size = size || 28;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${TRAINER_SVG_PATHS[slug] || ''}</svg>`;
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
let _notes = [];
let _editingNote = null;
let _viewingIndex = -1;

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
    const notes = await Promise.all(mdFiles.map(async f => {
      const file = await ghFetch(`/repos/${ghRepo}/contents/${GH_NOTES_PATH}/${f.name}`);
      const { fm, body } = parseFrontmatter(b64dec(file.content));
      return { filename: f.name, sha: file.sha, trainer: fm.trainer || 'head-coach', title: fm.title || f.name.replace('.md',''), date: fm.date || '', mood: fm.mood ? parseInt(fm.mood) : null, body };
    }));
    return notes.sort((a,b) => b.date.localeCompare(a.date));
  } catch(e) {
    console.error('GitHub notes:', e);
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

async function loadJSONFromGH(ghPath) {
  if (!ghToken || !ghRepo) return null;
  try {
    const file = await ghFetch(`/repos/${ghRepo}/contents/${ghPath}`);
    _ghShaCache[ghPath] = file.sha;
    return JSON.parse(b64dec(file.content));
  } catch(e) {
    if (!e.message.includes('404') && !e.message.includes('Not Found')) console.error(`GitHub ${ghPath}:`, e);
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
function saveHfZonesToGH(zones) { return saveJSONToGH(GH_ZONES_FILE, zones, 'Update HF-Zonen'); }
function syncHfZonesFromGH() { return syncJSONFromGH(GH_ZONES_FILE, 'hf_zones', getHfZones, () => { applyHfZonesToInputs(); updateZones(); renderZonesGroup(); }); }

function renderMarkdown(text) {
  const e = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const lines = e.split('\n');
  let html = '', inList = false;
  for (const raw of lines) {
    const line = raw
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,'<em>$1</em>');
    if (/^### /.test(line)) { if(inList){html+='</ul>';inList=false;} html+=`<h3>${line.slice(4)}</h3>`; }
    else if (/^## /.test(line))  { if(inList){html+='</ul>';inList=false;} html+=`<h2>${line.slice(3)}</h2>`; }
    else if (/^# /.test(line))   { if(inList){html+='</ul>';inList=false;} html+=`<h1>${line.slice(2)}</h1>`; }
    else if (/^[-*] /.test(line)){ if(!inList){html+='<ul>';inList=true;} html+=`<li>${line.slice(2)}</li>`; }
    else if (/^---$/.test(raw))  { if(inList){html+='</ul>';inList=false;} html+=`<hr>`; }
    else if (line.trim()==='')   { if(inList){html+='</ul>';inList=false;} html+=`<p></p>`; }
    else                         { if(inList){html+='</ul>';inList=false;} html+=`<p>${line}</p>`; }
  }
  if (inList) html+='</ul>';
  return html;
}

function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function nowLocalISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fmtNoteDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

// ─── Team Tab Render (Übersicht) ──────────────────────────────────────────────

async function renderTeam() {
  const configured = !!(ghToken && ghRepo);
  document.getElementById('ghSetupBanner').style.display = configured ? 'none' : 'block';

  if (configured && _notes.length === 0) _notes = await loadNotes();

  const activeSlug = sessionStorage.getItem('tb_active_trainer') || 'head-coach';

  document.getElementById('teamGrid').innerHTML = TRAINERS.map(t => {
    return `<div class="trainer-card${t.slug === activeSlug ? ' active' : ''}" data-slug="${t.slug}" onclick="selectTrainer('${t.slug}')">
      <div class="trainer-icon" style="color:${t.color}">${trainerIconSvg(t.slug, 18)}</div>
      <div class="trainer-name">${t.name}</div>
    </div>`;
  }).join('');

  if (activeSlug) selectTrainer(activeSlug);
}

function selectTrainer(slug) {
  sessionStorage.setItem('tb_active_trainer', slug);
  document.querySelectorAll('.trainer-card').forEach(c => c.classList.toggle('active', c.dataset.slug === slug));
  document.getElementById('trainerInline').style.display = 'block';
  showTrainerDetail(slug);
}

// ─── Trainer Detail ───────────────────────────────────────────────────────────

async function showTrainerDetail(slug) {
  if (!ghToken || !ghRepo) {
    document.getElementById('trainerInline').innerHTML =
      `<div class="gh-setup-banner"><div style="font-size:13px;font-weight:600;margin-bottom:4px">GitHub nicht konfiguriert</div>
      <div style="font-size:12px;color:#1e40af;margin-bottom:10px">Token + Repo in den Einstellungen eintragen.</div>
      <button class="trainer-link" onclick="openSettingsPage()">⚙ Einstellungen →</button></div>`;
    return;
  }

  const t = TRAINERS.find(x => x.slug === slug);
  if (!t) return;

  if (_notes.length === 0) _notes = await loadNotes();
  const trainerNotes = _notes.filter(n => n.trainer === slug);

  document.getElementById('trainerInline').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
      <span style="color:${t.color}">${trainerIconSvg(t.slug, 32)}</span>
      <div>
        <div style="font-size:20px;font-weight:700">${t.name}</div>
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${t.color};margin-top:2px">${t.role}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px">${t.desc}</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><span class="card-title">Neue Notiz</span></div>
      <div class="setup-field" style="margin-bottom:10px">
        <input class="setup-input" id="tnTitle" type="text" placeholder="Titel (z.B. Morgen Check-In)" onkeydown="if(event.key==='Enter')document.getElementById('tnContent').focus()">
      </div>
      <textarea class="note-textarea" id="tnContent" style="min-height:110px" placeholder="Notiz eingeben…&#10;&#10;**Fett**, *kursiv*, ## Überschrift, - Liste"></textarea>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button style="padding:9px 20px;border-radius:8px;border:none;background:var(--accent);color:white;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font);line-height:1" onclick="saveTrainerNote('${slug}')">Speichern</button>
        <button id="copyTBtn_${slug}" style="padding:9px 20px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font);line-height:1" onclick="copyTrainerNotes('${slug}')">Für Claude kopieren</button>
        <button class="btn icon-btn" title="Neu laden" onclick="refreshTrainerDetail('${slug}')">↻</button>
        <div class="setup-error" id="tnError" style="display:none;margin:0;align-self:center"></div>
      </div>
    </div>

    <div class="notes-header" style="margin-bottom:12px">
      <span class="card-title" id="trainerNotesCount">${trainerNotes.length} Notiz${trainerNotes.length !== 1 ? 'en' : ''}</span>
    </div>
    <div id="trainerNotesList">
      ${renderTrainerNotesHtml(trainerNotes)}
    </div>`;
}

async function refreshTrainerDetail(slug) {
  _notes = await loadNotes();
  showTrainerDetail(slug);
}

function renderTrainerNotesHtml(notes) {
  if (notes.length === 0)
    return `<div class="notes-loading">Noch keine Notizen — oben erste Notiz erstellen.</div>`;
  return notes.map(n => {
    const idx = _notes.indexOf(n);
    return `<div class="note-card" onclick="openNoteViewer(${idx})">
      <div class="note-card-head">
        <span class="note-card-date">${fmtNoteDate(n.date)}</span>
      </div>
      <div class="note-card-main">
        <span class="note-card-title">${escHtml(n.title)}</span>
      </div>
    </div>`;
  }).join('');
}

async function saveTrainerNote(slug) {
  const title = document.getElementById('tnTitle').value.trim();
  const body  = document.getElementById('tnContent').value.trim();
  const errEl = document.getElementById('tnError');
  if (!title || !body) { errEl.textContent = 'Titel und Inhalt erforderlich.'; errEl.style.display='block'; return; }
  errEl.style.display = 'none';
  try {
    const content  = buildNoteContent(body, slug, title);
    const filename = `${Date.now()}-${slug}.md`;
    const res = await saveNoteToGH(filename, content, null);
    const newNote = {
      filename,
      sha:     res.content.sha,
      trainer: slug,
      title,
      date:    nowLocalISO(),
      body,
    };
    _notes.unshift(newNote);
    document.getElementById('tnTitle').value   = '';
    document.getElementById('tnContent').value = '';
    const trainerNotes = _notes.filter(n => n.trainer === slug);
    document.getElementById('trainerNotesCount').textContent =
      `${trainerNotes.length} Notiz${trainerNotes.length !== 1 ? 'en' : ''}`;
    document.getElementById('trainerNotesList').innerHTML = renderTrainerNotesHtml(trainerNotes);
  } catch(e) {
    errEl.textContent = 'Fehler: ' + e.message;
    errEl.style.display = 'block';
  }
}

async function copyTrainerNotes(slug) {
  const t    = TRAINERS.find(x => x.slug === slug);
  const notes = _notes.filter(n => n.trainer === slug);
  const today = new Date().toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  const lines = [
    `# ${t.icon} ${t.name} — Notizverlauf (${today})`,
    `**Athlet:** Thomas Wagner | 50J | 74.6 kg | FTP 250W | Max-HF 183`,
    '',
  ];
  if (notes.length === 0) {
    lines.push('_Noch keine Notizen vorhanden._');
  } else {
    notes.forEach(n => {
      lines.push(`## ${fmtNoteDate(n.date)} — ${n.title}`);
      lines.push(n.body);
      lines.push('');
    });
  }
  lines.push('---');
  lines.push('_Kontext aus Training Board — bitte berücksichtigen._');

  const btn = document.getElementById(`copyTBtn_${slug}`);
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    btn.textContent = '✓ Kopiert!';
    btn.style.background = 'var(--green)'; btn.style.color = 'white'; btn.style.borderColor = 'var(--green)';
    setTimeout(() => { btn.textContent = '✦ Für Claude kopieren'; btn.style.background=''; btn.style.color=''; btn.style.borderColor=''; }, 2500);
  } catch(e) { alert('Kopieren fehlgeschlagen.'); }
}

// ─── Note Editor ──────────────────────────────────────────────────────────────

function renderMoodPicker(selected) {
  document.getElementById('moodPicker').innerHTML = MOOD_OPTIONS.map(m =>
    `<button type="button" class="mood-btn${m.v===selected?' active':''}" data-mood="${m.v}" onclick="selectMood(${m.v})">${moodIcon(m.v,22)}<span class="mood-btn-label">${m.l}</span></button>`
  ).join('');
  document.getElementById('moodPicker').dataset.selected = selected || '';
}

function selectMood(v) {
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.toggle('active', +b.dataset.mood === v));
  document.getElementById('moodPicker').dataset.selected = v;
}

let _noteEditorLocalMode = false;
let _editingLocalNoteId = null;

function openNoteEditor(trainerSlug) {
  if (!ghToken || !ghRepo) { openSettingsPage(); return; }
  _noteEditorLocalMode = false;
  _editingLocalNoteId = null;
  _editingNote = null;
  document.getElementById('noteEditorHeading').textContent = 'Neue Notiz';
  document.getElementById('noteEditorTrainer').value = trainerSlug || 'head-coach';
  document.getElementById('noteEditorTitleInput').value = '';
  document.getElementById('noteEditorDate').value = fmtDate(new Date());
  document.getElementById('noteEditorContent').value = '';
  renderMoodPicker(null);
  document.getElementById('noteEditorError').style.display = 'none';
  document.getElementById('localDayNotesSection').style.display = 'none';
  document.getElementById('noteEditorModal').style.display = 'flex';
}

function openDayNoteEditor(localNoteId) {
  if (ghToken && ghRepo) {
    openNoteEditor('head-coach');
    document.getElementById('noteEditorHeading').textContent = '✎ Notiz / Tagesbefinden';
    document.getElementById('noteEditorTitleInput').value = 'Tagesnotiz';
    return;
  }
  _editingNote = null;
  _noteEditorLocalMode = true;
  _editingLocalNoteId = localNoteId || null;
  const n = localNoteId ? _localDayNotes.find(x => x.id === localNoteId) : null;
  document.getElementById('noteEditorHeading').textContent = n ? '✎ Notiz bearbeiten' : '✎ Notiz / Tagesbefinden';
  document.getElementById('noteEditorTrainer').value = 'head-coach';
  document.getElementById('noteEditorTitleInput').value = n ? n.title : 'Tagesnotiz';
  document.getElementById('noteEditorDate').value = n ? n.date.slice(0,10) : fmtDate(new Date());
  document.getElementById('noteEditorContent').value = n ? n.body : '';
  renderMoodPicker(n ? n.mood : null);
  document.getElementById('noteEditorError').style.display = 'none';
  document.getElementById('localDayNotesSection').style.display = 'block';
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
}

async function saveNoteEditor() {
  const trainer = document.getElementById('noteEditorTrainer').value;
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
    return;
  }

  if (!body) { errEl.textContent = 'Inhalt erforderlich.'; errEl.style.display='block'; return; }
  const content  = buildNoteContent(body, trainer, title, date, mood);
  const filename = _editingNote ? _editingNote.filename : `${Date.now()}-${trainer}.md`;
  const sha      = _editingNote ? _editingNote.sha : null;
  try {
    const res = await saveNoteToGH(filename, content, sha);
    if (_editingNote) {
      const n = _notes.find(x => x.filename === filename);
      if (n) { n.trainer = trainer; n.title = title; n.body = body; n.date = date; n.mood = mood; n.sha = res.content.sha; }
    } else {
      _notes.unshift({ filename, sha: res.content.sha, trainer, title, date, mood, body });
    }
    closeNoteEditor();
    await renderTeam();
    refreshCockpitMoodTile();
  } catch(e) {
    errEl.textContent = 'Fehler: ' + e.message;
    errEl.style.display = 'block';
  }
}

// ─── Note Viewer ──────────────────────────────────────────────────────────────

function openNoteViewer(index) {
  _viewingIndex = index;
  const n = _notes[index];
  const t = TRAINERS.find(x => x.slug === n.trainer) || {icon:'✦', name:'Allgemein', color:'#64748b'};
  document.getElementById('noteViewerBadge').innerHTML =
    `<span class="note-card-badge" style="background:${t.color}20;color:${t.color}">${t.icon} ${t.name}</span>`;
  document.getElementById('noteViewerTitle').innerHTML = escHtml(n.title) + (n.mood ? ` <span style="color:var(--text2);vertical-align:-4px">${moodIcon(n.mood,16)}</span>` : '');
  document.getElementById('noteViewerDate').textContent  = fmtNoteDate(n.date);
  document.getElementById('noteViewerContent').innerHTML = renderMarkdown(n.body);
  document.getElementById('noteViewerModal').style.display = 'flex';
}

function closeNoteViewer() {
  document.getElementById('noteViewerModal').style.display = 'none';
  _viewingIndex = -1;
}

function editCurrentNote() {
  const n = _notes[_viewingIndex];
  closeNoteViewer();
  _noteEditorLocalMode = false;
  _editingLocalNoteId = null;
  _editingNote = { filename: n.filename, sha: n.sha, date: n.date };
  document.getElementById('noteEditorHeading').textContent = 'Notiz bearbeiten';
  document.getElementById('noteEditorTrainer').value = n.trainer;
  document.getElementById('noteEditorTitleInput').value = n.title;
  document.getElementById('noteEditorDate').value = (n.date || fmtDate(new Date())).slice(0,10);
  document.getElementById('noteEditorContent').value = n.body;
  document.getElementById('localDayNotesSection').style.display = 'none';
  renderMoodPicker(n.mood || null);
  document.getElementById('noteEditorError').style.display = 'none';
  document.getElementById('noteEditorModal').style.display = 'flex';
}

async function deleteCurrentNote() {
  const n = _notes[_viewingIndex];
  if (!confirm(`Notiz "${n.title}" wirklich löschen?`)) return;
  try {
    await deleteNoteFromGH(n.filename, n.sha);
    _notes = _notes.filter(x => x.filename !== n.filename);
    closeNoteViewer();
    await renderTeam();
    refreshCockpitMoodTile();
  } catch(e) {
    alert('Fehler beim Löschen: ' + e.message);
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
    {type:'line',label:'Fitness (CTL)',data:fitness.map(d=>d.ctl?Math.round(d.ctl):null),borderColor:'#3b82f6',backgroundColor:'transparent',borderWidth:3,pointRadius:0,tension:0.4,order:1},
    {type:'line',label:'Fatigue (ATL)',data:fitness.map(d=>d.atl?Math.round(d.atl):null),borderColor:'#dc2626',backgroundColor:'transparent',borderWidth:3,borderDash:[6,3],pointRadius:0,tension:0.4,order:1},
    {type:'line',label:'Form (TSB)',   data:fitness.map(d=>d.tsb?Math.round(d.tsb):null),borderColor:'#d97706',backgroundColor:'transparent',borderWidth:3,borderDash:[2,2],pointRadius:0,tension:0.4,order:1},
  );
  const options = lineOptions();
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
    datasets.push({type:'line',label:'HRV',data:fitness.map(d=>hrvByDate[d.date]||null),borderColor:'#10b981',backgroundColor:'transparent',borderWidth:3,borderDash:[1,3],pointRadius:0,tension:0.4,spanGaps:true,order:1});
  }
  if (rhfByDate) {
    datasets.push({type:'line',label:'Ruhepuls',data:fitness.map(d=>rhfByDate[d.date]||null),borderColor:'#06b6d4',backgroundColor:'transparent',borderWidth:3,borderDash:[8,2,2,2],pointRadius:0,tension:0.4,spanGaps:true,order:1});
  }
  if (respByDate) {
    datasets.push({type:'line',label:'Ø Atmung/Min',data:fitness.map(d=>respByDate[d.date]||null),borderColor:'#f472b6',backgroundColor:'transparent',borderWidth:3,borderDash:[3,3],pointRadius:0,tension:0.4,spanGaps:true,order:1});
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
  return {type:'line',data:{labels,datasets},options,plugins};
}

function respirationRate(act) {
  const manual = getManualRespiration()[act.id];
  if (manual != null) return manual;
  // Fallback, falls Intervals.icu die Atemfrequenz doch einmal direkt mitliefert (Feldname unbestätigt)
  return act.icu_average_respiration ?? act.average_respiration ?? act.icu_respiration_rate ?? act.respiration_rate ?? null;
}

function renderActivityTable(activities, containerId, limit=null, weightByDate=null) {
  const el=document.getElementById(containerId); if(!el) return;
  const list=limit?activities.slice(0,limit):activities;
  if(!list.length){el.innerHTML='<div class="loading">Keine Aktivitäten</div>';return;}
  const weightCol = weightByDate ? '<th>Gewicht</th>' : '';
  el.innerHTML=`<table class="act-table"><thead><tr><th>Datum</th><th>Name</th><th>Typ</th><th>Distanz</th><th>Zeit</th><th>Ø HF</th><th>Ø Atmung/Min</th><th>Höhenmeter</th>${weightCol}</tr></thead><tbody>${list.map(a=>{
    const date=new Date(a.start_date_local).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});
    const km=a.distance?(a.distance/1000).toFixed(1)+' km':'—';
    const dur=a.moving_time?formatDur(a.moving_time):'—';
    const hr=a.average_heartrate?Math.round(a.average_heartrate)+' bpm':'—';
    const resp=respirationRate(a);
    const respCell=resp!=null?Math.round(resp)+'/min':'—';
    const elev=a.total_elevation_gain?Math.round(a.total_elevation_gain)+' m':'—';
    let weightCell = '';
    if (weightByDate) {
      const w = weightByDate[fmtDate(new Date(a.start_date_local))];
      weightCell = `<td class="mono">${w!=null?w.toFixed(1)+' kg':'—'}</td>`;
    }
    return `<tr><td class="mono">${date}</td><td>${a.name||normalizeType(a.type)}</td><td><span class="tag tag-${a.type}">${normalizeType(a.type)}</span></td><td class="mono">${km}</td><td class="mono">${dur}</td><td class="mono">${hr}</td><td class="mono" style="cursor:pointer" title="Klicken zum Bearbeiten" onclick="promptRespiration('${a.id}')">${respCell}</td><td class="mono">${elev}</td>${weightCell}</tr>`;
  }).join('')}</tbody></table>`;
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
