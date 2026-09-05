(function () {
  const TOKEN_KEY = "gaff-admin-token";

  const loginView = document.getElementById("loginView");
  const appView = document.getElementById("appView");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const passwordInput = document.getElementById("adminPassword");
  const loginError = document.getElementById("loginError");
  const feedbackList = document.getElementById("feedbackList");
  const listCount = document.getElementById("listCount");

  function token() {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(value) {
    if (value) sessionStorage.setItem(TOKEN_KEY, value);
    else sessionStorage.removeItem(TOKEN_KEY);
  }

  function showLogin() {
    loginView.hidden = false;
    appView.hidden = true;
  }

  function showApp() {
    loginView.hidden = true;
    appView.hidden = false;
  }

  async function api(path, options) {
    const opts = options || {};
    const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    if (token()) headers.Authorization = "Bearer " + token();
    const res = await fetch(path, Object.assign({}, opts, { headers }));
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* ignore */
    }
    if (res.status === 401) {
      setToken("");
      showLogin();
      throw new Error(data.error || "نشست منقضی شد");
    }
    if (!res.ok) throw new Error(data.error || "خطا در ارتباط با سرور");
    return data;
  }

  function formatTime(iso) {
    try {
      return new Intl.DateTimeFormat("fa-IR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderList(items) {
    listCount.textContent =
      new Intl.NumberFormat("fa-IR").format(items.length) + " نظر";

    if (!items.length) {
      feedbackList.innerHTML =
        '<p class="admin-empty">هنوز نظری ثبت نشده است.</p>';
      return;
    }

    feedbackList.innerHTML = items
      .map((item) => {
        const who = item.name ? escapeHtml(item.name) : "بدون نام";
        return `
        <article class="admin-item feedback-card" data-id="${escapeHtml(item.id)}">
          <div class="admin-item-top">
            <div>
              <strong>${who}</strong>
              <div class="admin-item-meta">
            <small>${formatTime(item.createdAt)}${item.phone ? " · " + escapeHtml(item.phone) : ""}</small>
              </div>
            </div>
          </div>
          <p class="feedback-message">${escapeHtml(item.message)}</p>
          <div class="admin-item-actions">
            <button type="button" class="btn-danger delete-btn">حذف</button>
          </div>
        </article>`;
      })
      .join("");
  }

  async function loadFeedback() {
    const data = await api("/api/admin/feedback");
    renderList(data.items || []);
  }

  loginBtn.addEventListener("click", async () => {
    loginError.hidden = true;
    try {
      const data = await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password: passwordInput.value }),
      });
      setToken(data.token);
      passwordInput.value = "";
      showApp();
      await loadFeedback();
    } catch (err) {
      loginError.textContent = err.message || "رمز اشتباه است";
      loginError.hidden = false;
    }
  });

  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loginBtn.click();
  });

  logoutBtn.addEventListener("click", () => {
    setToken("");
    showLogin();
  });

  feedbackList.addEventListener("click", async (e) => {
    const btn = e.target.closest(".delete-btn");
    if (!btn) return;
    const card = btn.closest(".feedback-card");
    if (!card || !confirm("این نظر حذف شود؟")) return;
    try {
      await api("/api/admin/feedback/" + card.dataset.id, { method: "DELETE" });
      await loadFeedback();
    } catch (err) {
      alert(err.message);
    }
  });

  (async function boot() {
    if (!token()) {
      showLogin();
      return;
    }
    try {
      showApp();
      await loadFeedback();
    } catch {
      showLogin();
    }
  })();
})();
