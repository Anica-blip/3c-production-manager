// 3C Production Manager — auth
// GitHub OAuth, restricted to Chef's account. Session is a signed bearer
// token, stored in localStorage and sent via the Authorization header —
// same pattern as Record Centre, not a cookie. GitHub Pages and the
// Worker's custom domain are different sites; Firefox's Total Cookie
// Protection and Safari's ITP block cross-site cookies by default, which
// is exactly what broke the earlier cookie-based version.
//
// Two entry points, matching Record Centre's naming:
//   requireLogin()      — called from index.html. Redirects to
//                          login.html (a local page) if not signed in.
//   redirectIfLoggedIn()/redirectToLogin() — called from login.html.
//                          The GitHub redirect only actually happens
//                          when the button there is clicked.

const TOKEN_KEY = '3c_pm_token';

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

async function isLoggedIn() {
    const token = getToken();
    if (!token) return false;
    const res = await fetch(`${CONFIG.apiBase}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({ authenticated: false }));
    if (!data.authenticated) localStorage.removeItem(TOKEN_KEY); // stored token expired or was revoked
    return data.authenticated;
}

async function requireLogin() {
    // Did we just land back here from GitHub's redirect? The token rides
    // in the URL fragment (#token=...), never sent to any server, so
    // it's safe there — pull it into localStorage and clean the URL.
    const hashMatch = window.location.hash.match(/#token=(.+)/);
    if (hashMatch) {
        localStorage.setItem(TOKEN_KEY, hashMatch[1]);
        history.replaceState(null, '', window.location.pathname + window.location.search);
        return true;
    }

    if (await isLoggedIn()) return true;

    window.location.href = 'login.html';
    throw new Error('Redirecting to login page');
}

// Called from login.html — already signed in? Skip straight to the app.
async function redirectIfLoggedIn() {
    if (await isLoggedIn()) {
        window.location.href = 'index.html';
    }
}

// Called from login.html's button click — this is what actually starts
// the GitHub OAuth flow. Nothing redirects there automatically anymore.
function redirectToLogin() {
    window.location.href = `${CONFIG.apiBase}/auth/login`;
}

function authHeaders() {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = 'login.html';
}
