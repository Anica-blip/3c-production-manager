// 3C Production Manager — auth
// Single shared password, checked against a Cloudflare secret server-side.
// No accounts, no OAuth — this is a solo tool. Password is cached in
// localStorage after a successful check and sent as a header on every
// API call from here on.

const AUTH_KEY = '3c_production_manager_pw';

function getStoredPassword() {
  return localStorage.getItem(AUTH_KEY);
}

async function checkPassword(password) {
  const res = await fetch(`${CONFIG.apiBase}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  return res.ok;
}

async function requireLogin() {
  let pw = getStoredPassword();

  if (pw) {
    // Verify the cached password still works before trusting it —
    // covers the case where the secret was rotated since last visit.
    const ok = await checkPassword(pw);
    if (ok) return pw;
    localStorage.removeItem(AUTH_KEY);
  }

  while (true) {
    pw = prompt('3C Production Manager — enter password:');
    if (pw === null) {
      // User cancelled — stop the app from loading further rather than
      // silently proceeding unauthenticated.
      document.body.innerHTML = '<p style="padding:40px;text-align:center;color:#9b59b6;">Sign-in required.</p>';
      throw new Error('Login cancelled');
    }
    const ok = await checkPassword(pw);
    if (ok) {
      localStorage.setItem(AUTH_KEY, pw);
      return pw;
    }
    alert('Wrong password, try again.');
  }
}

function authHeaders() {
  return { 'X-Admin-Password': getStoredPassword() || '' };
}

function signOut() {
  localStorage.removeItem(AUTH_KEY);
  window.location.reload();
}
