/**
 * سرور کافه گاف — منوی استاتیک + ارسال سفارش به تلگرام
 *
 * راه‌اندازی بات:
 * 1) در تلگرام @BotFather را باز کن → /newbot → توکن را بگیر
 * 2) توکن را در فایل .env بگذار: TELEGRAM_BOT_TOKEN=...
 * 3) npm run server را اجرا کن
 * 4) یک‌بار به بات پیام /start بده
 * 5) در مرورگر باز کن: http://localhost:5173/api/telegram/chat-id
 * 6) chat id را در .env بگذار: TELEGRAM_CHAT_ID=...
 * 7) سرور را دوباره اجرا کن
 */

const path = require("path");
const fs = require("fs");
const https = require("https");
const dns = require("dns");
const express = require("express");
const dotenv = require("dotenv");
const { HttpsProxyAgent } = require("https-proxy-agent");

dns.setDefaultResultOrder("ipv4first");

dotenv.config({ path: path.join(__dirname, ".env") });

const PORT = Number(process.env.PORT) || 5173;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const PROXY_URL =
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.https_proxy ||
  process.env.http_proxy ||
  "";

const proxyAgent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : undefined;

const app = express();
const root = __dirname;

app.use(express.json({ limit: "256kb" }));
app.use(express.static(root));

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

/** آخرین chat idهایی که به بات پیام داده‌اند را نشان می‌دهد */
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
        error: "TELEGRAM_CHAT_ID تنظیم نشده. اول /api/telegram/chat-id را ببین.",
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

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  const file = path.join(root, "index.html");
  if (fs.existsSync(file)) return res.sendFile(file);
  res.status(404).end("Not found");
});

app.listen(PORT, () => {
  console.log(`GAFF running at http://localhost:${PORT}`);
  console.log(
    BOT_TOKEN
      ? "Telegram bot token: OK"
      : "Telegram bot token: MISSING — فایل .env را بساز"
  );
  console.log(
    CHAT_ID
      ? `Telegram chat id: ${CHAT_ID}`
      : "Telegram chat id: MISSING — به بات /start بده و /api/telegram/chat-id را باز کن"
  );
  console.log(PROXY_URL ? `Proxy: ${PROXY_URL}` : "Proxy: none");
});
