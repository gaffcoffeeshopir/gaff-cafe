/**
 * سرور کافه گاف — منو + سفارش تلگرام + پنل مخفی مدیریت
 * پنل: /gaff-desk  (در منوی مشتری لینک نیست)
 */

const path = require("path");
const fs = require("fs");
const https = require("https");
const crypto = require("crypto");
const dns = require("dns");
const express = require("express");
const dotenv = require("dotenv");
const { HttpsProxyAgent } = require("https-proxy-agent");

dns.setDefaultResultOrder("ipv4first");
dotenv.config({ path: path.join(__dirname, ".env") });

const PORT = Number(process.env.PORT) || 5173;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "gaff1405";
const PUBLIC_BASE_URL = String(
  process.env.PUBLIC_BASE_URL || "https://gaff-cafe.onrender.com"
).replace(/\/$/, "");
const SITE_URL = PUBLIC_BASE_URL + "/";
const ADMIN_URL = PUBLIC_BASE_URL + "/gaff-desk";
const PROXY_URL =
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.https_proxy ||
  process.env.http_proxy ||
  "";

const proxyAgent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : undefined;
const sessions = new Map();

const {
  initMenuDb,
  readMenu,
  writeMenu,
  saveSticker,
  restoreStickersToDisk,
  createOrder,
  closeShift,
  formatShiftReceipt,
  createFeedback,
  listFeedback,
  deleteFeedback,
  lookupCustomer,
  upsertCustomer,
  listCustomers,
  getCustomerDetail,
  normalizeIranPhone,
  getPersistenceInfo,
  isPersistentStorage,
  getDbMode,
} = require("./lib/menu-db");

const app = express();
const root = __dirname;

app.use(express.json({ limit: "3mb" }));

const ICONS_DIR = path.join(__dirname, "img", "icons");
const ALLOWED_STICKER_EXT = new Set([".svg", ".png", ".webp", ".jpg", ".jpeg"]);

function listStickers() {
  if (!fs.existsSync(ICONS_DIR)) return [];
  return fs
    .readdirSync(ICONS_DIR)
    .filter((name) => ALLOWED_STICKER_EXT.has(path.extname(name).toLowerCase()))
    .sort()
    .map((name) => ({
      file: name,
      path: "img/icons/" + name,
    }));
}

function isSafeIconPath(iconPath) {
  const normalized = String(iconPath || "").replace(/\\/g, "/").trim();
  if (!normalized.startsWith("img/icons/")) return false;
  if (normalized.includes("..")) return false;
  const abs = path.resolve(__dirname, normalized);
  const iconsRoot = path.resolve(ICONS_DIR);
  const prefix = iconsRoot.endsWith(path.sep) ? iconsRoot : iconsRoot + path.sep;
  if (!abs.toLowerCase().startsWith(prefix.toLowerCase()) && abs.toLowerCase() !== iconsRoot.toLowerCase()) {
    return false;
  }
  return fs.existsSync(abs);
}

function newToken() {
  return crypto.randomBytes(24).toString("hex");
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  const exp = sessions.get(token);
  if (!token || !exp || exp < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ ok: false, error: "ورود لازم است" });
  }
  // تمدید نشست
  sessions.set(token, Date.now() + 1000 * 60 * 60 * 12);
  next();
}

function slugifyId(name) {
  const base =
    String(name || "item")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w\u0600-\u06FF-]+/g, "")
      .slice(0, 40) || "item";
  return base + "-" + Date.now().toString(36).slice(-4);
}

function formatOrderMessage(order) {
  const lines = (order.items || []).map((line) => {
    const opt = line.optionLabel ? ` (${line.optionLabel})` : "";
    return `• ${line.name}${opt} × ${line.quantity}`;
  });

  let text =
    `☕ سفارش جدید کافه گاف\n` +
    `━━━━━━━━━━━━\n` +
    `🔖 کد: ${order.trackingCode || "-"}\n` +
    `🪑 میز: ${order.tableNumber}\n` +
    `━━━━━━━━━━━━\n` +
    `${lines.join("\n")}`;

  if (order.note) text += `\n━━━━━━━━━━━━\n📝 یادداشت: ${order.note}`;
  return text;
}

function telegramApi(method, body) {
  if (!BOT_TOKEN) {
    return Promise.reject(new Error("TELEGRAM_BOT_TOKEN تنظیم نشده"));
  }

  const payload = JSON.stringify(body || {});
  const options = {
    hostname: "api.telegram.org",
    path: `/bot${BOT_TOKEN}/${method}`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    },
  };

  if (proxyAgent) {
    options.agent = proxyAgent;
  } else {
    options.family = 4;
  }

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => {
        try {
          const data = JSON.parse(raw);
          if (!data.ok) {
            reject(new Error(data.description || "خطای تلگرام"));
            return;
          }
          resolve(data.result);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => {
      req.destroy(new Error("Timeout connecting to Telegram"));
    });
    req.write(payload);
    req.end();
  });
}

