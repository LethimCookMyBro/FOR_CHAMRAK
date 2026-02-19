import { AUTH_BASE } from "./config.js";

async function checkSession() {
  try {
    const response = await fetch(`${AUTH_BASE}/me`, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureSessionOrRedirect() {
  const ok = await checkSession();
  if (!ok) {
    window.location.replace("/login.html");
    return false;
  }
  return true;
}

export { checkSession, ensureSessionOrRedirect };
