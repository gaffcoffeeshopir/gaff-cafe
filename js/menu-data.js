/* اطلاعات ثابت کافه + لود منو از سرور */

const CAFE_INFO = {
  phone: "09392737437",
  phoneDisplay: "۰۹۳۹۲۷۳۷۴۳۷",
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

const CAFE_WHATSAPP = "98" + CAFE_INFO.phone.replace(/^0/, "").replace(/\D/g, "");

/** با لود منو از API پر می‌شوند */
let CATEGORIES = [];
let MENU_ITEMS = [];

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

async function loadMenuFromServer() {
  const res = await fetch("/api/menu");
  if (!res.ok) throw new Error("منو لود نشد");
  const data = await res.json();
  CATEGORIES = data.categories || [];
  MENU_ITEMS = data.items || [];
  return data;
}
