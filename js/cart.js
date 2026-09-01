const CART_KEY = "gaff-cart";
const ORDERS_KEY = "gaff-orders";

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCart(lines) {
  localStorage.setItem(CART_KEY, JSON.stringify(lines));
}

function cartCount(lines) {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

function cartTotal(lines) {
  return lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
}

function addToCart(entry) {
  const lines = loadCart();
  const existing = lines.find((l) => l.key === entry.key);
  if (existing) {
    existing.quantity += 1;
  } else {
    lines.push({ ...entry, quantity: 1 });
  }
  saveCart(lines);
  return lines;
}

function setQty(key, quantity) {
  let lines = loadCart();
  if (quantity <= 0) {
    lines = lines.filter((l) => l.key !== key);
  } else {
    lines = lines.map((l) => (l.key === key ? { ...l, quantity } : l));
  }
  saveCart(lines);
  return lines;
}

function clearCart() {
  saveCart([]);
}

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

function saveOrderFromServer(serverOrder) {
  const orders = loadOrders();
  const order = {
    id: serverOrder.id,
    trackingCode: serverOrder.trackingCode,
    tableNumber: serverOrder.tableNumber,
    note: serverOrder.note || "",
    items: serverOrder.items || [],
    total: serverOrder.total,
    createdAt: serverOrder.createdAt || new Date().toISOString(),
    status: "new",
  };
  orders.unshift(order);
  saveOrders(orders);
  clearCart();
  return order;
}
