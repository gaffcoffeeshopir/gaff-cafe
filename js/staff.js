(function () {
  const ordersEl = document.getElementById("orders");
  const emptyEl = document.getElementById("emptyOrders");
  const clearBtn = document.getElementById("clearDone");

  const STATUS_LABELS = {
    new: "جدید",
    preparing: "در حال آماده‌سازی",
    done: "انجام شد",
  };

  function render() {
    const orders = loadOrders();
    const cards = ordersEl.querySelectorAll(".order-card");
    cards.forEach((c) => c.remove());

    if (!orders.length) {
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;

    orders.forEach((order) => {
      const card = document.createElement("article");
      card.className = "order-card" + (order.status === "done" ? " is-done" : "");
      card.dataset.id = order.id;

      const itemsHtml = order.items
        .map(
          (line) => `
        <li>
          <span>${line.name}${line.optionLabel ? " (" + line.optionLabel + ")" : ""} × ${new Intl.NumberFormat("fa-IR").format(line.quantity)}</span>
        </li>`
        )
        .join("");

      const statusBtns = ["new", "preparing", "done"]
        .map((s) => {
          const active = order.status === s ? " is-active" : "";
          const extra = s === "new" && order.status === "new" ? " badge-new" : "";
          return `<button type="button" data-status="${s}" class="${active}${extra}">${STATUS_LABELS[s]}</button>`;
        })
        .join("");

      card.innerHTML = `
        <div class="order-top">
          <div>
            <p class="order-table">میز ${order.tableNumber}${order.trackingCode ? ` · <span dir="ltr">${order.trackingCode}</span>` : ""}</p>
            <p class="order-meta">${formatTime(order.createdAt)}</p>
          </div>
        </div>
        <ul class="order-items">${itemsHtml}</ul>
        ${order.note ? `<p class="order-note">یادداشت: ${order.note}</p>` : ""}
        <div class="order-foot">
          <div class="status-btns">${statusBtns}</div>
        </div>`;

      ordersEl.appendChild(card);
    });
  }

  ordersEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-status]");
    if (!btn) return;
    const card = btn.closest(".order-card");
    updateOrderStatus(card.dataset.id, btn.dataset.status);
    render();
  });

  clearBtn.addEventListener("click", () => {
    clearDoneOrders();
    render();
  });

  window.addEventListener("storage", (e) => {
    if (e.key === "gaff-orders") render();
  });

  window.addEventListener("gaff-orders-updated", render);

  // Poll so kitchen tablet picks up orders from customer phones on same origin/local
  setInterval(render, 3000);

  render();
})();
