const ICU_BASE = 'https://intervals.icu/api/v1';

function authHeader(apiKey) {
  return { Authorization: 'Basic ' + Buffer.from('API_KEY:' + apiKey).toString('base64') };
}

async function icuFetch(athleteId, apiKey, path, options = {}) {
  const res = await fetch(`${ICU_BASE}/athlete/${athleteId}${path}`, {
    ...options,
    headers: {
      ...authHeader(apiKey),
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Intervals.icu API ${res.status}: ${body || res.statusText}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function createIntervalsClient(athleteId, apiKey) {
  return {
    getActivities(days = 30) {
      return icuFetch(athleteId, apiKey, `/activities?oldest=${daysAgoISO(days)}`);
    },
    getWellness(days = 30) {
      return icuFetch(athleteId, apiKey, `/wellness?oldest=${daysAgoISO(days)}`);
    },
    getAthleteProfile() {
      return icuFetch(athleteId, apiKey, '');
    },
    createEvent({ date, type, durationMinutes, description }) {
      return icuFetch(athleteId, apiKey, '/events', {
        method: 'POST',
        body: JSON.stringify({
          start_date_local: `${date}T06:00:00`,
          category: 'WORKOUT',
          type,
          moving_time: durationMinutes ? durationMinutes * 60 : undefined,
          description,
        }),
      });
    },
    deleteEvent(eventId) {
      return icuFetch(athleteId, apiKey, `/events/${eventId}`, { method: 'DELETE' });
    },
  };
}
