(function () {
  const TOKEN_KEY = "gaff-admin-token";

  const loginView = document.getElementById("loginView");
  const appView = document.getElementById("appView");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const passwordInput = document.getElementById("adminPassword");
  const loginError = document.getElementById("loginError");
  const customerList = document.getElementById("customerList");
  const listCount = document.getElementById("listCount");
  const customerDetail = document.getElementById("customerDetail");
  const detailTitle = document.getElementById("detailTitle");
  const detailBody = document.getElementById("detailBody");
  const closeDetail = document.getElementById("closeDetail");

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
      return iso || "";
    }
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toFaDigits(value) {
    return new Intl.NumberFormat("fa-IR").format(Number(value) || 0);
  }

  function renderList(items) {
    listCount.textContent = toFaDigits(items.length) + " نفر";
    if (!items.length) {
      customerList.innerHTML = '<p class="admin-empty">هنوز مشتریی ثبت نشده است.</p>';
      return;
    }

    customerList.innerHTML = items
      .map((c) => {
        const who = c.name ? escapeHtml(c.name) : "بدون نام";
        const birth = c.birthJalali ? escapeHtml(c.birthJalali) : "—";
        return `
        <article class="admin-item customer-card" data-phone="${escapeHtml(c.phone)}">
          <div class="admin-item-top">
            <div>
              <strong>${who}</strong>
              <div class="admin-item-meta">
                <small dir="ltr">${escapeHtml(c.phone)}</small>
              </div>
            </div>
            <span class="price-tag">${birth}</span>
          </div>
          <p class="admin-item-meta" style="margin:0.55rem 0 0">
            <small>نظر: ${toFaDigits(c.feedbackCount || 0)} · سفارش: ${toFaDigits(c.orderCount || 0)}</small>
          </p>
          <div class="admin-item-actions">
            <button type="button" class="btn-primary detail-btn">جزئیات</button>
          </div>
        </article>`;
      })
      .join("");
  }

  function renderDetail(data) {
    const c = data.customer;
    detailTitle.textContent = (c.name || "مشتری") + " · " + c.phone;
    const feedbackHtml = (data.feedback || []).length
      ? data.feedback
          .map(
            (f) => `
          <li>
            <strong>${formatTime(f.createdAt)}</strong>
            <p>${escapeHtml(f.message)}</p>
          </li>`
          )
          .join("")
      : "<li><p>نظری ثبت نشده</p></li>";

    const ordersHtml = (data.orders || []).length
      ? data.orders
          .map((o) => {
            const items = (o.items || [])
              .map(
                (line) =>
                  `${escapeHtml(line.name)}${line.optionLabel ? " (" + escapeHtml(line.optionLabel) + ")" : ""} × ${toFaDigits(line.quantity || 1)}`
              )
              .join("، ");
            return `
            <li>
              <strong>${escapeHtml(o.trackingCode || o.id)} · میز ${escapeHtml(o.tableNumber)}</strong>
              <small>${formatTime(o.createdAt)}</small>
              <p>${items || "—"}</p>
            </li>`;
          })
          .join("")
      : "<li><p>سفارشی ثبت نشده</p></li>";

    detailBody.innerHTML = `
      <p><strong>نام:</strong> ${escapeHtml(c.name || "—")}</p>
      <p><strong>موبایل:</strong> <span dir="ltr">${escapeHtml(c.phone)}</span></p>
      <p><strong>تولد شمسی:</strong> ${escapeHtml(c.birthJalali || "—")}</p>
      <p><strong>آخرین بازدید:</strong> ${formatTime(c.lastSeenAt)}</p>
      <h3 style="margin:1rem 0 0.4rem;font-size:1rem">نظرات</h3>
      <ul class="customer-detail-list">${feedbackHtml}</ul>
      <h3 style="margin:1rem 0 0.4rem;font-size:1rem">سفارش‌ها</h3>
      <ul class="customer-detail-list">${ordersHtml}</ul>`;
    customerDetail.hidden = false;
    customerDetail.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadCustomers() {
    const data = await api("/api/admin/customers");
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
      await loadCustomers();
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

  closeDetail.addEventListener("click", () => {
    customerDetail.hidden = true;
  });

  customerList.addEventListener("click", async (e) => {
    const btn = e.target.closest(".detail-btn");
    if (!btn) return;
    const card = btn.closest(".customer-card");
    if (!card) return;
    try {
      const data = await api("/api/admin/customers/" + encodeURIComponent(card.dataset.phone));
      renderDetail(data);
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
      await loadCustomers();
    } catch {
      showLogin();
    }
  })();
})();
