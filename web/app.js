import { LtcApp } from "./js/ltc-app.js";
import { ensureSessionOrRedirect } from "./js/session.js";

document.addEventListener("DOMContentLoaded", async () => {
  const ok = await ensureSessionOrRedirect();
  if (!ok) return;
  const app = new LtcApp();
  app.init();
});
