// 3C Production Manager — auth
// GitHub OAuth, restricted to Chef's account. The session is a signed,
// HttpOnly cookie the Worker sets — invisible to this JS by design (that's
// what HttpOnly means), so this file just asks the Worker "am I logged
// in?" and lets the cookie ride along automatically on every request.

async function requireLogin() {
    const res = await fetch(`${CONFIG.apiBase}/auth/me`, { credentials: 'include' });
    const data = await res.json().catch(() => ({ authenticated: false }));
    if (data.authenticated) return true;

    // Not logged in — send to GitHub. It redirects back to the Worker's
    // callback, which sets the session cookie and lands back here.
    window.location.href = `${CONFIG.apiBase}/auth/login`;
    throw new Error('Redirecting to login');
}

function authHeaders() {
    // Nothing to attach manually — the session travels via the cookie,
    // as long as every fetch includes credentials: 'include'.
    return {};
}

function signOut() {
    window.location.href = `${CONFIG.apiBase}/auth/logout`;
}
