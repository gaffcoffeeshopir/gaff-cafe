/* داده‌های منو — قیمت‌ها قابل ویرایش‌اند (روی منوی چاپی نبودند) */

/**
 * اطلاعات تماس و شبکه‌های اجتماعی کافه
 * اینستاگرام را بدون @ بنویس — مثال: gaff.cafe
 */
const CAFE_INFO = {
  phone: "09392737437",
  phoneDisplay: "۰۹۳۹۲۷۳۷۴۳۷",
  instagram: "cofe_gaff",
  address: "کرج، دانشکده، سازمان آب",
  lat: 35.811257,
  lng: 51.006647,
  /** مختصات دقیق برای اپ نشان */
  neshanLat: 35.81125788848364,
  neshanLng: 51.00660826318423,
  /** اگر کانال/آیدی تلگرام دارید اینجا بگذارید — مثال: gaff_cafe */
  telegram: "",
  developerInstagram: "amiman.dev",
  developerName: "طراح سایت",
};

/** شماره واتساپ با کد کشور، بدون + — از روی تلفن ساخته می‌شود */
const CAFE_WHATSAPP = "98" + CAFE_INFO.phone.replace(/^0/, "").replace(/\D/g, "");

const CATEGORIES = [
  { id: "hot-bar", name: "بار گرم", icon: "img/icons/hot-bar.png" },
  { id: "tea", name: "چای و دمنوش‌ها", icon: "img/icons/tea.png" },
  { id: "cold-bar", name: "بار سرد", icon: "img/icons/cold-bar.png" },
  { id: "breakfast", name: "صبحانه‌ها", icon: "img/icons/breakfast.png" },
  { id: "shakes", name: "شیک‌ها", icon: "img/icons/shakes.png" },
];

const MENU_ITEMS = [
  {
    id: "esp-robusta",
    name: "اسپرسو ۱۰۰٪ روبوستا",
    categoryId: "hot-bar",
    price: 90000,
    options: [
      { id: "single", label: "تک", priceDelta: 0 },
      { id: "double", label: "دوبل", priceDelta: 40000 },
    ],
  },
  {
    id: "esp-7030",
    name: "اسپرسو ۷۰–۳۰",
    categoryId: "hot-bar",
    price: 95000,
    options: [
      { id: "single", label: "تک", priceDelta: 0 },
      { id: "double", label: "دوبل", priceDelta: 40000 },
    ],
  },
  { id: "americano", name: "آمریکانو", categoryId: "hot-bar", price: 110000 },
  { id: "latte", name: "لاته", categoryId: "hot-bar", price: 140000 },
  { id: "caramel-mac", name: "کارامل ماکیاتو", categoryId: "hot-bar", price: 160000 },
  { id: "mocha", name: "موکا", categoryId: "hot-bar", price: 160000 },
  { id: "affogato", name: "آفوگاتو", categoryId: "hot-bar", price: 170000 },
  { id: "hot-choco", name: "هات چاکلت", categoryId: "hot-bar", price: 150000 },

  { id: "tea", name: "چای", categoryId: "tea", price: 70000 },
  { id: "tea-malas", name: "چای ملس", categoryId: "tea", price: 85000 },
  { id: "tea-masala", name: "چای ماسالا", categoryId: "tea", price: 120000 },
  { id: "herbal-gaff", name: "دمنوش مخصوص گاف", categoryId: "tea", price: 130000 },
  { id: "herbal-gol", name: "دمنوش گل‌گاوزبان", categoryId: "tea", price: 110000 },
  { id: "herbal-relax", name: "دمنوش آرامش", categoryId: "tea", price: 110000 },

  { id: "iced-americano", name: "آیس آمریکانو", categoryId: "cold-bar", price: 120000 },
  { id: "iced-latte", name: "آیس لاته", categoryId: "cold-bar", price: 150000 },
  { id: "iced-caramel", name: "آیس کارامل ماکیاتو", categoryId: "cold-bar", price: 170000 },
  { id: "iced-mocha", name: "آیس موکا", categoryId: "cold-bar", price: 170000 },
  { id: "mojito", name: "موهیتو", categoryId: "cold-bar", price: 140000 },
  { id: "lemonade", name: "لیموناد طبیعی", categoryId: "cold-bar", price: 130000 },

  { id: "omelet", name: "املت", categoryId: "breakfast", price: 180000 },
  { id: "omelet-sausage", name: "املت سوسیس", categoryId: "breakfast", price: 220000 },
  { id: "omelet-bandari", name: "املت بندری", categoryId: "breakfast", price: 230000 },
  { id: "omelet-potato", name: "املت سیب‌زمینی", categoryId: "breakfast", price: 200000 },
  { id: "omelet-mushroom", name: "املت قارچ", categoryId: "breakfast", price: 210000 },
  { id: "egg-simple", name: "نیمرو ساده", categoryId: "breakfast", price: 140000 },
  { id: "egg-mushroom", name: "نیمرو با قارچ", categoryId: "breakfast", price: 170000 },
  { id: "sausage-egg", name: "سوسیس تخم‌مرغ", categoryId: "breakfast", price: 200000 },
  { id: "egg-date", name: "نیمرو خرما", categoryId: "breakfast", price: 180000 },
  {
    id: "diet-breakfast",
    name: "صبحانه رژیمی (ورزشی)",
    description: "تخم‌مرغ آب‌پز + سیب‌زمینی + کلم بروکلی + قارچ + ذرت + خرما + گردو",
    categoryId: "breakfast",
    price: 280000,
  },

  { id: "shake-vanilla", name: "شیک وانیل", categoryId: "shakes", price: 160000 },
  { id: "shake-choco", name: "شیک شکلات", categoryId: "shakes", price: 160000 },
  { id: "shake-strawberry", name: "شیک توت‌فرنگی", categoryId: "shakes", price: 170000 },
  { id: "shake-caramel", name: "شیک کارامل", categoryId: "shakes", price: 170000 },
  { id: "shake-hazelnut", name: "شیک فندق", categoryId: "shakes", price: 180000 },
];

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
      // لینک رسمی نشان برای مسیریابی از موقعیت فعلی تا مقصد
      neshan: `https://nshn.ir/?destination=${nLat},${nLng}&vehicle=d`,
    };
  }
  const q = encodeURIComponent(address);
  return {
    google: "https://www.google.com/maps/search/?api=1&query=" + q,
    neshan: "https://nshn.ir/?q=" + q,
  };
}
