// 3C Production Manager — auth
// GitHub OAuth, restricted to Chef's account. Session is a signed bearer
// token, stored in localStorage and sent via the Authorization header —
// same pattern as Record Centre, not a cookie. GitHub Pages and the
// Worker's custom domain are different sites; Firefox's Total Cookie
// Protection and Safari's ITP block cross-site cookies by default, which
// is exactly what broke the earlier cookie-based version.

const TOKEN_KEY = '3c_pm_token';

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

async function requireLogin() {
    // First: did we just land back here from GitHub's redirect? The
    // token rides in the URL fragment (#token=...), never sent to any
    // server, so it's safe there — but it needs pulling out and into
    // localStorage before this URL is shared, refreshed, or bookmarked.
    const hashMatch = window.location.hash.match(/#token=(.+)/);
    if (hashMatch) {
        localStorage.setItem(TOKEN_KEY, hashMatch[1]);
        history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    const token = getToken();
    if (token) {
        const res = await fetch(`${CONFIG.apiBase}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({ authenticated: false }));
        if (data.authenticated) return true;
        localStorage.removeItem(TOKEN_KEY); // stored token expired or was revoked
    }

    // Not logged in — send to GitHub. It redirects back here with a
    // fresh token in the URL fragment once verified.
    window.location.href = `${CONFIG.apiBase}/auth/login`;
    throw new Error('Redirecting to login');
}

function authHeaders() {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    window.location.reload();
}
