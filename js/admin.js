(function () {
  const TOKEN_KEY = "gaff-admin-token";

  const loginView = document.getElementById("loginView");
  const appView = document.getElementById("appView");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const passwordInput = document.getElementById("adminPassword");
  const loginError = document.getElementById("loginError");
  const addForm = document.getElementById("addForm");
  const newCategory = document.getElementById("newCategory");
  const filterCategory = document.getElementById("filterCategory");
  const itemList = document.getElementById("itemList");
  const newHasSize = document.getElementById("newHasSize");
  const newDeltaWrap = document.getElementById("newDeltaWrap");
  const addHint = document.getElementById("addHint");

  let menu = { categories: [], items: [] };

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

  function fillCategorySelects() {
    const opts = menu.categories
      .map((c) => `<option value="${c.id}">${c.name}</option>`)
      .join("");
    newCategory.innerHTML = opts;
    filterCategory.innerHTML = `<option value="">همه دسته‌ها</option>` + opts;
  }

  function catName(id) {
    const c = menu.categories.find((x) => x.id === id);
    return c ? c.name : id;
  }

  function renderList() {
    const filter = filterCategory.value;
    const items = menu.items.filter((i) => !filter || i.categoryId === filter);
    if (!items.length) {
      itemList.innerHTML = `<p class="admin-lead">محصولی نیست.</p>`;
      return;
    }

    itemList.innerHTML = items
      .map((item) => {
        const delta =
          item.options && item.options.find((o) => o.id === "double")
            ? item.options.find((o) => o.id === "double").priceDelta
            : 0;
        const hasSize = Boolean(item.options && item.options.length);
        return `
        <article class="admin-item" data-id="${item.id}">
          <div class="admin-item-top">
            <div>
              <strong>${item.name}</strong>
              <div><small>${catName(item.categoryId)}${hasSize ? " · تک/دوبل" : ""}</small></div>
            </div>
            <small>${formatPrice(item.price)}</small>
          </div>
          <div class="admin-item-fields">
            <input type="text" class="edit-name" value="${item.name.replace(/"/g, "&quot;")}" />
            <input type="number" class="edit-price" min="0" step="1000" value="${item.price}" />
          </div>
          <label class="check">
            <input type="checkbox" class="edit-size" ${hasSize ? "checked" : ""} />
            <span>تک / دوبل</span>
          </label>
          <label class="field edit-delta-wrap" ${hasSize ? "" : "hidden"}>
            <span>مابه‌تفاوت دوبل</span>
            <input type="number" class="edit-delta" min="0" step="1000" value="${delta}" />
          </label>
          <div class="admin-item-actions">
            <button type="button" class="btn-primary save-btn">ذخیره</button>
            <button type="button" class="btn-danger delete-btn">حذف</button>
          </div>
        </article>`;
      })
      .join("");
  }

  async function loadMenu() {
    menu = await api("/api/admin/menu");
    fillCategorySelects();
    renderList();
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

  filterCategory.addEventListener("change", renderList);

  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    addHint.hidden = true;
    try {
      await api("/api/admin/items", {
        method: "POST",
        body: JSON.stringify({
          name: document.getElementById("newName").value,
          categoryId: document.getElementById("newCategory").value,
          price: Number(document.getElementById("newPrice").value),
          description: document.getElementById("newDesc").value,
          hasSize: newHasSize.checked,
          doubleDelta: Number(document.getElementById("newDelta").value || 0),
        }),
      });
      addForm.reset();
      newDeltaWrap.hidden = true;
      addHint.textContent = "محصول اضافه شد و در منوی مشتری نمایش داده می‌شود.";
      addHint.hidden = false;
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
      await loadMenu();
    } catch {
      showLogin();
    }
  })();
})();
