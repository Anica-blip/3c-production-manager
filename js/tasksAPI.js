// 3C Production Manager — Tasks (diary) API wrapper

async function apiGetDiaryEntries(date) {
  const res = await fetch(`${CONFIG.apiBase}/tasks?date=${encodeURIComponent(date)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load diary entries');
  return res.json();
}

async function apiCreateDiaryEntry({ entry_date, entry_time, text }) {
  const res = await fetch(`${CONFIG.apiBase}/tasks`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry_date, entry_time, text }),
  });
  if (!res.ok) throw new Error('Failed to create diary entry');
  return res.json();
}

async function apiDeleteDiaryEntry(id) {
  const res = await fetch(`${CONFIG.apiBase}/tasks/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete diary entry');
  return res.json();
}
