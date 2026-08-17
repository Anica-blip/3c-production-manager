// 3C Production Manager — Tasks API wrapper

async function apiGetTasks() {
  const res = await fetch(`${CONFIG.apiBase}/tasks`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load tasks');
  return res.json();
}

async function apiCreateTask({ title, notes, due_date }) {
  const res = await fetch(`${CONFIG.apiBase}/tasks`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, notes, due_date }),
  });
  if (!res.ok) throw new Error('Failed to create task');
  return res.json();
}

async function apiUpdateTask(id, patch) {
  const res = await fetch(`${CONFIG.apiBase}/tasks/${id}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Failed to update task');
  return res.json();
}

async function apiDeleteTask(id) {
  const res = await fetch(`${CONFIG.apiBase}/tasks/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete task');
  return res.json();
}
