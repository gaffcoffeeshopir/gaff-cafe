(function () {
  const TOKEN_KEY = "gaff-admin-token";
  const MAX_BYTES = 2.5 * 1024 * 1024;

  const loginView = document.getElementById("loginView");
  const appView = document.getElementById("appView");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const passwordInput = document.getElementById("adminPassword");
  const loginError = document.getElementById("loginError");
  const homeSlots = document.getElementById("homeSlots");
  const homeError = document.getElementById("homeError");

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

  function showError(msg) {
    if (!homeError) return;
    if (!msg) {
      homeError.hidden = true;
      homeError.textContent = "";
      return;
    }
    homeError.hidden = false;
    homeError.textContent = msg;
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

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toFaDigits(n) {
    return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("خواندن فایل ناموفق بود"));
      reader.readAsDataURL(file);
    });
  }

  function previewHtml(img) {
    if (img && img.path) {
      return `<img class="home-admin-preview" src="/${escapeHtml(img.path.replace(/^\//, ""))}" alt="" />`;
    }
    return `<div class="home-admin-empty">عکسی نیست</div>`;
  }

  function render(data) {
    if (!homeSlots) return;
    const hero = data.hero || null;
    const gallery = data.gallery || [];

    const heroCard = `
      <article class="admin-card home-admin-card" data-slot="hero" data-kind="hero">
        <h2>عکس بالای صفحه (هیرو)</h2>
        <div class="home-admin-frame">${previewHtml(hero)}</div>
        <label class="sticker-upload">
          <input type="file" class="home-file" accept="image/png,image/jpeg,image/webp" hidden />
          <span class="sticker-upload-btn">${hero ? "تعویض عکس" : "آپلود عکس"}</span>
          <span class="sticker-upload-hint">JPG / PNG / WebP</span>
        </label>
        <div class="admin-item-actions">
          ${hero ? `<button type="button" class="btn-danger home-delete">حذف</button>` : ""}
        </div>
        <p class="admin-hint home-slot-hint" hidden></p>
      </article>`;

    const galleryCards = gallery
      .map((img, index) => {
        const captionVal = img.caption ? escapeHtml(img.caption) : "";
        return `
        <article class="admin-card home-admin-card" data-slot="${escapeHtml(img.slot)}" data-kind="gallery">
          <h2>گالری ${toFaDigits(index + 1)}</h2>
          <div class="home-admin-frame">${previewHtml(img)}</div>
          <label class="field">
            <span>عنوان کوتاه (اختیاری)</span>
            <input type="text" class="home-caption" maxlength="80" value="${captionVal}" placeholder="مثلاً اسپرسو" />
          </label>
          <label class="sticker-upload">
            <input type="file" class="home-file" accept="image/png,image/jpeg,image/webp" hidden />
            <span class="sticker-upload-btn">تعویض عکس</span>
            <span class="sticker-upload-hint">JPG / PNG / WebP</span>
          </label>
          <div class="admin-item-actions">
            <button type="button" class="btn-danger home-delete">حذف</button>
          </div>
          <p class="admin-hint home-slot-hint" hidden></p>
        </article>`;
      })
      .join("");

    const addCard = `
      <article class="admin-card home-admin-card home-admin-add" data-slot="new" data-kind="gallery">
        <h2>افزودن عکس گالری</h2>
        <p class="admin-hint" style="margin-bottom:0.75rem">تعداد محدود نیست. در سایت همیشه ۴ عکس دیده می‌شود؛ بعد از ۳ ثانیه یکی از چپ می‌رود و بعدی از راست می‌آید.</p>
        <label class="field">
          <span>عنوان کوتاه (اختیاری)</span>
          <input type="text" class="home-caption" maxlength="80" placeholder="مثلاً لاته" />
        </label>
        <label class="sticker-upload">
          <input type="file" class="home-file" accept="image/png,image/jpeg,image/webp" hidden />
          <span class="sticker-upload-btn">+ آپلود عکس جدید</span>
          <span class="sticker-upload-hint">JPG / PNG / WebP</span>
        </label>
        <p class="admin-hint home-slot-hint" hidden></p>
      </article>`;

    homeSlots.innerHTML = heroCard + galleryCards + addCard;
  }

  async function loadSlots() {
    showError("");
    const data = await api("/api/admin/home-images");
    render(data);
  }

  async function uploadForCard(card, file) {
    const slot = card.getAttribute("data-slot");
    const hint = card.querySelector(".home-slot-hint");
    const captionInput = card.querySelector(".home-caption");
    if (!file) return;
    if (file.size > MAX_BYTES) {
      throw new Error("حجم عکس حداکثر ۲٫۵ مگابایت باشد");
    }
    if (hint) {
      hint.hidden = false;
      hint.textContent = "در حال آپلود…";
    }
    const data = await readFileAsDataUrl(file);
    const body = {
      name: file.name || slot,
      data,
      caption: captionInput ? captionInput.value.trim() : "",
    };
    if (slot === "new") {
      body.kind = "gallery";
      body.slot = "new";
    } else {
      body.slot = slot;
    }
    await api("/api/admin/home-images", {
      method: "POST",
      body: JSON.stringify(body),
    });
    await loadSlots();
  }

  homeSlots.addEventListener("change", async (e) => {
    const input = e.target.closest(".home-file");
    if (!input) return;
    const card = input.closest(".home-admin-card");
    const file = input.files && input.files[0];
    input.value = "";
    if (!card || !file) return;
    try {
      showError("");
      await uploadForCard(card, file);
    } catch (err) {
      showError(err.message || "آپلود ناموفق بود");
      const hint = card.querySelector(".home-slot-hint");
      if (hint) hint.hidden = true;
    }
  });

  homeSlots.addEventListener("click", async (e) => {
    const del = e.target.closest(".home-delete");
    if (!del) return;
    const card = del.closest(".home-admin-card");
    if (!card) return;
    const slot = card.getAttribute("data-slot");
    if (!slot || slot === "new") return;
    if (!confirm("این عکس حذف شود؟")) return;
    try {
      showError("");
      await api("/api/admin/home-images/" + encodeURIComponent(slot), { method: "DELETE" });
      await loadSlots();
    } catch (err) {
      showError(err.message || "حذف ناموفق بود");
    }
  });

  async function login() {
    loginError.hidden = true;
    try {
      const data = await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password: passwordInput.value }),
      });
      setToken(data.token);
      passwordInput.value = "";
      showApp();
      await loadSlots();
    } catch (err) {
      loginError.hidden = false;
      loginError.textContent = err.message || "ورود ناموفق";
    }
  }

  loginBtn.addEventListener("click", login);
  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });
  logoutBtn.addEventListener("click", () => {
    setToken("");
    showLogin();
  });

  if (token()) {
    showApp();
    loadSlots().catch(() => {
      setToken("");
      showLogin();
    });
  } else {
    showLogin();
  }
})();
