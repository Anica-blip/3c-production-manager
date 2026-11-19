// 3C Production Manager — Worker API
// Personal task + pipeline tracker. Talks to D1 only. Does not touch
// Record Centre's code or database — connection point is manual, via
// the "Add to record center" checklist sub-step ticked by Chef.
//
// ROUTE TABLE
//   OPTIONS /api/*   -> CORS preflight, allowed website only
//   GET/POST/PATCH/DELETE /api/*  -> OWNER ONLY (tasks, platform-defaults,
//                                    pipeline, export)
//   There are no public routes. There is no login code in this Worker.
//
// OWNER CHECK
//   Login is GitHub sign-in through Supabase (project 3C Control Center),
//   the same login as the dashboard. The front-end sends
//   "Authorization: Bearer <Supabase access token>". The Worker asks
//   Supabase: rpc/is_owner. Only a "true" answer is allowed through.
//   Supabase keeps the session alive with refresh tokens, so there is no
//   fixed lock-out date.
//
// BINDINGS (set in wrangler.toml)
//   PRODUCTION_DB   D1 database 3c-production-manager-db
// No secrets and no variables are needed any more.
//
// The Supabase URL and anon key below are public values by design.

const SUPABASE_URL = 'https://uqyqpwhkzlhqxcqajhkn.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxeXFwd2hremxocXhjcWFqaGtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2NzY3MDMsImV4cCI6MjA2NjI1MjcwM30.AE-bdpBIATQCtNWvWo468ZWPwQ-9LWghRO6-BeAzA2U';

// Websites allowed to call this Worker from a browser.
const ALLOWED_ORIGINS = ['https://anica-blip.github.io'];

function corsHeaders(origin) {
  const headers = { Vary: 'Origin' };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET,POST,PATCH,DELETE,OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}

