// 3C Production Manager — Pipeline API wrapper

async function apiGetTemplates() {
  const res = await fetch(`${CONFIG.apiBase}/templates`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load templates');
  return res.json();
}

async function apiCreateTemplate({ type_name, platform, checklist, needs_archive }) {
  const res = await fetch(`${CONFIG.apiBase}/templates`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ type_name, platform, checklist, needs_archive }),
  });
  if (!res.ok) throw new Error('Failed to create template');
  return res.json();
}

// weekStart/weekEnd: ISO date strings, e.g. "2026-08-17" / "2026-08-23"
async function apiGetPipelineItems({ platform, weekStart, weekEnd }) {
  const params = new URLSearchParams();
  if (platform) params.set('platform', platform);
  if (weekStart) params.set('week_start', weekStart);
  if (weekEnd) params.set('week_end', weekEnd);
  const res = await fetch(`${CONFIG.apiBase}/pipeline?${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load pipeline items');
  return res.json();
}

async function apiCreatePipelineItem({ template_id, platform, title, scheduled_date, scheduled_time }) {
  const res = await fetch(`${CONFIG.apiBase}/pipeline`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ template_id, platform, title, scheduled_date, scheduled_time }),
  });
  if (!res.ok) throw new Error('Failed to create pipeline item');
  return res.json();
}

async function apiUpdatePipelineItem(id, patch) {
  const res = await fetch(`${CONFIG.apiBase}/pipeline/${id}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Failed to update pipeline item');
  return res.json();
}

async function apiDeletePipelineItem(id) {
  const res = await fetch(`${CONFIG.apiBase}/pipeline/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete pipeline item');
  return res.json();
}

async function apiExportUrl({ platform, weekStart, weekEnd }) {
  const params = new URLSearchParams({ format: 'csv' });
  if (platform) params.set('platform', platform);
  if (weekStart) params.set('week_start', weekStart);
  if (weekEnd) params.set('week_end', weekEnd);
  const res = await fetch(`${CONFIG.apiBase}/export?${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to export');
  return res.blob();
}
