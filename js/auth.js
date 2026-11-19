// 3C Production Manager — auth
// GitHub sign-in through Supabase (project 3C Control Center), the same login
// as the dashboard. Supabase keeps the session alive with refresh tokens, so
// there is no fixed lock-out date. Every call to the Worker carries the
// current Supabase access token; the Worker checks it with is_owner().
//
// Needs the Supabase library (loaded from jsDelivr in index.html and
// login.html) and config.js before this file.
//
// Entry points:
//   requireLogin()      — called from index.html. Redirects to login.html if
//                          there is no owner session.
//   redirectIfLoggedIn()/redirectToLogin() — called from login.html. The
//                          GitHub redirect only happens when the button is
//                          clicked.

// Own storage key, so this app's session does not mix with the other apps
// that live on the same github.io address.
const supabaseClient = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
    auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'sb-3c-production-manager-login',
    },
});

// A signed-in session that is also the owner. Anyone else is signed out.
async function getOwnerSession() {
    const { data } = await supabaseClient.auth.getSession();
    const session = data && data.session;
    if (!session) return { session: null, notOwner: false };
    const { data: isOwner, error } = await supabaseClient.rpc('is_owner');
    // The check itself failed (for example no network): do not sign anyone out.
    if (error) return { session: null, notOwner: false };
    if (isOwner !== true) {
        await supabaseClient.auth.signOut();
        return { session: null, notOwner: true };
    }
    return { session, notOwner: false };
}

async function requireLogin() {
    const { session, notOwner } = await getOwnerSession();
    if (session) return true;
    window.location.href = notOwner ? 'login.html?notice=notowner' : 'login.html';
    throw new Error('Redirecting to login page');
}

// Called from login.html — already signed in as the owner? Skip straight to the app.
async function redirectIfLoggedIn() {
    const { session, notOwner } = await getOwnerSession();
    if (session) {
        window.location.href = 'index.html';
        return;
    }
    return notOwner ? 'notowner' : null;
}

// Called from login.html's button click — this is what actually starts the
// GitHub sign-in. Nothing redirects there automatically.
async function redirectToLogin() {
    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: new URL('index.html', window.location.href).href },
    });
    if (error) throw error;
}

// Always the current token: Supabase refreshes it when it is about to expire.
async function authHeaders() {
    const { data } = await supabaseClient.auth.getSession();
    const token = data && data.session ? data.session.access_token : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function signOut() {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}
