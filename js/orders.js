const ORDERS_KEY = "gaff-orders";

function loadOrders() {
  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveOrders(orders) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  window.dispatchEvent(new Event("gaff-orders-updated"));
}

function updateOrderStatus(id, status) {
  const orders = loadOrders().map((o) => (o.id === id ? { ...o, status } : o));
  saveOrders(orders);
}

function clearDoneOrders() {
  saveOrders(loadOrders().filter((o) => o.status !== "done"));
}

function formatTime(iso) {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}
