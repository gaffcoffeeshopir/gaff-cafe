(function () {
  const TOKEN_KEY = "gaff-admin-token";

  const loginView = document.getElementById("loginView");
  const appView = document.getElementById("appView");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const passwordInput = document.getElementById("adminPassword");
  const loginError = document.getElementById("loginError");
  const addForm = document.getElementById("addForm");
  const catForm = document.getElementById("catForm");
  const newCategory = document.getElementById("newCategory");
  const newCategoryPick = document.getElementById("newCategoryPick");
  const stickerPick = document.getElementById("stickerPick");
  const catIcon = document.getElementById("catIcon");
  const catName = document.getElementById("catName");
  const catHint = document.getElementById("catHint");
  const stickerFile = document.getElementById("stickerFile");
  const filterCats = document.getElementById("filterCats");
  const itemList = document.getElementById("itemList");
  const newHasSize = document.getElementById("newHasSize");
  const newDeltaWrap = document.getElementById("newDeltaWrap");
  const addHint = document.getElementById("addHint");
  const adminStats = document.getElementById("adminStats");
  const listTitle = document.getElementById("listTitle");
  const listCount = document.getElementById("listCount");

  let menu = { categories: [], items: [] };
  let stickers = [];
  let activeFilter = "";

  function token() {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(value) {
    if (value) sessionStorage.setItem(TOKEN_KEY, value);
    else sessionStorage.removeItem(TOKEN_KEY);
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

  function showLogin() {
    loginView.hidden = false;
    appView.hidden = true;
  }

  function showApp() {
    loginView.hidden = true;
    appView.hidden = false;
  }

  function formatPrice(n) {
    return new Intl.NumberFormat("fa-IR").format(n) + " تومان";
  }

  function countByCategory(id) {
    return menu.items.filter((i) => i.categoryId === id).length;
  }

  function catById(id) {
    return menu.categories.find((c) => c.id === id);
  }

  function renderStats() {
    const cats = menu.categories.length;
    const items = menu.items.length;
    const sized = menu.items.filter((i) => i.options && i.options.length).length;
    adminStats.innerHTML = `
      <div class="stat-pill"><strong>${new Intl.NumberFormat("fa-IR").format(items)}</strong><span>محصول</span></div>
      <div class="stat-pill"><strong>${new Intl.NumberFormat("fa-IR").format(cats)}</strong><span>دسته</span></div>
      <div class="stat-pill"><strong>${new Intl.NumberFormat("fa-IR").format(sized)}</strong><span>تک/دوبل</span></div>`;
  }

  function renderFilterCats() {
    const allCount = menu.items.length;
    const chips = [
      `<button type="button" class="cat-chip${activeFilter === "" ? " is-active" : ""}" data-cat="">
        <span>همه</span>
        <span class="count">${new Intl.NumberFormat("fa-IR").format(allCount)}</span>
      </button>`,
    ];

    menu.categories.forEach((c) => {
      const count = countByCategory(c.id);
      chips.push(`
        <button type="button" class="cat-chip${activeFilter === c.id ? " is-active" : ""}" data-cat="${c.id}">
          <img src="${c.icon}" alt="" width="28" height="28" />
          <span>${c.name}</span>
          <span class="count">${new Intl.NumberFormat("fa-IR").format(count)}</span>
        </button>`);
    });

    filterCats.innerHTML = chips.join("");

    const activeChip = filterCats.querySelector(".cat-chip.is-active");
    if (activeChip) {
      activeChip.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
    }
  }

  function renderNewCategoryPick() {
    if (!newCategory.value && menu.categories[0]) {
      newCategory.value = menu.categories[0].id;
    }
    if (newCategory.value && !menu.categories.some((c) => c.id === newCategory.value)) {
      newCategory.value = menu.categories[0] ? menu.categories[0].id : "";
    }

    newCategoryPick.innerHTML = menu.categories
      .map(
        (c) => `
      <button type="button" class="cat-pick-btn${newCategory.value === c.id ? " is-active" : ""}" data-cat="${c.id}">
        <img src="${c.icon}" alt="" width="30" height="30" />
        <span>${c.name}</span>
      </button>`
      )
      .join("");
  }

  function renderStickerPick() {
    if (!catIcon.value && stickers[0]) {
      catIcon.value = stickers[0].path;
    }
    if (catIcon.value && !stickers.some((s) => s.path === catIcon.value)) {
      catIcon.value = stickers[0] ? stickers[0].path : "";
    }

    if (!stickers.length) {
      stickerPick.innerHTML = `<p class="admin-empty" style="grid-column:1/-1;padding:1rem">استیکری پیدا نشد.</p>`;
      return;
    }

    stickerPick.innerHTML = stickers
      .map(
        (s) => `
      <button type="button" class="sticker-btn${catIcon.value === s.path ? " is-active" : ""}" data-icon="${s.path}" title="${s.file}">
        <img src="${s.path}" alt="" width="42" height="42" />
      </button>`
      )
      .join("");
  }

  function renderList() {
    const items = menu.items.filter((i) => !activeFilter || i.categoryId === activeFilter);
    const cat = activeFilter ? catById(activeFilter) : null;
    listTitle.textContent = cat ? cat.name : "همه محصولات";
    listCount.textContent = new Intl.NumberFormat("fa-IR").format(items.length) + " مورد";

    if (!items.length) {
      itemList.innerHTML = `<p class="admin-empty">در این دسته محصولی نیست. از «افزودن محصول» اضافه کنید.</p>`;
      return;
    }

    itemList.innerHTML = items
      .map((item) => {
        const delta =
          item.options && item.options.find((o) => o.id === "double")
            ? item.options.find((o) => o.id === "double").priceDelta
            : 0;
        const hasSize = Boolean(item.options && item.options.length);
        const cat = catById(item.categoryId);
        const safeName = item.name.replace(/"/g, "&quot;");
        return `
        <article class="admin-item" data-id="${item.id}">
          <div class="admin-item-top">
            <div>
              <strong>${item.name}</strong>
              <div class="admin-item-meta">
                ${cat ? `<img src="${cat.icon}" alt="" />` : ""}
                <small>${cat ? cat.name : item.categoryId}${hasSize ? " · تک/دوبل" : ""}</small>
              </div>
            </div>
            <span class="price-tag">${formatPrice(item.price)}</span>
          </div>
          <div class="admin-item-fields">
            <label class="field-row">
              <span>نام</span>
              <input type="text" class="edit-name" value="${safeName}" />
            </label>
            <label class="field-row">
              <span>قیمت (تومان)</span>
              <input type="number" class="edit-price" min="0" step="1000" inputmode="numeric" value="${item.price}" />
            </label>
          </div>
          <label class="switch">
            <input type="checkbox" class="edit-size" ${hasSize ? "checked" : ""} />
            <span class="switch-ui" aria-hidden="true"></span>
            <span class="switch-text">گزینه تک / دوبل</span>
          </label>
          <label class="field edit-delta-wrap" ${hasSize ? "" : "hidden"}>
            <span>مابه‌تفاوت دوبل (تومان)</span>
            <input type="number" class="edit-delta" min="0" step="1000" inputmode="numeric" value="${delta}" />
          </label>
          <div class="admin-item-actions">
            <button type="button" class="btn-primary save-btn">ذخیره</button>
            <button type="button" class="btn-danger delete-btn">حذف</button>
          </div>
        </article>`;
      })
      .join("");
  }

  function refreshUI() {
    renderStats();
    renderFilterCats();
    renderNewCategoryPick();
    renderStickerPick();
    renderList();
  }

  async function loadStickers() {
    const data = await api("/api/admin/stickers");
    stickers = data.stickers || [];
  }

  async function loadMenu() {
    menu = await api("/api/admin/menu");
    refreshUI();
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("خواندن فایل ناموفق بود"));
      reader.readAsDataURL(file);
    });
  }

  loginBtn.addEventListener("click", async () => {
    loginError.hidden = true;
    try {
      const data = await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password: passwordInput.value }),
      });
      setToken(data.token);
      showApp();
      await loadStickers();
      await loadMenu();
    } catch (err) {
      loginError.textContent = err.message;
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

  newHasSize.addEventListener("change", () => {
    newDeltaWrap.hidden = !newHasSize.checked;
  });

  filterCats.addEventListener("click", (e) => {
    const btn = e.target.closest(".cat-chip");
    if (!btn) return;
    activeFilter = btn.dataset.cat || "";
    renderFilterCats();
    renderList();
  });

  newCategoryPick.addEventListener("click", (e) => {
    const btn = e.target.closest(".cat-pick-btn");
    if (!btn) return;
    newCategory.value = btn.dataset.cat;
    renderNewCategoryPick();
  });

  stickerPick.addEventListener("click", (e) => {
    const btn = e.target.closest(".sticker-btn");
    if (!btn) return;
    catIcon.value = btn.dataset.icon;
    renderStickerPick();
  });

  stickerFile.addEventListener("change", async () => {
    const file = stickerFile.files && stickerFile.files[0];
    stickerFile.value = "";
    if (!file) return;
    catHint.hidden = true;
    catHint.style.color = "";
    try {
      if (file.size > 2.5 * 1024 * 1024) {
        throw new Error("حجم استیکر حداکثر ۲٫۵ مگابایت باشد");
      }
      const data = await readFileAsDataUrl(file);
      const uploaded = await api("/api/admin/stickers", {
        method: "POST",
        body: JSON.stringify({ name: file.name, data }),
      });
      await loadStickers();
      catIcon.value = uploaded.sticker.path;
      renderStickerPick();
      catHint.textContent = "استیکر آپلود شد — الان ثبت دسته را بزنید.";
      catHint.hidden = false;
    } catch (err) {
      catHint.textContent = err.message;
      catHint.hidden = false;
      catHint.style.color = "var(--danger)";
    }
  });

  catForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    catHint.hidden = true;
    catHint.style.color = "";
    if (!catIcon.value) {
      catHint.textContent = "یک استیکر انتخاب کنید";
      catHint.hidden = false;
      catHint.style.color = "var(--danger)";
      return;
    }
    try {
      const data = await api("/api/admin/categories", {
        method: "POST",
        body: JSON.stringify({
          name: catName.value,
          icon: catIcon.value,
        }),
      });
      catForm.reset();
      document.getElementById("catPanel").open = false;
      await loadMenu();
      activeFilter = data.category.id;
      newCategory.value = data.category.id;
      refreshUI();
      document.getElementById("addPanel").open = true;
      addHint.textContent = "دسته «" + data.category.name + "» انتخاب شده — محصول را اضافه کنید.";
      addHint.hidden = false;
    } catch (err) {
      catHint.textContent = err.message;
      catHint.hidden = false;
      catHint.style.color = "var(--danger)";
    }
  });

  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    addHint.hidden = true;
    addHint.style.color = "";
    if (!newCategory.value) {
      addHint.textContent = "یک دسته‌بندی انتخاب کنید";
      addHint.hidden = false;
      addHint.style.color = "var(--danger)";
      return;
    }
    try {
      await api("/api/admin/items", {
        method: "POST",
        body: JSON.stringify({
          name: document.getElementById("newName").value,
          categoryId: newCategory.value,
          price: Number(document.getElementById("newPrice").value),
          description: document.getElementById("newDesc").value,
          hasSize: newHasSize.checked,
          doubleDelta: Number(document.getElementById("newDelta").value || 0),
        }),
      });
      const keptCat = newCategory.value;
      addForm.reset();
      newDeltaWrap.hidden = true;
      newCategory.value = keptCat;
      addHint.textContent = "محصول اضافه شد و در منوی مشتری نمایش داده می‌شود.";
      addHint.hidden = false;
      document.getElementById("addPanel").open = false;
      await loadMenu();
    } catch (err) {
      addHint.textContent = err.message;
      addHint.hidden = false;
      addHint.style.color = "var(--danger)";
    }
  });

  itemList.addEventListener("change", (e) => {
    const size = e.target.closest(".edit-size");
    if (!size) return;
    const card = size.closest(".admin-item");
    const wrap = card.querySelector(".edit-delta-wrap");
    wrap.hidden = !size.checked;
  });

  itemList.addEventListener("click", async (e) => {
    const card = e.target.closest(".admin-item");
    if (!card) return;
    const id = card.dataset.id;

    if (e.target.closest(".save-btn")) {
      try {
        const hasSize = card.querySelector(".edit-size").checked;
        const body = {
          name: card.querySelector(".edit-name").value.trim(),
          price: Number(card.querySelector(".edit-price").value),
          hasSize,
        };
        if (hasSize) {
          body.doubleDelta = Number(card.querySelector(".edit-delta").value || 0);
        }
        await api("/api/admin/items/" + id, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        await loadMenu();
      } catch (err) {
        alert(err.message);
      }
      return;
    }

    if (e.target.closest(".delete-btn")) {
      if (!confirm("این محصول حذف شود؟")) return;
      try {
        await api("/api/admin/items/" + id, { method: "DELETE" });
        await loadMenu();
      } catch (err) {
        alert(err.message);
      }
    }
  });

  (async function boot() {
    if (!token()) {
      showLogin();
      return;
    }
    try {
      showApp();
      await loadStickers();
      await loadMenu();
    } catch {
      showLogin();
    }
  })();
})();
