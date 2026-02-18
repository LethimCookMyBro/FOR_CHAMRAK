const REMEMBER_KEY = "ltc_login_remember_v2";

function loadRememberPreference() {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return { remember: false, username: "" };
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object") return { remember: false, username: "" };
    return {
      remember: Boolean(payload.remember),
      username: String(payload.username || "")
    };
  } catch {
    return { remember: false, username: "" };
  }
}

function saveRememberPreference(remember, username) {
  if (!remember) {
    localStorage.removeItem(REMEMBER_KEY);
    return;
  }
  localStorage.setItem(
    REMEMBER_KEY,
    JSON.stringify({
      remember: true,
      username: String(username || "").trim(),
      savedAt: new Date().toISOString()
    })
  );
}

async function isAuthenticated() {
  try {
    const response = await fetch("/auth/me", { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const usernameInput = document.getElementById("usernameInput");
  const passwordInput = document.getElementById("passwordInput");
  const rememberPassword = document.getElementById("rememberPassword");
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");
  const loginSubmitBtn = document.getElementById("loginSubmitBtn");
  const togglePasswordBtn = document.getElementById("togglePasswordBtn");

  if (await isAuthenticated()) {
    window.location.replace("/");
    return;
  }

  const remembered = loadRememberPreference();
  if (remembered.remember) {
    usernameInput.value = remembered.username;
    rememberPassword.checked = true;
  }

  togglePasswordBtn.addEventListener("click", () => {
    const nextType = passwordInput.type === "password" ? "text" : "password";
    passwordInput.type = nextType;
    togglePasswordBtn.textContent = nextType === "password" ? "แสดง" : "ซ่อน";
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError.textContent = "";

    const username = String(usernameInput.value || "").trim();
    const password = String(passwordInput.value || "");
    if (!username || !password) {
      loginError.textContent = "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน";
      return;
    }

    loginSubmitBtn.disabled = true;
    loginSubmitBtn.textContent = "กำลังเข้าสู่ระบบ...";

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          remember: rememberPassword.checked
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        loginError.textContent = payload.error || "เข้าสู่ระบบไม่สำเร็จ";
        return;
      }

      saveRememberPreference(rememberPassword.checked, username);

      window.location.replace("/");
    } catch {
      loginError.textContent = "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้";
    } finally {
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.textContent = "เข้าสู่ระบบ";
    }
  });
});
