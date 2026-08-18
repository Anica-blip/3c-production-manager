// 3C Production Manager — Pipeline API wrapper

async function apiGetPlatforms() {
  const res = await fetch(`${CONFIG.apiBase}/platform-defaults`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load platforms');
  return res.json(); // array of platform name strings
}

async function apiGetPlatformDefault(platform) {
  const res = await fetch(`${CONFIG.apiBase}/platform-defaults?platform=${encodeURIComponent(platform)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load platform default');
  return res.json(); // { platform, checklist: [...] }
}

async function apiCreatePlatform({ platform, checklist }) {
  const res = await fetch(`${CONFIG.apiBase}/platform-defaults`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, checklist }),
  });
  if (!res.ok) throw new Error('Failed to create platform');
  return res.json();
}

// weekStart/weekEnd: ISO date strings, e.g. "2026-08-18" / "2026-08-24"
async function apiGetPipelineItems({ platform, weekStart, weekEnd }) {
  const params = new URLSearchParams();
  if (platform) params.set('platform', platform);
  if (weekStart) params.set('week_start', weekStart);
  if (weekEnd) params.set('week_end', weekEnd);
  const res = await fetch(`${CONFIG.apiBase}/pipeline?${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load pipeline items');
  return res.json();
}

// checklist here is an array of plain step-name strings — brand new,
// nothing ticked yet.
async function apiCreatePipelineItem({ platform, title, scheduled_date, scheduled_time, checklist }) {
  const res = await fetch(`${CONFIG.apiBase}/pipeline`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, title, scheduled_date, scheduled_time, checklist }),
  });
  if (!res.ok) throw new Error('Failed to create pipeline item');
  return res.json();
}

// patch.checklist, if present, is the FULL array of {step, done} objects —
// sent whole and overwrites, since add/delete/reorder aren't a simple merge.
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
