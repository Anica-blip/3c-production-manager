// 3C Production Manager — Tasks (sticky notes) API wrapper

async function apiGetStickyNotes(date) {
  const res = await fetch(`${CONFIG.apiBase}/tasks?date=${encodeURIComponent(date)}`, { headers: authHeaders() });
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

// description: the FULL array of {text, done} objects — sent whole and overwrites
async function apiUpdateStickyNote(id, description) {
  const res = await fetch(`${CONFIG.apiBase}/tasks/${id}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
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
