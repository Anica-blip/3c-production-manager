// 3C Production Manager — Worker API
// Personal task + pipeline tracker. Talks to D1 only. Does not touch
// Record Centre's code or database — connection point is manual, via
// the "Add to record center" checklist sub-step ticked by Chef.
//
// Auth: GitHub OAuth, restricted to a single account. Matches Record
// Centre's proven pattern — a signed session token via the Authorization
// header, stored in localStorage on the front-end, NOT a cookie (Firefox
// Total Cookie Protection / Safari ITP block cross-site cookies by
// default, which is what broke the earlier cookie-based version). The
// only cookie used anywhere is the short-lived OAuth state value, set
// and read within the same request chain, never crossing origins.

const GITHUB_USERNAME = 'Anica-blip'; // only this GitHub account may log in
const FRONTEND_URL = 'https://anica-blip.github.io/3c-production-manager/';
const CALLBACK_URL = 'https://productionmanager.threadcommand.center/api/auth/callback';
const STATE_COOKIE = '3c_pm_oauth_state';
const SESSION_MAX_AGE = 90 * 24 * 60 * 60; // 90 days, seconds

function corsResponse(env, response) {
  response.headers.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN);
  response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function genId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Session signing (HMAC-SHA256, no external deps) ──────────────
async function hmac(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return base64url(String.fromCharCode(...new Uint8Array(sigBuf)));
}

function base64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
}

function randomToken() {
  return base64url(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));
}

async function signSession(payload, secret) {
  const body = base64url(JSON.stringify({ ...payload, exp: Date.now() + SESSION_MAX_AGE * 1000 }));
  const sig = await hmac(body, secret);
  return `${body}.${sig}`;
}

async function verifySession(token, secret) {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = await hmac(body, secret);
  if (expected !== sig) return null;
  const payload = JSON.parse(base64urlDecode(body));
  if (payload.exp < Date.now()) return null;
  return payload;
}

// ── Cookies — only ever used for the short-lived OAuth state value ──
function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  return header.split(';').reduce((acc, part) => {
    const [k, ...v] = part.trim().split('=');
    if (k) acc[k] = decodeURIComponent(v.join('='));
    return acc;
  }, {});
}

function withCookie(response, name, value, { maxAge }) {
  const res = new Response(response.body, response);
  res.headers.append(
    'Set-Cookie',
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
  );
  return res;
}

