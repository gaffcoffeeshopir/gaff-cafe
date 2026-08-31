/**
 * ریل اسکرول برند گاف — جایگزین نوار پیش‌فرض مرورگر
 */
(function () {
  const MIN_THUMB = 24;
  const MAX_THUMB = 40;
  const IDLE_MS = 1400;

  const rail = document.createElement("div");
  rail.className = "gaff-rail";
  rail.setAttribute("aria-hidden", "true");
  rail.innerHTML = `
    <div class="gaff-rail-glow"></div>
    <div class="gaff-rail-track">
      <span class="gaff-rail-dot" style="--i:0"></span>
      <span class="gaff-rail-dot" style="--i:1"></span>
      <span class="gaff-rail-dot" style="--i:2"></span>
      <span class="gaff-rail-dot" style="--i:3"></span>
      <span class="gaff-rail-dot" style="--i:4"></span>
      <button type="button" class="gaff-rail-thumb" tabindex="-1" aria-label="اسکرول">
        <span class="gaff-rail-bean"></span>
        <span class="gaff-rail-steam"></span>
      </button>
    </div>
  `;
  document.body.appendChild(rail);

  const track = rail.querySelector(".gaff-rail-track");
  const thumb = rail.querySelector(".gaff-rail-thumb");

  let idleTimer = 0;
  let dragging = false;
  let dragStartY = 0;
  let dragStartScroll = 0;
  let trackRect = null;
  let raf = 0;

  function metrics() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const view = window.innerHeight;
    const doc = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight
    );
    const maxScroll = Math.max(0, doc - view);
    const trackH = track.clientHeight;
    const thumbH = maxScroll
      ? Math.min(MAX_THUMB, Math.max(MIN_THUMB, Math.round((view / doc) * trackH)))
      : trackH;
    const travel = Math.max(0, trackH - thumbH);
    const top = maxScroll ? (scrollTop / maxScroll) * travel : 0;
    return { scrollTop, view, doc, maxScroll, trackH, thumbH, travel, top };
  }

  function paint() {
    raf = 0;
    const m = metrics();
    const needed = m.maxScroll > 8;
    rail.classList.toggle("is-needed", needed);
    if (!needed) {
      rail.classList.remove("is-visible", "is-active");
      return;
    }
    thumb.style.height = m.thumbH + "px";
    thumb.style.transform = "translate3d(-50%, " + m.top + "px, 0)";
  }

  function schedulePaint() {
    if (!raf) raf = requestAnimationFrame(paint);
  }

  function showRail() {
    if (!rail.classList.contains("is-needed")) return;
    rail.classList.add("is-visible", "is-active");
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (!dragging) rail.classList.remove("is-active");
    }, IDLE_MS);
  }

  function onScroll() {
    schedulePaint();
    showRail();
  }

  function scrollFromClientY(clientY) {
    const m = metrics();
    if (!m.maxScroll || !trackRect) return;
    const y = clientY - trackRect.top - m.thumbH / 2;
    const ratio = Math.min(1, Math.max(0, y / Math.max(1, m.travel)));
    window.scrollTo({ top: ratio * m.maxScroll, behavior: dragging ? "auto" : "smooth" });
  }

  thumb.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    rail.classList.add("is-dragging", "is-active", "is-visible");
    thumb.setPointerCapture(e.pointerId);
    trackRect = track.getBoundingClientRect();
    dragStartY = e.clientY;
    dragStartScroll = window.scrollY || document.documentElement.scrollTop;
  });

  thumb.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const m = metrics();
    if (!m.maxScroll || !m.travel) return;
    const dy = e.clientY - dragStartY;
    const next = dragStartScroll + (dy / m.travel) * m.maxScroll;
    window.scrollTo(0, Math.min(m.maxScroll, Math.max(0, next)));
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    rail.classList.remove("is-dragging");
    try {
      thumb.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    showRail();
  }

  thumb.addEventListener("pointerup", endDrag);
  thumb.addEventListener("pointercancel", endDrag);

  track.addEventListener("pointerdown", (e) => {
    if (e.target === thumb || thumb.contains(e.target)) return;
    trackRect = track.getBoundingClientRect();
    scrollFromClientY(e.clientY);
    showRail();
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", schedulePaint);
  window.addEventListener("load", schedulePaint);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(schedulePaint);
  }

  const mo = new MutationObserver(schedulePaint);
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });

  schedulePaint();
  showRail();
})();
