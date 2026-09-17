(function () {
  const homeMain = document.getElementById("homeMain");
  const toast = document.getElementById("toast");
  const igLinks = [
    document.getElementById("homeInstagram"),
    document.getElementById("homeInstagramTop"),
  ].filter(Boolean);
  const googleMap = document.getElementById("homeGoogleMap");
  const neshanBtn = document.getElementById("homeNeshan");
  const footerDev = document.getElementById("footerDev");

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.hidden = true;
    }, 2200);
  }

  function observeBlocks() {
    const blocks = document.querySelectorAll(".home-block");
    if (!blocks.length) return;
    if (!("IntersectionObserver" in window)) {
      blocks.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
    );
    blocks.forEach((el) => io.observe(el));
  }

  function toFaIndex(n) {
    return String(n).padStart(2, "0").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  }

  let galleryTimer = 0;
  let galleryFallback = 0;
  let galleryIndex = 0;
  let galleryPaused = false;
  let galleryStepPx = 0;
  let galleryCount = 0;
  let galleryOnResize = null;

  function clearGalleryTimers() {
    if (galleryTimer) {
      clearTimeout(galleryTimer);
      galleryTimer = 0;
    }
    if (galleryFallback) {
      clearTimeout(galleryFallback);
      galleryFallback = 0;
    }
  }

  function stopGalleryCarousel() {
    clearGalleryTimers();
    const viewport = document.getElementById("homeGalleryViewport");
    const rail = document.getElementById("homeGallery");
    if (viewport) {
      viewport.classList.remove("is-carousel");
      viewport.onmouseenter = null;
      viewport.onmouseleave = null;
      viewport.ontouchstart = null;
      viewport.ontouchend = null;
    }
    if (rail) {
      rail.classList.remove("is-animating");
      rail.style.transform = "";
      rail.style.removeProperty("--gallery-shot-w");
      rail.querySelectorAll(".home-shot.is-clone").forEach((el) => el.remove());
    }
    if (galleryOnResize) {
      window.removeEventListener("resize", galleryOnResize);
      galleryOnResize = null;
    }
    galleryIndex = 0;
    galleryCount = 0;
    galleryStepPx = 0;
    galleryPaused = false;
  }

  function measureGalleryStep() {
    const viewport = document.getElementById("homeGalleryViewport");
    const rail = document.getElementById("homeGallery");
    if (!viewport || !rail) return 0;
    const styles = getComputedStyle(viewport);
    const padL = parseFloat(styles.paddingLeft) || 0;
    const padR = parseFloat(styles.paddingRight) || 0;
    const gap = parseFloat(getComputedStyle(rail).gap) || 13.6;
    const inner = Math.max(0, viewport.clientWidth - padL - padR);
    const shotW = (inner - gap * 3) / 4;
    rail.style.setProperty("--gallery-shot-w", shotW + "px");
    galleryStepPx = shotW + gap;
    return galleryStepPx;
  }

  function setGalleryOffset(index, animate) {
    const rail = document.getElementById("homeGallery");
    if (!rail || !galleryStepPx) return;
    if (animate) rail.classList.add("is-animating");
    else rail.classList.remove("is-animating");
    rail.style.transform = "translateX(" + -index * galleryStepPx + "px)";
  }

  function scheduleGalleryStep() {
    if (galleryTimer) {
      clearTimeout(galleryTimer);
      galleryTimer = 0;
    }
    if (galleryCount <= 4) return;
    galleryTimer = setTimeout(() => {
      galleryTimer = 0;
      if (galleryPaused) {
        scheduleGalleryStep();
        return;
      }
      advanceGallery();
    }, 3000);
  }

  function advanceGallery() {
    const rail = document.getElementById("homeGallery");
    if (!rail || galleryCount <= 4) return;

    galleryIndex += 1;
    setGalleryOffset(galleryIndex, true);

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      rail.removeEventListener("transitionend", onEnd);
      if (galleryFallback) {
        clearTimeout(galleryFallback);
        galleryFallback = 0;
      }
      if (galleryIndex >= galleryCount) {
        galleryIndex = 0;
        setGalleryOffset(0, false);
      }
      scheduleGalleryStep();
    };

    const onEnd = (e) => {
      if (e.target !== rail) return;
      if (e.propertyName && e.propertyName !== "transform") return;
      finish();
    };

    rail.addEventListener("transitionend", onEnd);
    galleryFallback = setTimeout(finish, 1000);
  }

  function startGalleryCarousel(count) {
    const viewport = document.getElementById("homeGalleryViewport");
    const rail = document.getElementById("homeGallery");
    stopGalleryCarousel();
    if (!viewport || !rail || count <= 4) return;

    galleryCount = count;
    const originals = Array.from(rail.querySelectorAll(".home-shot:not(.is-clone)"));
    // ۴ کلون اول برای حلقهٔ نرم وقتی از آخر به اول برمی‌گردیم
    originals.slice(0, 4).forEach((shot) => {
      const clone = shot.cloneNode(true);
      clone.classList.add("is-clone");
      clone.setAttribute("aria-hidden", "true");
      rail.appendChild(clone);
    });

    viewport.classList.add("is-carousel");
    measureGalleryStep();
    galleryIndex = 0;
    setGalleryOffset(0, false);

    galleryOnResize = () => {
      measureGalleryStep();
      setGalleryOffset(galleryIndex, false);
    };
    window.addEventListener("resize", galleryOnResize);

    viewport.onmouseenter = () => {
      galleryPaused = true;
    };
    viewport.onmouseleave = () => {
      galleryPaused = false;
    };
    viewport.ontouchstart = () => {
      galleryPaused = true;
    };
    viewport.ontouchend = () => {
      galleryPaused = false;
    };

    scheduleGalleryStep();
  }

  function renderGallery(gallery) {
    const rail = document.getElementById("homeGallery");
    if (!rail) return;
    stopGalleryCarousel();

    const list = Array.isArray(gallery) ? gallery.filter((img) => img && img.path) : [];
    if (!list.length) {
      rail.innerHTML = [1, 2, 3, 4]
        .map(
          (n) => `
        <figure class="home-shot is-empty">
          <div class="home-shot-frame"><span>${toFaIndex(n)}</span></div>
          <figcaption>به‌زودی</figcaption>
        </figure>`
        )
        .join("");
      const lead = document.getElementById("homeGalleryLead");
      if (lead) lead.textContent = "عکس‌های کافه و محصولات به‌زودی اینجا می‌نشینند.";
      return;
    }

    rail.innerHTML = list
      .map((img, index) => {
        const src = "/" + String(img.path).replace(/^\//, "");
        const caption = img.caption || "";
        return `
        <figure class="home-shot" data-slot="${String(img.slot || "").replace(/"/g, "")}">
          <div class="home-shot-frame">
            <img src="${src}" alt="${caption.replace(/"/g, "&quot;")}" loading="lazy" />
            <span>${toFaIndex(index + 1)}</span>
          </div>
          <figcaption>${caption || "گالری"}</figcaption>
        </figure>`;
      })
      .join("");

    const lead = document.getElementById("homeGalleryLead");
    if (lead) {
      lead.textContent =
        list.length > 4
          ? "نگاهی به فضای کافه — هر چند ثانیه یک عکس جابه‌جا می‌شود."
          : "نگاهی به فضای کافه و نوشیدنی‌ها.";
    }

    requestAnimationFrame(() => startGalleryCarousel(list.length));
  }

  function applyHomeImages(data) {
    const hero = data && data.hero;
    const gallery = (data && data.gallery) || [];

    const heroPhoto = document.getElementById("homeHeroPhoto");
    const heroPlaceholder = document.getElementById("homeHeroPlaceholder");
    if (heroPhoto && hero && hero.path) {
      heroPhoto.src = "/" + String(hero.path).replace(/^\//, "");
      heroPhoto.hidden = false;
      if (heroPlaceholder) heroPlaceholder.hidden = true;
    }

    renderGallery(gallery);
  }

  async function loadHomeImages() {
    try {
      const res = await fetch("/api/home-images");
      if (!res.ok) return;
      const data = await res.json();
      applyHomeImages(data);
    } catch {
      /* ignore */
    }
  }

  function unlockHome() {
    document.body.classList.remove("home-locked");
    if (homeMain) homeMain.hidden = false;
    loadHomeImages();
    requestAnimationFrame(observeBlocks);
  }

  function wireCafeInfo() {
    if (typeof CAFE_INFO === "undefined") return;

    const ig = (CAFE_INFO.instagram || "").replace(/^@/, "");
    if (ig) {
      const href = "https://instagram.com/" + ig;
      igLinks.forEach((el) => {
        el.href = href;
      });
      const handle = document.querySelector(".home-ig-banner-handle");
      if (handle) handle.textContent = "@" + ig;
    }

    if (typeof mapsLinks === "function") {
      const maps = mapsLinks(CAFE_INFO);
      if (googleMap) googleMap.href = maps.google;
    }

    const dig = (CAFE_INFO.developerInstagram || "").replace(/^@/, "");
    if (footerDev && dig) {
      footerDev.innerHTML = `ساخته‌شده توسط <a href="https://instagram.com/${dig}" target="_blank" rel="noopener noreferrer">@${dig}</a>${
        CAFE_INFO.developerName ? ` · ${CAFE_INFO.developerName}` : ""
      }`;
    }

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
      (pos) => openWithOrigin(`${pos.coords.latitude},${pos.coords.longitude}`),
      () => openWithOrigin(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  wireCafeInfo();

  if (typeof initCustomerGate === "function") {
    initCustomerGate({
      showToast,
      onReady: function () {
        unlockHome();
      },
    });
  } else {
    unlockHome();
  }
})();