function botMenuKeyboard() {
  return {
    inline_keyboard: [[{ text: "☕ باز کردن منوی دیجیتال", url: SITE_URL }]],
  };
}

function botPanelKeyboard() {
  return {
    inline_keyboard: [[{ text: "🛠 ورود به پنل", url: ADMIN_URL }]],
  };
}

function isStaffChat(chatId) {
  if (!CHAT_ID) return false;
  return String(chatId) === String(CHAT_ID);
}

function botWelcomeText() {
  return "به ربات کافه گاف خوش آمدید. لطفاً دستور خود را از منوی پایین انتخاب کنید.";
}

async function sendBotMenu(chatId) {
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: "☕ منوی دیجیتال کافه گاف",
    reply_markup: botMenuKeyboard(),
    disable_web_page_preview: true,
  });
}

async function sendBotPanel(chatId) {
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: "🛠 پنل مدیریت منو\nورود با رمز لازم است.",
    reply_markup: botPanelKeyboard(),
    disable_web_page_preview: true,
  });
}

async function sendBotCloseShift(chatId) {
  if (!isStaffChat(chatId)) {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: "این گزینه فقط برای مدیریت کافه است.",
      disable_web_page_preview: true,
    });
    return;
  }

  const orders = await closeShift();
  const receipt = formatShiftReceipt(orders);
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: receipt,
    disable_web_page_preview: true,
  });
}

async function handleTelegramUpdate(update) {
  const msg = update && (update.message || update.edited_message);
  if (!msg || !msg.chat || !msg.text) return;

  const text = String(msg.text).trim();
  const chatId = msg.chat.id;
  const cmd = text.split(/\s+/)[0].split("@")[0].toLowerCase();

  if (cmd === "/start") {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: botWelcomeText(),
      disable_web_page_preview: true,
    });
    return;
  }

  if (cmd === "/menu") {
    await sendBotMenu(chatId);
    return;
  }

  if (cmd === "/panel" || cmd === "/admin") {
    await sendBotPanel(chatId);
    return;
  }

  if (cmd === "/close" || cmd === "/fiche") {
    await sendBotCloseShift(chatId);
  }
}

async function setupTelegramBot() {
  if (!BOT_TOKEN) return;

  try {
    await telegramApi("setMyCommands", {
      commands: [
        { command: "start", description: "شروع" },
        { command: "menu", description: "منوی دیجیتال" },
        { command: "panel", description: "پنل" },
        { command: "close", description: "بستن فیش شیفت" },
      ],
    });
    console.log("Telegram commands: OK");
  } catch (err) {
    console.error("Telegram setMyCommands:", err.message);
  }

  if (!PUBLIC_BASE_URL.startsWith("https://")) {
    console.log("Telegram webhook: skipped (PUBLIC_BASE_URL must be https)");
    return;
  }

  try {
    await telegramApi("setWebhook", {
      url: PUBLIC_BASE_URL + "/api/telegram/webhook",
      allowed_updates: ["message"],
      drop_pending_updates: false,
    });
    console.log("Telegram webhook:", PUBLIC_BASE_URL + "/api/telegram/webhook");
  } catch (err) {
    console.error("Telegram setWebhook:", err.message);
  }
}

