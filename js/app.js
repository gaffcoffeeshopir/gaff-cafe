(function () {
  // سوئیچ سفارش: ORDERING_ENABLED در js/menu-data.js
  const orderingOn = typeof ORDERING_ENABLED === "undefined" ? true : ORDERING_ENABLED;

  const menuEl = document.getElementById("menu");
  const catNav = document.getElementById("catNav");
  const cartFab = document.getElementById("cartFab");
  const cartCountEl = document.getElementById("cartCount");
  const cartDrawer = document.getElementById("cartDrawer");
  const drawerOverlay = document.getElementById("drawerOverlay");
  const cartLinesEl = document.getElementById("cartLines");
  const closeCart = document.getElementById("closeCart");
  const submitOrderBtn = document.getElementById("submitOrder");
  const tableNumberInput = document.getElementById("tableNumber");
  const orderNoteInput = document.getElementById("orderNote");
  const toast = document.getElementById("toast");
  const optionModal = document.getElementById("optionModal");
  const optionForm = document.getElementById("optionForm");
  const optionTitle = document.getElementById("optionTitle");
  const optionList = document.getElementById("optionList");
  const confirmModal = document.getElementById("confirmModal");
  const confirmCode = document.getElementById("confirmCode");
  const confirmMeta = document.getElementById("confirmMeta");
  const confirmMessage = document.getElementById("confirmMessage");
  const closeConfirmBtn = document.getElementById("closeConfirm");
  const confirmStatus = document.getElementById("confirmStatus");
  const headerTag = document.querySelector(".header-tag");

  let pendingItem = null;
  let lastOrder = null;

  if (!orderingOn) {
    document.body.classList.add("ordering-off");
    if (headerTag) headerTag.textContent = "منو را ورق بزن";
    if (cartFab) cartFab.hidden = true;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.hidden = true;
    }, 2200);
  }

  function renderNav() {
    catNav.innerHTML = CATEGORIES.map(
      (c, i) =>
        `<button type="button" class="cat-btn${i === 0 ? " is-active" : ""}" data-cat="${c.id}">
          <img class="cat-btn-icon" src="${c.icon}" alt="" width="28" height="28" />
          <span>${c.name}</span>
        </button>`
    ).join("");
  }

  function renderMenu() {
    menuEl.innerHTML = CATEGORIES.map((cat, catIndex) => {
      const items = MENU_ITEMS.filter((item) => item.categoryId === cat.id);
      const rows = items
        .map((item) => {
          const hasOptions = item.options && item.options.length;
          const desc = item.description
            ? `<p class="item-desc">${item.description}</p>`
            : "";
          const badges = [];
          if (hasOptions) badges.push("تک / دوبل");
          const badgeHtml =
            orderingOn && badges.length
              ? `<p class="item-badges">${badges.map((b) => `<span>${b}</span>`).join("")}</p>`
              : "";
          const addBtn = orderingOn
            ? `<button type="button" class="add-btn" data-id="${item.id}" aria-label="افزودن ${item.name}">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path fill="currentColor" d="M12 5a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H6a1 1 0 1 1 0-2h5V6a1 1 0 0 1 1-1z"/>
                </svg>
              </button>`
            : "";
          return `
            <article class="item">
              <div class="item-main">
                <h3 class="item-name">${item.name}</h3>
                ${desc}
                ${badgeHtml}
              </div>
              ${addBtn}
            </article>`;
        })
        .join("");
      return `
        <section class="menu-section reveal" id="cat-${cat.id}" style="--delay:${catIndex * 0.06}s">
          <header class="section-head">
            <div class="section-label">
              <img class="section-sticker" src="${cat.icon}" alt="" width="64" height="64" />
              <h2 class="section-title">${cat.name}</h2>
            </div>
            <div class="ornament" aria-hidden="true">
              <span></span><i></i><span></span>
            </div>
          </header>
          <div class="item-list">${rows}</div>
        </section>`;
    }).join("");
  }

  function updateCartUI() {
    if (!orderingOn) {
      if (cartFab) cartFab.hidden = true;
      return;
    }
    const lines = loadCart();
    const count = cartCount(lines);

    cartFab.hidden = count === 0;
    cartCountEl.textContent = new Intl.NumberFormat("fa-IR").format(count);

    if (lines.length === 0) {
      cartLinesEl.innerHTML = `<p class="cart-empty">سبد خالی است.</p>`;
      submitOrderBtn.disabled = true;
      return;
    }

    submitOrderBtn.disabled = false;
    cartLinesEl.innerHTML = lines
      .map(
        (line) => `
      <div class="cart-line" data-key="${line.key}">
        <p class="cart-line-name">${line.name}</p>
        ${line.optionLabel ? `<p class="cart-line-meta">${line.optionLabel}</p>` : ""}
        <div class="qty-row">
          <button type="button" class="qty-btn" data-action="dec" aria-label="کم کردن">−</button>
          <span>${new Intl.NumberFormat("fa-IR").format(line.quantity)}</span>
          <button type="button" class="qty-btn" data-action="inc" aria-label="افزودن">+</button>
        </div>
      </div>`
      )
      .join("");
  }

  function openDrawer() {
    if (!orderingOn) return;
    cartDrawer.classList.add("is-open");
    cartDrawer.setAttribute("aria-hidden", "false");
    drawerOverlay.hidden = false;
    updateCartUI();
  }

  function closeDrawer() {
    cartDrawer.classList.remove("is-open");
    cartDrawer.setAttribute("aria-hidden", "true");
    drawerOverlay.hidden = true;
  }

  function openCustomize(item) {
    if (!orderingOn) return;
    pendingItem = item;
    optionTitle.textContent = item.name;

    let html = "";
    if (item.options && item.options.length) {
      html += `<p class="chip-legend">اندازه</p><div class="chip-row" role="radiogroup" aria-label="اندازه">`;
      html += item.options
        .map(
          (opt, i) => `
        <label class="chip">
          <input type="radio" name="opt" value="${opt.id}" ${i === 0 ? "checked" : ""} />
          <span class="chip-face">
            <strong>${opt.label}</strong>
          </span>
        </label>`
        )
        .join("");
      html += `</div>`;
    }

    optionList.innerHTML = html;
    optionModal.showModal();
  }

  function addItem(item, option) {
    if (!orderingOn) return;
    const key = option ? `${item.id}__${option.id}` : item.id;

    addToCart({
      key,
      itemId: item.id,
      name: item.name,
      optionId: option ? option.id : undefined,
      optionLabel: option ? option.label : undefined,
      unitPrice: 0,
    });
    updateCartUI();
    showToast("به سبد اضافه شد");
    cartFab.classList.remove("cart-fab-pulse");
    void cartFab.offsetWidth;
    cartFab.classList.add("cart-fab-pulse");
  }

  async function showConfirm(order) {
    lastOrder = order;
    if (confirmMessage) {
      confirmMessage.textContent =
        `سفارش شما با کد ${order.trackingCode} ثبت شد. به‌زودی با عطر قهوه و حال خوب به میزتان می‌رسد.`;
    }
    confirmCode.textContent = order.trackingCode;
    confirmMeta.textContent = `میز ${order.tableNumber}`;
    if (confirmStatus) {
      confirmStatus.hidden = true;
      confirmStatus.textContent = "";
    }
    confirmModal.showModal();
  }

  catNav.addEventListener("click", (e) => {
    const btn = e.target.closest(".cat-btn");
    if (!btn) return;
    catNav.querySelectorAll(".cat-btn").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    const section = document.getElementById("cat-" + btn.dataset.cat);
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  menuEl.addEventListener("click", (e) => {
    if (!orderingOn) return;
    const btn = e.target.closest(".add-btn");
    if (!btn) return;
    const item = MENU_ITEMS.find((i) => i.id === btn.dataset.id);
    if (!item) return;
    if (itemNeedsCustomize(item)) {
      openCustomize(item);
    } else {
      addItem(item);
    }
  });

  optionForm.addEventListener("submit", (e) => {
    const submitter = e.submitter;
    if (!submitter || submitter.value !== "add" || !pendingItem) {
      return;
    }

    const item = pendingItem;
    let option;
    if (item.options && item.options.length) {
      const selected = optionForm.querySelector('input[name="opt"]:checked');
      if (selected) {
        option = item.options.find((o) => o.id === selected.value);
      } else {
        option = item.options[0];
      }
    }
    addItem(item, option);
    pendingItem = null;
  });

  optionModal.addEventListener("close", () => {
    pendingItem = null;
  });

  cartFab.addEventListener("click", openDrawer);
  closeCart.addEventListener("click", closeDrawer);
  drawerOverlay.addEventListener("click", closeDrawer);

  cartLinesEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".qty-btn");
    if (!btn) return;
    const line = btn.closest(".cart-line");
    const key = line.dataset.key;
    const current = loadCart().find((l) => l.key === key);
    if (!current) return;
    const next =
      btn.dataset.action === "inc" ? current.quantity + 1 : current.quantity - 1;
    setQty(key, next);
    updateCartUI();
  });

  submitOrderBtn.addEventListener("click", async () => {
    if (!orderingOn) return;
    const tableNumber = tableNumberInput.value.trim();
    if (!tableNumber) {
      showToast("شماره میز را وارد کنید");
      tableNumberInput.focus();
      return;
    }
    const items = loadCart();
    if (!items.length) return;

    submitOrderBtn.disabled = true;
    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableNumber,
          note: orderNoteInput.value.trim(),
          items,
          total: 0,
          totalLabel: "",
          customerPhone: typeof getCustomerPhone === "function" ? getCustomerPhone() : "",
        }),
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        /* ignore */
      }

      if (!res.ok || !data.ok || !data.order) {
        throw new Error(data.error || "ثبت سفارش ناموفق بود");
      }

      const order = saveOrderFromServer(data.order);
      tableNumberInput.value = "";
      orderNoteInput.value = "";
      updateCartUI();
      closeDrawer();
      showConfirm(order);
    } catch (err) {
      showToast(err.message || "خطا در ثبت سفارش");
    } finally {
      submitOrderBtn.disabled = false;
    }
  });

  closeConfirmBtn.addEventListener("click", () => {
    confirmModal.close();
  });

  confirmModal.addEventListener("click", (e) => {
    if (e.target === confirmModal) confirmModal.close();
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id.replace("cat-", "");
        catNav.querySelectorAll(".cat-btn").forEach((b) => {
          b.classList.toggle("is-active", b.dataset.cat === id);
        });
      });
    },
    { rootMargin: "-40% 0px -50% 0px", threshold: 0 }
  );

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  function renderFooter() {
    const list = document.getElementById("footerContacts");
    const dev = document.getElementById("footerDev");
    if (!list || typeof CAFE_INFO === "undefined") return;

    const ig = CAFE_INFO.instagram.replace(/^@/, "");
    const maps = mapsLinks(CAFE_INFO);

    list.innerHTML = `
      <li>
        <a class="footer-link" href="https://instagram.com/${ig}" target="_blank" rel="noopener noreferrer">
          <span class="footer-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm5 4.5A4.5 4.5 0 1 0 16.5 12 4.5 4.5 0 0 0 12 7.5zm0 7.2A2.7 2.7 0 1 1 14.7 12 2.7 2.7 0 0 1 12 14.7zM17.8 6.2a1 1 0 1 0 1 1 1 1 0 0 0-1-1z"/></svg>
          </span>
          <span class="footer-meta">
            <small>اینستاگرام کافه</small>
            <strong dir="ltr">@${ig}</strong>
          </span>
        </a>
      </li>
      <li>
        <div class="footer-address">
          <div class="footer-link footer-link-static">
            <span class="footer-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 14.5 9 2.5 2.5 0 0 1 12 11.5z"/></svg>
            </span>
            <span class="footer-meta">
              <small>آدرس</small>
              <strong>${CAFE_INFO.address}</strong>
            </span>
          </div>
          <div class="map-btns">
            <a class="map-btn" href="${maps.google}" target="_blank" rel="noopener noreferrer">گوگل‌مپ</a>
            <button type="button" class="map-btn" id="openNeshan">نشان</button>
          </div>
        </div>
      </li>`;

    const dig = (CAFE_INFO.developerInstagram || "").replace(/^@/, "");
    if (dig) {
      dev.innerHTML = `ساخته‌شده توسط <a href="https://instagram.com/${dig}" target="_blank" rel="noopener noreferrer">@${dig}</a>${
        CAFE_INFO.developerName ? ` · ${CAFE_INFO.developerName}` : ""
      }`;
    }

    const neshanBtn = document.getElementById("openNeshan");
    if (neshanBtn) {
      neshanBtn.addEventListener("click", openNeshanRouting);
    }
  }

  function openNeshanRouting() {
    const nLat = CAFE_INFO.neshanLat != null ? CAFE_INFO.neshanLat : CAFE_INFO.lat;
    const nLng = CAFE_INFO.neshanLng != null ? CAFE_INFO.neshanLng : CAFE_INFO.lng;
    const destination = `${nLat},${nLng}`;

    const openWithOrigin = (origin) => {
      const url = origin
        ? `https://nshn.ir/?origin=${origin}&destination=${destination}&vehicle=d`
        : `https://nshn.ir/?destination=${destination}&vehicle=d`;
      window.open(url, "_blank");
    };

    if (!navigator.geolocation) {
      openWithOrigin(null);
      return;
    }

    showToast("در حال دریافت موقعیت شما…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        openWithOrigin(`${pos.coords.latitude},${pos.coords.longitude}`);
      },
      () => {
        // اگر دسترسی موقعیت نبود، فقط مقصد را باز کن
        openWithOrigin(null);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  function observeMenuSections() {
    document.querySelectorAll(".menu-section").forEach((sec) => {
      observer.observe(sec);
      revealObserver.observe(sec);
    });
  }

  function wireFeedbackForm() {
    const form = document.getElementById("feedbackForm");
    const nameInput = document.getElementById("feedbackName");
    const messageInput = document.getElementById("feedbackMessage");
    const submitBtn = document.getElementById("feedbackSubmit");
    const hint = document.getElementById("feedbackHint");
    if (!form || !messageInput || !submitBtn) return;

    const session = typeof loadCustomerSession === "function" ? loadCustomerSession() : null;
    if (session && session.name && nameInput && !nameInput.value) {
      nameInput.value = session.name;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      hint.hidden = true;
      hint.classList.remove("is-error");
      const message = messageInput.value.trim();
      if (message.length < 3) {
        hint.textContent = "نظر خیلی کوتاه است";
        hint.classList.add("is-error");
        hint.hidden = false;
        return;
      }

      submitBtn.disabled = true;
      try {
        const res = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: nameInput ? nameInput.value.trim() : "",
            message,
            phone: typeof getCustomerPhone === "function" ? getCustomerPhone() : "",
          }),
        });
        let data = {};
        try {
          data = await res.json();
        } catch {
          /* ignore */
        }
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "ارسال ناموفق بود");
        }
        form.reset();
        hint.textContent = "ممنون — نظرتان ثبت شد.";
        hint.hidden = false;
      } catch (err) {
        hint.textContent = err.message || "خطا در ارسال";
        hint.classList.add("is-error");
        hint.hidden = false;
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  async function boot() {
    const cached = loadMenuCache();
    if (cached) {
      applyMenuData(cached);
      renderNav();
      renderMenu();
      observeMenuSections();
    }

    renderFooter();
    updateCartUI();
    wireFeedbackForm();

    const startMenu = async () => {
      try {
        await loadMenuFromServer();
        renderNav();
        renderMenu();
        observeMenuSections();
      } catch (err) {
        console.error(err);
        if (!cached) showToast("خطا در بارگذاری منو");
      }
    };

    if (typeof initCustomerGate === "function") {
      initCustomerGate({
        showToast,
        onReady: function () {
          startMenu();
        },
      });
      // منو را هم‌زمان لود کن؛ گیت جلوی تعامل را می‌گیرد
      startMenu();
    } else {
      await startMenu();
    }
  }

  boot();
})();
