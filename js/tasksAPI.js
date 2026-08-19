// 3C Production Manager — Tasks (sticky notes) API wrapper

async function apiGetStickyNotesForWeek({ weekStart, weekEnd }) {
  const params = new URLSearchParams({ week_start: weekStart, week_end: weekEnd });
  const res = await fetch(`${CONFIG.apiBase}/tasks?${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load sticky notes');
  return res.json();
}

// description: array of plain bullet-text strings, all unticked at creation
async function apiCreateStickyNote({ entry_date, entry_time, title, description }) {
  const res = await fetch(`${CONFIG.apiBase}/tasks`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry_date, entry_time, title, description }),
  });
  if (!res.ok) throw new Error('Failed to create sticky note');
  return res.json();
}

// patch: any combination of { title, entry_date, entry_time, description }.
// description, if present, is the FULL array of {text, done} objects and
// overwrites — used both for a quick single-bullet tick and a full edit.
async function apiUpdateStickyNote(id, patch) {
  const res = await fetch(`${CONFIG.apiBase}/tasks/${id}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Failed to update sticky note');
  return res.json();
}

async function apiDeleteStickyNote(id) {
  const res = await fetch(`${CONFIG.apiBase}/tasks/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete sticky note');
  return res.json();
}
