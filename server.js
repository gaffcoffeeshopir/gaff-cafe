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
const PROXY_URL =
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.https_proxy ||
  process.env.http_proxy ||
  "";

const proxyAgent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : undefined;
const MENU_PATH = path.join(__dirname, "data", "menu.json");
const sessions = new Map();

const app = express();
const root = __dirname;

app.use(express.json({ limit: "512kb" }));

function readMenu() {
  const raw = fs.readFileSync(MENU_PATH, "utf8");
  return JSON.parse(raw);
}

function writeMenu(menu) {
  fs.mkdirSync(path.dirname(MENU_PATH), { recursive: true });
  fs.writeFileSync(MENU_PATH, JSON.stringify(menu, null, 2), "utf8");
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
    `${lines.join("\n")}\n` +
    `━━━━━━━━━━━━\n` +
    `💰 جمع: ${order.totalLabel || order.total}`;

  if (order.note) text += `\n📝 یادداشت: ${order.note}`;
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

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    botConfigured: Boolean(BOT_TOKEN),
    chatConfigured: Boolean(CHAT_ID),
  });
});

app.get("/api/menu", (_req, res) => {
  try {
    res.json(readMenu());
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

app.get("/api/admin/menu", requireAdmin, (_req, res) => {
  try {
    res.json(readMenu());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/admin/items/:id", requireAdmin, (req, res) => {
  try {
    const menu = readMenu();
    const item = menu.items.find((i) => i.id === req.params.id);
    if (!item) return res.status(404).json({ ok: false, error: "محصول پیدا نشد" });

    if (req.body.name != null) item.name = String(req.body.name).trim();
    if (req.body.description != null) {
      const d = String(req.body.description).trim();
      if (d) item.description = d;
      else delete item.description;
    }
    if (req.body.categoryId != null) item.categoryId = String(req.body.categoryId);
    if (req.body.price != null) {
      const price = Number(req.body.price);
      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({ ok: false, error: "قیمت نامعتبر است" });
      }
      item.price = Math.round(price);
    }
    if (req.body.doubleDelta != null) {
      const delta = Number(req.body.doubleDelta);
      if (!Number.isFinite(delta) || delta < 0) {
        return res.status(400).json({ ok: false, error: "مابه‌تفاوت دوبل نامعتبر است" });
      }
      if (!item.options) {
        item.options = [
          { id: "single", label: "تک", priceDelta: 0 },
          { id: "double", label: "دوبل", priceDelta: Math.round(delta) },
        ];
      } else {
        const dbl = item.options.find((o) => o.id === "double");
        if (dbl) dbl.priceDelta = Math.round(delta);
      }
    }
    if (req.body.hasSize === false) {
      delete item.options;
    }

    writeMenu(menu);
    res.json({ ok: true, item });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/admin/items", requireAdmin, (req, res) => {
  try {
    const menu = readMenu();
    const name = String((req.body && req.body.name) || "").trim();
    const categoryId = String((req.body && req.body.categoryId) || "").trim();
    const price = Number(req.body && req.body.price);
    const description = String((req.body && req.body.description) || "").trim();
    const hasSize = Boolean(req.body && req.body.hasSize);
    const doubleDelta = Number((req.body && req.body.doubleDelta) || 0);

    if (!name) return res.status(400).json({ ok: false, error: "نام محصول لازم است" });
    if (!menu.categories.some((c) => c.id === categoryId)) {
      return res.status(400).json({ ok: false, error: "دسته‌بندی نامعتبر است" });
    }
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ ok: false, error: "قیمت نامعتبر است" });
    }

    const item = {
      id: slugifyId(name),
      name,
      categoryId,
      price: Math.round(price),
    };
    if (description) item.description = description;
    if (hasSize) {
      item.options = [
        { id: "single", label: "تک", priceDelta: 0 },
        { id: "double", label: "دوبل", priceDelta: Math.round(Math.max(0, doubleDelta)) },
      ];
    }

    menu.items.push(item);
    writeMenu(menu);
    res.json({ ok: true, item });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/admin/items/:id", requireAdmin, (req, res) => {
  try {
    const menu = readMenu();
    const before = menu.items.length;
    menu.items = menu.items.filter((i) => i.id !== req.params.id);
    if (menu.items.length === before) {
      return res.status(404).json({ ok: false, error: "محصول پیدا نشد" });
    }
    writeMenu(menu);
    res.json({ ok: true });
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
    const order = req.body || {};
    if (!order.tableNumber || !Array.isArray(order.items) || !order.items.length) {
      return res.status(400).json({ ok: false, error: "سفارش نامعتبر است" });
    }
    if (!CHAT_ID) {
      return res.status(503).json({
        ok: false,
        error: "TELEGRAM_CHAT_ID تنظیم نشده.",
      });
    }

    const text = formatOrderMessage(order);
    await telegramApi("sendMessage", {
      chat_id: CHAT_ID,
      text,
      disable_web_page_preview: true,
    });

    res.json({ ok: true, sent: true });
  } catch (err) {
    console.error("[order]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* مسیر مخفی پنل — در سایت مشتری لینک نمی‌شود */
app.get("/gaff-desk", (_req, res) => {
  res.sendFile(path.join(root, "gaff-desk.html"));
});

app.use(express.static(root));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  if (path.extname(req.path)) return next();
  res.sendFile(path.join(root, "index.html"));
});

app.listen(PORT, () => {
  console.log(`GAFF running at http://localhost:${PORT}`);
  console.log(`Admin desk: http://localhost:${PORT}/gaff-desk`);
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
});