app.get("/api/health", async (_req, res) => {
  try {
    const menu = await readMenu();
    const persistence = getPersistenceInfo();
    res.json({
      ok: true,
      botConfigured: Boolean(BOT_TOKEN),
      chatConfigured: Boolean(CHAT_ID),
      publicUrl: PUBLIC_BASE_URL,
      adminUrl: ADMIN_URL,
      db: getDbMode(),
      persistent: persistence.persistent,
      categories: menu.categories.length,
      items: menu.items.length,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/admin/status", requireAdmin, async (_req, res) => {
  try {
    const menu = await readMenu();
    const persistence = getPersistenceInfo();
    res.json({
      ok: true,
      ...persistence,
      categories: menu.categories.length,
      items: menu.items.length,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/menu", async (_req, res) => {
  try {
    res.json(await readMenu());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/login", (req, res) => {
  const password = String((req.body && req.body.password) || "");
  const expected = Buffer.from(ADMIN_PASSWORD);
  const got = Buffer.from(password);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) {
    return res.status(401).json({ ok: false, error: "رمز اشتباه است" });
  }
  const token = newToken();
  sessions.set(token, Date.now() + 1000 * 60 * 60 * 12);
  res.json({ ok: true, token });
});

app.get("/api/admin/menu", requireAdmin, async (_req, res) => {
  try {
    res.json(await readMenu());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/stickers", requireAdmin, (_req, res) => {
  try {
    res.json({ ok: true, stickers: listStickers() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/admin/stickers", requireAdmin, async (req, res) => {
  try {
    const nameRaw = String((req.body && req.body.name) || "sticker").trim();
    const dataUrl = String((req.body && req.body.data) || "");
    const match = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,(.+)$/i.exec(dataUrl);
    if (!match) {
      return res.status(400).json({ ok: false, error: "فایل استیکر نامعتبر است" });
    }

    let ext = match[1].toLowerCase();
    if (ext === "jpeg") ext = "jpg";
    if (ext === "svg+xml") ext = "svg";

    const mimeMap = {
      png: "image/png",
      jpg: "image/jpeg",
      webp: "image/webp",
      svg: "image/svg+xml",
    };

    const safeBase =
      nameRaw
        .toLowerCase()
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[^\w\u0600-\u06FF-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "sticker";

    fs.mkdirSync(ICONS_DIR, { recursive: true });
    const file = `${safeBase}-${Date.now().toString(36).slice(-5)}.${ext}`;
    const abs = path.join(ICONS_DIR, file);
    const buffer = Buffer.from(match[2], "base64");
    fs.writeFileSync(abs, buffer);
    await saveSticker(file, mimeMap[ext] || "application/octet-stream", buffer);

    const iconPath = "img/icons/" + file;
    res.json({ ok: true, sticker: { file, path: iconPath } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/admin/categories", requireAdmin, async (req, res) => {
  try {
    const menu = await readMenu();
    const name = String((req.body && req.body.name) || "").trim();
    const icon = String((req.body && req.body.icon) || "").trim().replace(/\\/g, "/");

    if (!name) return res.status(400).json({ ok: false, error: "نام دسته‌بندی لازم است" });
    if (!isSafeIconPath(icon)) {
      return res.status(400).json({ ok: false, error: "استیکر معتبر انتخاب کنید" });
    }
    if (menu.categories.some((c) => c.name === name)) {
      return res.status(400).json({ ok: false, error: "این نام دسته از قبل وجود دارد" });
    }

    let id = slugifyId(name).replace(/-\w+$/, "");
    if (!id || id === "item") id = "cat";
    id = id.slice(0, 32);
    let unique = id;
    let n = 2;
    while (menu.categories.some((c) => c.id === unique)) {
      unique = id + "-" + n;
      n += 1;
    }

    const category = { id: unique, name, icon };
    menu.categories.push(category);
    await writeMenu(menu);
    res.json({ ok: true, category });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/admin/categories/:id", requireAdmin, async (req, res) => {
  try {
    const menu = await readMenu();
    const id = req.params.id;
    const cat = menu.categories.find((c) => c.id === id);
    if (!cat) return res.status(404).json({ ok: false, error: "دسته پیدا نشد" });

    const used = menu.items.some((i) => i.categoryId === id);
    if (used) {
      return res.status(400).json({
        ok: false,
        error: "اول محصولات این دسته را حذف یا جابه‌جا کنید",
      });
    }

    menu.categories = menu.categories.filter((c) => c.id !== id);
    await writeMenu(menu);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.patch("/api/admin/items/:id", requireAdmin, async (req, res) => {
  try {
    const menu = await readMenu();
    const item = menu.items.find((i) => i.id === req.params.id);
    if (!item) return res.status(404).json({ ok: false, error: "محصول پیدا نشد" });

    if (req.body.name != null) item.name = String(req.body.name).trim();
    if (req.body.description != null) {
      const d = String(req.body.description).trim();
      if (d) item.description = d;
      else delete item.description;
    }
    if (req.body.categoryId != null) item.categoryId = String(req.body.categoryId);
    if (req.body.hasSize === true) {
      item.options = [
        { id: "single", label: "تک", priceDelta: 0 },
        { id: "double", label: "دوبل", priceDelta: 0 },
      ];
    }
    if (req.body.hasSize === false) {
      delete item.options;
    }

    await writeMenu(menu);
    res.json({ ok: true, item });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/admin/items", requireAdmin, async (req, res) => {
  try {
    const menu = await readMenu();
    const name = String((req.body && req.body.name) || "").trim();
    const categoryId = String((req.body && req.body.categoryId) || "").trim();
    const description = String((req.body && req.body.description) || "").trim();
    const hasSize = Boolean(req.body && req.body.hasSize);

    if (!name) return res.status(400).json({ ok: false, error: "نام محصول لازم است" });
    if (!menu.categories.some((c) => c.id === categoryId)) {
      return res.status(400).json({ ok: false, error: "دسته‌بندی نامعتبر است" });
    }

    const item = {
      id: slugifyId(name),
      name,
      categoryId,
      price: 0,
    };
    if (description) item.description = description;
    if (hasSize) {
      item.options = [
        { id: "single", label: "تک", priceDelta: 0 },
        { id: "double", label: "دوبل", priceDelta: 0 },
      ];
    }

    menu.items.push(item);
    await writeMenu(menu);
    res.json({ ok: true, item });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/admin/items/:id", requireAdmin, async (req, res) => {
  try {
    const menu = await readMenu();
    const before = menu.items.length;
    menu.items = menu.items.filter((i) => i.id !== req.params.id);
    if (menu.items.length === before) {
      return res.status(404).json({ ok: false, error: "محصول پیدا نشد" });
    }
    await writeMenu(menu);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/telegram/webhook", async (req, res) => {
  try {
    await handleTelegramUpdate(req.body || {});
    res.json({ ok: true });
  } catch (err) {
    console.error("[telegram webhook]", err.message);
    res.json({ ok: true });
  }
});

app.post("/api/telegram/setup", async (_req, res) => {
  try {
    await setupTelegramBot();
    res.json({
      ok: true,
      siteUrl: SITE_URL,
      adminUrl: ADMIN_URL,
      webhook: PUBLIC_BASE_URL + "/api/telegram/webhook",
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/telegram/chat-id", async (_req, res) => {
  try {
    const updates = await telegramApi("getUpdates", { limit: 20 });
    const chats = [];
    for (const u of updates) {
      const msg = u.message || u.edited_message;
      if (!msg || !msg.chat) continue;
      chats.push({
        chatId: msg.chat.id,
        name: [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(" "),
        username: msg.chat.username || null,
        type: msg.chat.type,
        text: msg.text || "",
      });
    }
    const unique = [];
    const seen = new Set();
    for (const c of chats.reverse()) {
      if (seen.has(c.chatId)) continue;
      seen.add(c.chatId);
      unique.push(c);
    }
    res.json({
      hint: "یکی از chatIdها را در .env به صورت TELEGRAM_CHAT_ID=... بگذار",
      chats: unique,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/order", async (req, res) => {
  try {
    const body = req.body || {};
    const tableNumber = String(body.tableNumber || "").trim();
    const items = body.items;
    if (!tableNumber || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ ok: false, error: "سفارش نامعتبر است" });
    }
    if (!CHAT_ID) {
      return res.status(503).json({
        ok: false,
        error: "TELEGRAM_CHAT_ID تنظیم نشده.",
      });
    }

    const saved = await createOrder({
      tableNumber,
      note: body.note || "",
      items,
      total: body.total,
      customerPhone: body.customerPhone || body.phone || "",
    });

    const order = {
      ...saved,
      totalLabel: "",
    };

    const text = formatOrderMessage(order);
    await telegramApi("sendMessage", {
      chat_id: CHAT_ID,
      text,
      disable_web_page_preview: true,
    });

    res.json({ ok: true, sent: true, order: saved });
  } catch (err) {
    console.error("[order]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* نظرات مشتری — عمومی فقط ثبت؛ مشاهده فقط ادمین */
app.post("/api/feedback", async (req, res) => {
  try {
    const name = String((req.body && req.body.name) || "").trim();
    const message = String((req.body && req.body.message) || "").trim();
    const phone = String((req.body && req.body.phone) || "").trim();
    if (!message) {
      return res.status(400).json({ ok: false, error: "متن نظر را بنویسید" });
    }
    if (message.length < 3) {
      return res.status(400).json({ ok: false, error: "نظر خیلی کوتاه است" });
    }
    const saved = await createFeedback({ name, message, phone });
    res.json({ ok: true, id: saved.id });
  } catch (err) {
    console.error("[feedback]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/admin/feedback", requireAdmin, async (_req, res) => {
  try {
    const items = await listFeedback();
    res.json({ ok: true, items });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/admin/feedback/:id", requireAdmin, async (req, res) => {
  try {
    const removed = await deleteFeedback(req.params.id);
    if (!removed) return res.status(404).json({ ok: false, error: "نظر پیدا نشد" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* مشتریان — ثبت از سایت، مشاهده فقط ادمین */
app.post("/api/customers/lookup", async (req, res) => {
  try {
    const phone = normalizeIranPhone((req.body && req.body.phone) || "");
    if (!phone) {
      return res.status(400).json({ ok: false, error: "شماره موبایل نامعتبر است" });
    }
    const customer = await lookupCustomer(phone);
    if (!customer) {
      return res.json({ ok: true, exists: false, phone });
    }
    await upsertCustomer({ phone }); // touch last_seen
    const fresh = await lookupCustomer(phone);
    res.json({
      ok: true,
      exists: true,
      phone: fresh.phone,
      name: fresh.name || "",
      hasName: Boolean(fresh.name),
      birthJalali: fresh.birthJalali || "",
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/customers/register", async (req, res) => {
  try {
    const body = req.body || {};
    const phone = normalizeIranPhone(body.phone || "");
    if (!phone) {
      return res.status(400).json({ ok: false, error: "شماره موبایل نامعتبر است" });
    }
    const birthMonth = Number(body.birthMonth);
    const birthDay = Number(body.birthDay);
    const birthYear = body.birthYear != null ? Number(body.birthYear) : null;

    if (
      !Number.isFinite(birthMonth) ||
      birthMonth < 1 ||
      birthMonth > 12 ||
      !Number.isFinite(birthDay) ||
      birthDay < 1 ||
      birthDay > 31
    ) {
      return res.status(400).json({ ok: false, error: "تاریخ تولد شمسی را کامل وارد کنید" });
    }

    const customer = await upsertCustomer({
      phone,
      name: body.name || "",
      birthMonth,
      birthDay,
      birthYear,
    });

    res.json({
      ok: true,
      customer: {
        phone: customer.phone,
        name: customer.name || "",
        birthJalali: customer.birthJalali || "",
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/admin/customers", requireAdmin, async (_req, res) => {
  try {
    const items = await listCustomers();
    res.json({ ok: true, items });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/admin/customers/:phone", requireAdmin, async (req, res) => {
  try {
    const detail = await getCustomerDetail(req.params.phone);
    if (!detail) return res.status(404).json({ ok: false, error: "مشتری پیدا نشد" });
    res.json({ ok: true, ...detail });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* مسیر مخفی پنل — در سایت مشتری لینک نمی‌شود */
app.get("/gaff-desk", (_req, res) => {
  res.sendFile(path.join(root, "gaff-desk.html"));
});

app.get("/gaff-feedback", (_req, res) => {
  res.sendFile(path.join(root, "gaff-feedback.html"));
});

app.get("/gaff-customers", (_req, res) => {
  res.sendFile(path.join(root, "gaff-customers.html"));
});

app.use(
  "/vendor/fonts/vazirmatn",
  express.static(path.join(__dirname, "node_modules/@fontsource/vazirmatn"))
);
app.use(
  "/vendor/fonts/cormorant",
  express.static(path.join(__dirname, "node_modules/@fontsource/cormorant-garamond"))
);

app.use(express.static(root));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  if (path.extname(req.path)) return next();
  res.sendFile(path.join(root, "index.html"));
});

async function boot() {
  try {
    const dbInfo = await initMenuDb();
    const restored = await restoreStickersToDisk(ICONS_DIR);
    console.log(`Database: ${dbInfo}`);
    if (restored) console.log(`Stickers restored from DB: ${restored}`);
    const persistence = getPersistenceInfo();
    if (!persistence.persistent) {
      console.warn("⚠️  " + persistence.warning);
    } else {
      console.log("Menu storage: persistent (" + persistence.mode + ")");
    }
  } catch (err) {
    console.error("Database init failed:", err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`GAFF running at http://localhost:${PORT}`);
    console.log(`Admin desk: http://localhost:${PORT}/gaff-desk`);
    console.log(`Public site: ${SITE_URL}`);
    console.log(`Public admin: ${ADMIN_URL}`);
    console.log(
      BOT_TOKEN
        ? "Telegram bot token: OK"
        : "Telegram bot token: MISSING — فایل .env را بساز"
    );
    console.log(
      CHAT_ID
        ? `Telegram chat id: ${CHAT_ID}`
        : "Telegram chat id: MISSING"
    );
    console.log(PROXY_URL ? `Proxy: ${PROXY_URL}` : "Proxy: none");
    if (!process.env.DATABASE_URL) {
      console.log("Tip: برای ماندگاری روی Render مقدار DATABASE_URL (مثلاً Neon رایگان) را ست کن");
    }
    setupTelegramBot().catch((err) => {
      console.error("Telegram setup failed:", err.message);
    });
  });
}

boot();