function genId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Returns null when the caller is the owner, otherwise a ready-made error Response.
async function requireOwner(request, respond) {
  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return respond({ error: 'Sign in required' }, 401);

  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_owner`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${match[1].trim()}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
  } catch (e) {
    console.error('Owner check unreachable:', e && e.message);
    return respond({ error: 'Could not verify sign-in' }, 503);
  }
  if (res.status === 401 || res.status === 403) return respond({ error: 'Sign in required' }, 401);
  if (!res.ok) {
    console.error('Owner check failed with status', res.status);
    return respond({ error: 'Could not verify sign-in' }, 503);
  }
  let isOwner = false;
  try {
    isOwner = (await res.json()) === true;
  } catch (e) {
    return respond({ error: 'Could not verify sign-in' }, 503);
  }
  if (!isOwner) return respond({ error: 'Not allowed' }, 403);
  return null;
}

// ── Week helper — Monday of the week containing this ISO date ────
function mondayOfISO(isoDate) {
  const d = new Date(isoDate + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin);
    const originAllowed = !origin || ALLOWED_ORIGINS.includes(origin);

    // Every response goes through here so it carries the CORS headers.
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...cors },
      });

    if (method === 'OPTIONS') {
      if (!originAllowed) return new Response(null, { status: 403, headers: { Vary: 'Origin' } });
      return new Response(null, { status: 204, headers: cors });
    }
    // A browser on any other website is refused before anything else happens.
    if (!originAllowed) {
      return new Response(JSON.stringify({ error: 'Not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', Vary: 'Origin' },
      });
    }
    // Owner only. Nothing below runs without it.
    const denied = await requireOwner(request, json);
    if (denied) return denied;

    try {
      // ── Tasks — sticky notes: title + tickable bullet points ──
      if (path === '/api/tasks' && method === 'GET') {
        const date = url.searchParams.get('date');
        const weekStart = url.searchParams.get('week_start');
        const weekEnd = url.searchParams.get('week_end');
        let sql, vals;
        if (weekStart && weekEnd) {
          sql = 'SELECT * FROM tasks WHERE entry_date BETWEEN ? AND ? ORDER BY entry_date ASC, entry_time ASC, created_at ASC';
          vals = [weekStart, weekEnd];
        } else if (date) {
          sql = 'SELECT * FROM tasks WHERE entry_date = ? ORDER BY entry_time ASC, created_at ASC';
          vals = [date];
        } else {
          return json({ error: 'date or week_start+week_end is required' }, 400);
        }
        const { results } = await env.PRODUCTION_DB.prepare(sql).bind(...vals).all();
        return json(results.map(r => ({ ...r, description: JSON.parse(r.description_json || '[]') })));
      }

      if (path === '/api/tasks' && method === 'POST') {
        const b = await request.json();
        if (!b.entry_date || !b.title) return json({ error: 'entry_date and title are required' }, 400);
        const description = (Array.isArray(b.description) ? b.description : [])
          .map(item => typeof item === 'string' ? { text: item, done: false } : { text: String(item.text || ''), done: !!item.done });
        const id = genId('note');
        await env.PRODUCTION_DB.prepare(
          `INSERT INTO tasks (id, entry_date, entry_time, title, description_json) VALUES (?, ?, ?, ?, ?)`
        ).bind(id, b.entry_date, b.entry_time || null, b.title, JSON.stringify(description)).run();
        return json({ id }, 201);
      }

      const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
      if (taskMatch && method === 'PATCH') {
        const b = await request.json();
        const fields = [];
        const vals = [];
        for (const key of ['title', 'entry_date', 'entry_time']) {
          if (key in b) { fields.push(`${key} = ?`); vals.push(b[key]); }
        }
        if (Array.isArray(b.description)) {
          fields.push('description_json = ?');
          vals.push(JSON.stringify(b.description));
        }
        if (!fields.length) return json({ error: 'Nothing to update' }, 400);
        vals.push(taskMatch[1]);
        await env.PRODUCTION_DB.prepare(
          `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`
        ).bind(...vals).run();
        return json({ ok: true });
      }

      if (taskMatch && method === 'DELETE') {
        await env.PRODUCTION_DB.prepare('DELETE FROM tasks WHERE id = ?').bind(taskMatch[1]).run();
        return json({ ok: true });
      }

      // ── Platform defaults — a starting suggestion only, never a
      // locked structure. Frontend pre-fills the Add Task form with
      // this, fully editable before (and after) saving. ──────────
      if (path === '/api/platform-defaults' && method === 'GET') {
        const platform = url.searchParams.get('platform');
        if (platform) {
          const row = await env.PRODUCTION_DB
            .prepare('SELECT * FROM platform_defaults WHERE platform = ?').bind(platform).first();
          return json(row ? { ...row, checklist: JSON.parse(row.default_checklist_json) } : { platform, checklist: [] });
        }
        const { results } = await env.PRODUCTION_DB.prepare('SELECT platform FROM platform_defaults ORDER BY platform ASC').all();
        return json(results.map(r => r.platform));
      }

      if (path === '/api/platform-defaults' && method === 'POST') {
        const b = await request.json();
        if (!b.platform) return json({ error: 'platform is required' }, 400);
        const checklist = Array.isArray(b.checklist) ? b.checklist : [];
        await env.PRODUCTION_DB.prepare(
          `INSERT OR REPLACE INTO platform_defaults (platform, default_checklist_json) VALUES (?, ?)`
        ).bind(b.platform, JSON.stringify(checklist)).run();
        return json({ platform: b.platform }, 201);
      }

      // ── Pipeline items — checklist lives on the item itself ─
      if (path === '/api/pipeline' && method === 'GET') {
        const platform = url.searchParams.get('platform');
        const weekStart = url.searchParams.get('week_start');
        const weekEnd = url.searchParams.get('week_end');
        let sql = 'SELECT * FROM pipeline_items WHERE 1=1';
        const vals = [];
        if (platform) { sql += ' AND platform = ?'; vals.push(platform); }
        if (weekStart && weekEnd) {
          sql += ' AND scheduled_date BETWEEN ? AND ?';
          vals.push(weekStart, weekEnd);
        }
        sql += ' ORDER BY scheduled_date ASC, scheduled_time ASC';
        const { results } = await env.PRODUCTION_DB.prepare(sql).bind(...vals).all();
        return json(results.map(r => ({ ...r, checklist: JSON.parse(r.checklist_json || '[]') })));
      }

      if (path === '/api/pipeline' && method === 'POST') {
        const b = await request.json();
        if (!b.platform || !b.title) {
          return json({ error: 'platform and title are required' }, 400);
        }
        const checklist = (Array.isArray(b.checklist) ? b.checklist : [])
          .map(step => ({ step: String(step), done: false }));
        const id = genId('item');
        await env.PRODUCTION_DB.prepare(
          `INSERT INTO pipeline_items (id, platform, title, scheduled_date, scheduled_time, stage, checklist_json)
           VALUES (?, ?, ?, ?, ?, 'create', ?)`
        ).bind(id, b.platform, b.title, b.scheduled_date || null, b.scheduled_time || null, JSON.stringify(checklist)).run();
        return json({ id }, 201);
      }

      const itemMatch = path.match(/^\/api\/pipeline\/([^/]+)$/);
      if (itemMatch && method === 'PATCH') {
        const b = await request.json();
        const fields = [];
        const vals = [];

        for (const key of ['title', 'scheduled_date', 'scheduled_time', 'stage',
                            'scheduled_platform_done', 'scheduled_record_center_done']) {
          if (key in b) { fields.push(`${key} = ?`); vals.push(b[key]); }
        }

        // Checklist is sent WHOLE and overwrites — structural edits
        // (add/delete/reorder a step) aren't a simple merge like a
        // single tick was in the old design.
        if (Array.isArray(b.checklist)) {
          fields.push('checklist_json = ?');
          vals.push(JSON.stringify(b.checklist));
        }

        if (b.archive_confirmed === true) {
          fields.push('archive_confirmed = 1', "archive_confirmed_at = datetime('now')");
          if (b.archive_note_ref) { fields.push('archive_note_ref = ?'); vals.push(b.archive_note_ref); }
        }

        if (!fields.length) return json({ error: 'Nothing to update' }, 400);
        vals.push(itemMatch[1]);
        await env.PRODUCTION_DB.prepare(
          `UPDATE pipeline_items SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`
        ).bind(...vals).run();
        return json({ ok: true });
      }

      if (itemMatch && method === 'DELETE') {
        await env.PRODUCTION_DB.prepare('DELETE FROM pipeline_items WHERE id = ?').bind(itemMatch[1]).run();
        return json({ ok: true });
      }

      // ── Export — spreadsheet view / CSV download ──────────
      if (path === '/api/export' && method === 'GET') {
        const platform = url.searchParams.get('platform');
        const weekStart = url.searchParams.get('week_start');
        const weekEnd = url.searchParams.get('week_end');
        let sql = "SELECT * FROM pipeline_items WHERE stage IN ('publish','archive')";
        const vals = [];
        if (platform) { sql += ' AND platform = ?'; vals.push(platform); }
        if (weekStart && weekEnd) { sql += ' AND scheduled_date BETWEEN ? AND ?'; vals.push(weekStart, weekEnd); }
        sql += ' ORDER BY scheduled_date ASC';
        const { results } = await env.PRODUCTION_DB.prepare(sql).bind(...vals).all();

        if (url.searchParams.get('format') === 'csv') {
          const header = 'Title,Platform,Date,Time,Stage,Archive confirmed,Archive note ref\n';
          const rows = results.map(r => {
            const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
            return [r.title, r.platform, r.scheduled_date, r.scheduled_time, r.stage,
                    r.archive_confirmed ? 'Yes' : 'No', r.archive_note_ref || '']
              .map(esc).join(',');
          }).join('\n');
          return new Response(header + rows, {
            headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="production-export.csv"', ...cors },
          });
        }
        return json(results);
      }

      return json({ error: 'Not found' }, 404);
    } catch (err) {
      console.error('API error:', err);
      return json({ error: 'Server error' }, 500);
    }
  },

  // Daily cron — PER PLATFORM, PER WEEK, all-or-nothing. A week's items
  // only become eligible once every single item in that platform+week
  // group is archived — one unfinished item holds the whole group open,
  // exactly as Chef specified. The 15-day clock starts from the LATEST
  // archive timestamp in the group (the moment the group actually
  // finished), not from any individual item's own archive date.
  async scheduled(event, env, ctx) {
    const { results } = await env.PRODUCTION_DB.prepare('SELECT * FROM pipeline_items').all();

    const groups = {};
    for (const item of results) {
      if (!item.scheduled_date) continue;
      const key = `${item.platform}|${mondayOfISO(item.scheduled_date)}`;
      (groups[key] ||= []).push(item);
    }

    const now = Date.now();
    const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;
    let deleted = 0;

    for (const key in groups) {
      const items = groups[key];
      const allArchived = items.every(i => i.archive_confirmed === 1);
      if (!allArchived) continue;

      const latestArchiveTime = Math.max(
        ...items.map(i => i.archive_confirmed_at ? new Date(i.archive_confirmed_at + 'Z').getTime() : 0)
      );
      if (now - latestArchiveTime < fifteenDaysMs) continue;

      for (const item of items) {
        await env.PRODUCTION_DB.prepare('DELETE FROM pipeline_items WHERE id = ?').bind(item.id).run();
        deleted++;
      }
    }

    console.log(`Week-based cleanup: removed ${deleted} items across fully-archived platform/weeks 15+ days old`);
  },
};