async function getSessionUser(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  const payload = await verifySession(token, env.SESSION_SECRET);
  if (!payload) return null;
  if (payload.login !== GITHUB_USERNAME) return null;
  return { login: payload.login };
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

    if (method === 'OPTIONS') return corsResponse(env, new Response(null, { status: 204 }));

    try {
      // ── OAuth: start login ──────────────────────────────────
      if (path === '/api/auth/login' && method === 'GET') {
        const state = randomToken();
        const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
        authorizeUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
        authorizeUrl.searchParams.set('redirect_uri', CALLBACK_URL);
        authorizeUrl.searchParams.set('scope', 'read:user');
        authorizeUrl.searchParams.set('state', state);

        const res = Response.redirect(authorizeUrl.toString(), 302);
        return withCookie(res, STATE_COOKIE, state, { maxAge: 600 });
      }

      // ── OAuth: callback from GitHub ─────────────────────────
      if (path === '/api/auth/callback' && method === 'GET') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const cookies = parseCookies(request);

        if (!code || !state || state !== cookies[STATE_COOKIE]) {
          return new Response('Login failed: state mismatch. Please try logging in again.', { status: 400 });
        }

        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code,
            redirect_uri: CALLBACK_URL,
          }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
          return new Response('GitHub login failed — no access token returned.', { status: 401 });
        }

        const userRes = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': '3c-production-manager' },
        });
        const userData = await userRes.json();

        if (userData.login !== GITHUB_USERNAME) {
          return new Response(`Access restricted to ${GITHUB_USERNAME}.`, { status: 403 });
        }

        const session = await signSession({ login: userData.login }, env.SESSION_SECRET);
        const res = Response.redirect(`${FRONTEND_URL}#token=${session}`, 302);
        return withCookie(res, STATE_COOKIE, '', { maxAge: 0 });
      }

      // ── OAuth: check session ────────────────────────────────
      if (path === '/api/auth/me' && method === 'GET') {
        const user = await getSessionUser(request, env);
        return corsResponse(env, json({ authenticated: !!user }));
      }

      // Everything past this point requires a valid bearer token.
      if (path.startsWith('/api/') && path !== '/api/auth/login' && path !== '/api/auth/callback') {
        const user = await getSessionUser(request, env);
        if (!user) return corsResponse(env, json({ error: 'Unauthorized' }, 401));
      }

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
          return corsResponse(env, json({ error: 'date or week_start+week_end is required' }, 400));
        }
        const { results } = await env.PRODUCTION_DB.prepare(sql).bind(...vals).all();
        return corsResponse(env, json(results.map(r => ({ ...r, description: JSON.parse(r.description_json || '[]') }))));
      }

      if (path === '/api/tasks' && method === 'POST') {
        const b = await request.json();
        if (!b.entry_date || !b.title) return corsResponse(env, json({ error: 'entry_date and title are required' }, 400));
        const description = (Array.isArray(b.description) ? b.description : [])
          .map(item => typeof item === 'string' ? { text: item, done: false } : { text: String(item.text || ''), done: !!item.done });
        const id = genId('note');
        await env.PRODUCTION_DB.prepare(
          `INSERT INTO tasks (id, entry_date, entry_time, title, description_json) VALUES (?, ?, ?, ?, ?)`
        ).bind(id, b.entry_date, b.entry_time || null, b.title, JSON.stringify(description)).run();
        return corsResponse(env, json({ id }, 201));
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
        if (!fields.length) return corsResponse(env, json({ error: 'Nothing to update' }, 400));
        vals.push(taskMatch[1]);
        await env.PRODUCTION_DB.prepare(
          `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`
        ).bind(...vals).run();
        return corsResponse(env, json({ ok: true }));
      }

      if (taskMatch && method === 'DELETE') {
        await env.PRODUCTION_DB.prepare('DELETE FROM tasks WHERE id = ?').bind(taskMatch[1]).run();
        return corsResponse(env, json({ ok: true }));
      }

      // ── Platform defaults — a starting suggestion only, never a
      // locked structure. Frontend pre-fills the Add Task form with
      // this, fully editable before (and after) saving. ──────────
      if (path === '/api/platform-defaults' && method === 'GET') {
        const platform = url.searchParams.get('platform');
        if (platform) {
          const row = await env.PRODUCTION_DB
            .prepare('SELECT * FROM platform_defaults WHERE platform = ?').bind(platform).first();
          return corsResponse(env, json(row ? { ...row, checklist: JSON.parse(row.default_checklist_json) } : { platform, checklist: [] }));
        }
        const { results } = await env.PRODUCTION_DB.prepare('SELECT platform FROM platform_defaults ORDER BY platform ASC').all();
        return corsResponse(env, json(results.map(r => r.platform)));
      }

      if (path === '/api/platform-defaults' && method === 'POST') {
        const b = await request.json();
        if (!b.platform) return corsResponse(env, json({ error: 'platform is required' }, 400));
        const checklist = Array.isArray(b.checklist) ? b.checklist : [];
        await env.PRODUCTION_DB.prepare(
          `INSERT OR REPLACE INTO platform_defaults (platform, default_checklist_json) VALUES (?, ?)`
        ).bind(b.platform, JSON.stringify(checklist)).run();
        return corsResponse(env, json({ platform: b.platform }, 201));
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
        return corsResponse(env, json(results.map(r => ({ ...r, checklist: JSON.parse(r.checklist_json || '[]') }))));
      }

      if (path === '/api/pipeline' && method === 'POST') {
        const b = await request.json();
        if (!b.platform || !b.title) {
          return corsResponse(env, json({ error: 'platform and title are required' }, 400));
        }
        const checklist = (Array.isArray(b.checklist) ? b.checklist : [])
          .map(step => ({ step: String(step), done: false }));
        const id = genId('item');
        await env.PRODUCTION_DB.prepare(
          `INSERT INTO pipeline_items (id, platform, title, scheduled_date, scheduled_time, stage, checklist_json)
           VALUES (?, ?, ?, ?, ?, 'create', ?)`
        ).bind(id, b.platform, b.title, b.scheduled_date || null, b.scheduled_time || null, JSON.stringify(checklist)).run();
        return corsResponse(env, json({ id }, 201));
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

        if (!fields.length) return corsResponse(env, json({ error: 'Nothing to update' }, 400));
        vals.push(itemMatch[1]);
        await env.PRODUCTION_DB.prepare(
          `UPDATE pipeline_items SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`
        ).bind(...vals).run();
        return corsResponse(env, json({ ok: true }));
      }

      if (itemMatch && method === 'DELETE') {
        await env.PRODUCTION_DB.prepare('DELETE FROM pipeline_items WHERE id = ?').bind(itemMatch[1]).run();
        return corsResponse(env, json({ ok: true }));
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
          return corsResponse(env, new Response(header + rows, {
            headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="production-export.csv"' },
          }));
        }
        return corsResponse(env, json(results));
      }

      return corsResponse(env, json({ error: 'Not found' }, 404));
    } catch (err) {
      console.error('API error:', err);
      return corsResponse(env, json({ error: err.message || 'Server error' }, 500));
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
