/* اطلاعات ثابت کافه + لود منو از سرور */

const CAFE_INFO = {
  instagram: "cofe_gaff",
  address: "کرج، دانشکده، سازمان آب",
  lat: 35.811257,
  lng: 51.006647,
  neshanLat: 35.81125788848364,
  neshanLng: 51.00660826318423,
  telegram: "",
  developerInstagram: "amiman.dev",
  developerName: "طراح سایت",
};

/**
 * سفارش آنلاین / افزودن به سبد
 * موقتاً خاموش است. برای فعال‌سازی دوباره فقط true بگذار — کد حذف نشده.
 */
const ORDERING_ENABLED = false;

/** با لود منو از API پر می‌شوند */
let CATEGORIES = [];
let MENU_ITEMS = [];

const MENU_CACHE_KEY = "gaff-menu-v1";

function applyMenuData(data) {
  CATEGORIES = data.categories || [];
  MENU_ITEMS = data.items || [];
}

function loadMenuCache() {
  try {
    const raw = localStorage.getItem(MENU_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.categories || !data.items) return null;
    return data;
  } catch {
    return null;
  }
}

function saveMenuCache(data) {
  try {
    localStorage.setItem(
      MENU_CACHE_KEY,
      JSON.stringify({
        categories: data.categories || [],
        items: data.items || [],
        savedAt: Date.now(),
      })
    );
  } catch {
    /* ignore */
  }
}

async function loadMenuFromServer() {
  const res = await fetch("/api/menu");
  if (!res.ok) throw new Error("منو لود نشد");
  const data = await res.json();
  applyMenuData(data);
  saveMenuCache(data);
  return data;
}

function formatPrice(toman) {
  return new Intl.NumberFormat("fa-IR").format(toman) + " تومان";
}

function itemNeedsCustomize(item) {
  return Boolean(item.options && item.options.length);
}

function mapsLinks(info) {
  const { lat, lng, neshanLat, neshanLng, address } = info;
  if (lat != null && lng != null) {
    const nLat = neshanLat != null ? neshanLat : lat;
    const nLng = neshanLng != null ? neshanLng : lng;
    return {
      google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
      neshan: `https://nshn.ir/?destination=${nLat},${nLng}&vehicle=d`,
    };
  }
  const q = encodeURIComponent(address);
  return {
    google: "https://www.google.com/maps/search/?api=1&query=" + q,
    neshan: "https://nshn.ir/?q=" + q,
  };
}
