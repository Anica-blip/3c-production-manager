// 3C Production Manager — Worker API
// Personal task + pipeline tracker. Talks to D1 only. Does not touch
// Record Centre's code or database — connection point is manual, via
// the "Add to record center" checklist sub-step ticked by Chef.
//
// Auth: GitHub OAuth, restricted to a single account. Matches Record
// Centre's proven pattern exactly — a signed session token passed via
// the Authorization header and stored in localStorage on the front-end,
// NOT a cookie. GitHub Pages and this Worker are different sites, and
// Firefox's Total Cookie Protection (plus Safari ITP) blocks cross-site
// cookies by default — a bearer token has no such problem. The only
// cookie used anywhere here is the short-lived OAuth state value, which
// is set and read within the same request chain (GitHub → this Worker's
// own callback) and never crosses origins, so it's unaffected.

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

// ── Session signing (HMAC-SHA256, no external deps) — same mechanism
// Record Centre uses, so both are auditable against the same pattern. ──
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

async function guarded(request, env, handler) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  return handler();
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
        // Token rides in the URL fragment (#), not a query string — the
        // fragment never gets sent to any server, including this one, so
        // it never lands in a request log. The front-end reads it once
        // from window.location.hash, stores it in localStorage, and
        // strips it from the URL.
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

      // ── Tasks ──────────────────────────────────────────────
      if (path === '/api/tasks' && method === 'GET') {
        const { results } = await env.PRODUCTION_DB
          .prepare('SELECT * FROM tasks ORDER BY done ASC, due_date ASC, created_at DESC')
          .all();
        return corsResponse(env, json(results));
      }

      if (path === '/api/tasks' && method === 'POST') {
        const b = await request.json();
        if (!b.title) return corsResponse(env, json({ error: 'title is required' }, 400));
        const id = genId('task');
        await env.PRODUCTION_DB.prepare(
          `INSERT INTO tasks (id, title, notes, due_date) VALUES (?, ?, ?, ?)`
        ).bind(id, b.title, b.notes || null, b.due_date || null).run();
        return corsResponse(env, json({ id }, 201));
      }

      const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
      if (taskMatch && method === 'PATCH') {
        const b = await request.json();
        const fields = [];
        const vals = [];
        for (const key of ['title', 'notes', 'due_date', 'done']) {
          if (key in b) { fields.push(`${key} = ?`); vals.push(b[key]); }
        }
        if (!fields.length) return corsResponse(env, json({ error: 'Nothing to update' }, 400));
        vals.push(taskMatch[1]);
        await env.PRODUCTION_DB.prepare(
          `UPDATE tasks SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`
        ).bind(...vals).run();
        return corsResponse(env, json({ ok: true }));
      }

      if (taskMatch && method === 'DELETE') {
        await env.PRODUCTION_DB.prepare('DELETE FROM tasks WHERE id = ?').bind(taskMatch[1]).run();
        return corsResponse(env, json({ ok: true }));
      }

      // ── Pipeline templates (checklist definitions per content type) ──
      if (path === '/api/templates' && method === 'GET') {
        const { results } = await env.PRODUCTION_DB
          .prepare('SELECT * FROM pipeline_templates ORDER BY type_name ASC')
          .all();
        return corsResponse(env, json(results.map(r => ({ ...r, checklist: JSON.parse(r.checklist_json) }))));
      }

      if (path === '/api/templates' && method === 'POST') {
        const b = await request.json();
        if (!b.type_name || !Array.isArray(b.checklist) || !b.checklist.length) {
          return corsResponse(env, json({ error: 'type_name and a non-empty checklist array are required' }, 400));
        }
        const id = genId('tpl');
        await env.PRODUCTION_DB.prepare(
          `INSERT INTO pipeline_templates (id, type_name, platform, checklist_json, needs_archive) VALUES (?, ?, ?, ?, ?)`
        ).bind(id, b.type_name, b.platform || null, JSON.stringify(b.checklist), b.needs_archive === false ? 0 : 1).run();
        return corsResponse(env, json({ id }, 201));
      }

      // ── Pipeline items ─────────────────────────────────────
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
        return corsResponse(env, json(results.map(r => ({ ...r, checklist_state: JSON.parse(r.checklist_state_json || '{}') }))));
      }

      if (path === '/api/pipeline' && method === 'POST') {
        const b = await request.json();
        if (!b.template_id || !b.platform || !b.title) {
          return corsResponse(env, json({ error: 'template_id, platform, and title are required' }, 400));
        }
        const id = genId('item');
        await env.PRODUCTION_DB.prepare(
          `INSERT INTO pipeline_items (id, template_id, platform, title, scheduled_date, scheduled_time, stage)
           VALUES (?, ?, ?, ?, ?, ?, 'create')`
        ).bind(id, b.template_id, b.platform, b.title, b.scheduled_date || null, b.scheduled_time || null).run();
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

        if (b.checklist_state) {
          const existing = await env.PRODUCTION_DB
            .prepare('SELECT checklist_state_json FROM pipeline_items WHERE id = ?')
            .bind(itemMatch[1]).first();
          const merged = { ...(existing ? JSON.parse(existing.checklist_state_json || '{}') : {}), ...b.checklist_state };
          fields.push('checklist_state_json = ?');
          vals.push(JSON.stringify(merged));
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

  // Daily cron — deletes only the LIVE tracking row for items archived
  // 15+ days ago. The permanent record is the .md filed in COG and/or
  // the CSV already exported; this just clears finished pipeline clutter.
  async scheduled(event, env, ctx) {
    const cutoff = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    const { meta } = await env.PRODUCTION_DB.prepare(
      `DELETE FROM pipeline_items WHERE archive_confirmed = 1 AND archive_confirmed_at < ?`
    ).bind(cutoff).run();
    console.log(`15-day cleanup: removed ${meta?.changes ?? 0} archived items`);
  },
};
