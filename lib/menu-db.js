/**
 * ذخیره پایدار منو — SQLite محلی + Postgres ابری (اگر DATABASE_URL باشد)
 * هر ذخیره: دیتابیس + بکاپ menu.json
 */

const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(__dirname, "..", "data");
const MENU_JSON = path.join(DATA_DIR, "menu.json");
const SQLITE_PATH = path.join(DATA_DIR, "gaff.db");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

let mode = "sqlite"; // sqlite | postgres
let sqlite = null;
let pgPool = null;

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function ensureSqliteColumn(table, column, definition) {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function normalizeIranPhone(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("98") && digits.length >= 12) {
    digits = "0" + digits.slice(2);
  }
  if (digits.length === 10 && digits.startsWith("9")) {
    digits = "0" + digits;
  }
  if (!/^09\d{9}$/.test(digits)) return null;
  return digits;
}

function mapCustomerRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    phone: row.phone,
    name: row.name || "",
    birthJalali: row.birth_jalali || row.birthJalali || "",
    birthMonth: row.birth_month != null ? row.birth_month : row.birthMonth,
    birthDay: row.birth_day != null ? row.birth_day : row.birthDay,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
    lastSeenAt: row.last_seen_at || row.lastSeenAt,
  };
}

function loadSeedMenu() {
  if (!fs.existsSync(MENU_JSON)) {
    return { categories: [], items: [] };
  }
  return JSON.parse(fs.readFileSync(MENU_JSON, "utf8"));
}

function writeJsonBackup(menu) {
  ensureDirs();
  const pretty = JSON.stringify(menu, null, 2);
  fs.writeFileSync(MENU_JSON, pretty, "utf8");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(BACKUP_DIR, `menu-${stamp}.json`), pretty, "utf8");
  pruneOldBackups();
}

function pruneOldBackups() {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("menu-") && f.endsWith(".json"))
      .sort();
    while (files.length > 30) {
      const old = files.shift();
      fs.unlinkSync(path.join(BACKUP_DIR, old));
    }
  } catch {
    /* ignore */
  }
}

function normalizeMenu(menu) {
  return {
    categories: Array.isArray(menu && menu.categories) ? menu.categories : [],
    items: Array.isArray(menu && menu.items) ? menu.items : [],
  };
}

function isPersistentStorage() {
  if (mode === "postgres") return true;
  if (process.env.DATABASE_URL) return true;
  return !process.env.RENDER;
}

function getPersistenceInfo() {
  const persistent = isPersistentStorage();
  return {
    mode: mode,
    persistent,
    warning: persistent
      ? null
      : "ذخیره‌سازی موقت است — بعد از ری‌استارت Render تغییرات منو پاک می‌شود. DATABASE_URL (Neon) را در Render ست کنید.",
  };
}

function markMenuInitializedSqlite() {
  sqlite
    .prepare(
      "INSERT INTO meta (key, value) VALUES ('menu_initialized', '1') ON CONFLICT(key) DO UPDATE SET value = '1'"
    )
    .run();
}

async function markMenuInitializedPostgres() {
  await pgPool.query(
    `INSERT INTO meta (key, value) VALUES ('menu_initialized', '1')
     ON CONFLICT (key) DO UPDATE SET value = '1'`
  );
}

function shouldSeedMenuSqlite() {
  const catCount = sqlite.prepare("SELECT COUNT(*) AS c FROM categories").get().c;
  if (catCount > 0) return false;
  const row = sqlite.prepare("SELECT value FROM meta WHERE key = 'menu_initialized'").get();
  return !(row && row.value === "1");
}

async function shouldSeedMenuPostgres() {
  const { rows } = await pgPool.query("SELECT COUNT(*)::int AS c FROM categories");
  if (rows[0].c > 0) return false;
  const meta = await pgPool.query("SELECT value FROM meta WHERE key = 'menu_initialized'");
  return !(meta.rows[0] && meta.rows[0].value === "1");
}

/* —— SQLite —— */
function initSqlite() {
  const Database = require("better-sqlite3");
  ensureDirs();
  sqlite = new Database(SQLITE_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category_id TEXT NOT NULL,
      price INTEGER NOT NULL,
      description TEXT,
      options_json TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS stickers (
      file TEXT PRIMARY KEY,
      mime TEXT NOT NULL,
      data BLOB NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      tracking_code TEXT NOT NULL,
      table_number TEXT NOT NULL,
      note TEXT,
      items_json TEXT NOT NULL,
      total INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open'
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      name TEXT,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      name TEXT,
      birth_jalali TEXT,
      birth_month INTEGER,
      birth_day INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
  `);

  ensureSqliteColumn("feedback", "phone", "TEXT");
  ensureSqliteColumn("orders", "customer_phone", "TEXT");

  const catCount = sqlite.prepare("SELECT COUNT(*) AS c FROM categories").get().c;
  if (shouldSeedMenuSqlite()) {
    const seed = normalizeMenu(loadSeedMenu());
    saveMenuSqlite(seed);
    markMenuInitializedSqlite();
    console.log(`SQLite seeded from menu.json (${seed.categories.length} cats, ${seed.items.length} items)`);
  } else if (catCount === 0) {
    console.warn("Menu DB is empty but was initialized before — skipping menu.json re-seed.");
  }

  mode = "sqlite";
  return "sqlite:" + SQLITE_PATH;
}

function readMenuSqlite() {
  const categories = sqlite
    .prepare("SELECT id, name, icon FROM categories ORDER BY sort_order ASC, name ASC")
    .all();
  const rows = sqlite
    .prepare(
      "SELECT id, name, category_id AS categoryId, price, description, options_json FROM items ORDER BY sort_order ASC, name ASC"
    )
    .all();

  const items = rows.map((row) => {
    const item = {
      id: row.id,
      name: row.name,
      categoryId: row.categoryId,
      price: row.price,
    };
    if (row.description) item.description = row.description;
    if (row.options_json) {
      try {
        item.options = JSON.parse(row.options_json);
      } catch {
        /* ignore */
      }
    }
    return item;
  });

  return { categories, items };
}

function saveMenuSqlite(menu) {
  const data = normalizeMenu(menu);
  const tx = sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM items").run();
    sqlite.prepare("DELETE FROM categories").run();

    const insertCat = sqlite.prepare(
      "INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)"
    );
    const insertItem = sqlite.prepare(
      "INSERT INTO items (id, name, category_id, price, description, options_json, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );

    data.categories.forEach((c, i) => {
      insertCat.run(c.id, c.name, c.icon, i);
    });
    data.items.forEach((item, i) => {
      insertItem.run(
        item.id,
        item.name,
        item.categoryId,
        Math.round(Number(item.price) || 0),
        item.description || null,
        item.options ? JSON.stringify(item.options) : null,
        i
      );
    });

    sqlite
      .prepare(
        "INSERT INTO meta (key, value) VALUES ('updated_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      )
      .run(new Date().toISOString());
  });
  tx();
  writeJsonBackup(data);
  markMenuInitializedSqlite();
}

/* —— Postgres —— */
async function initPostgres(databaseUrl) {
  const { Pool } = require("pg");
  pgPool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
  });

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category_id TEXT NOT NULL REFERENCES categories(id),
      price INTEGER NOT NULL,
      description TEXT,
      options_json TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS stickers (
      file TEXT PRIMARY KEY,
      mime TEXT NOT NULL,
      data BYTEA NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      tracking_code TEXT NOT NULL,
      table_number TEXT NOT NULL,
      note TEXT,
      items_json TEXT NOT NULL,
      total INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'open'
    );
    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      name TEXT,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      name TEXT,
      birth_jalali TEXT,
      birth_month INTEGER,
      birth_day INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pgPool.query(`ALTER TABLE feedback ADD COLUMN IF NOT EXISTS phone TEXT`);
  await pgPool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT`);

  const { rows } = await pgPool.query("SELECT COUNT(*)::int AS c FROM categories");
  if (await shouldSeedMenuPostgres()) {
    const seed = normalizeMenu(loadSeedMenu());
    await saveMenuPostgres(seed);
    await markMenuInitializedPostgres();
    console.log(`Postgres seeded from menu.json (${seed.categories.length} cats, ${seed.items.length} items)`);
  } else if (rows[0].c === 0) {
    console.warn("Menu DB is empty but was initialized before — skipping menu.json re-seed.");
  }

  mode = "postgres";
  return "postgres";
}

async function readMenuPostgres() {
  const cats = await pgPool.query(
    "SELECT id, name, icon FROM categories ORDER BY sort_order ASC, name ASC"
  );
  const itemRows = await pgPool.query(
    "SELECT id, name, category_id AS \"categoryId\", price, description, options_json FROM items ORDER BY sort_order ASC, name ASC"
  );

  const items = itemRows.rows.map((row) => {
    const item = {
      id: row.id,
      name: row.name,
      categoryId: row.categoryId,
      price: row.price,
    };
    if (row.description) item.description = row.description;
    if (row.options_json) {
      try {
        item.options = JSON.parse(row.options_json);
      } catch {
        /* ignore */
      }
    }
    return item;
  });

  return { categories: cats.rows, items };
}

async function saveMenuPostgres(menu) {
  const data = normalizeMenu(menu);
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM items");
    await client.query("DELETE FROM categories");

    for (let i = 0; i < data.categories.length; i++) {
      const c = data.categories[i];
      await client.query(
        "INSERT INTO categories (id, name, icon, sort_order) VALUES ($1, $2, $3, $4)",
        [c.id, c.name, c.icon, i]
      );
    }
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      await client.query(
        "INSERT INTO items (id, name, category_id, price, description, options_json, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
          item.id,
          item.name,
          item.categoryId,
          Math.round(Number(item.price) || 0),
          item.description || null,
          item.options ? JSON.stringify(item.options) : null,
          i,
        ]
      );
    }
    await client.query(
      `INSERT INTO meta (key, value) VALUES ('updated_at', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [new Date().toISOString()]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  writeJsonBackup(data);
  await markMenuInitializedPostgres();
}
function saveStickerSqlite(file, mime, buffer) {
  sqlite
    .prepare(
      `INSERT INTO stickers (file, mime, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(file) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(file, mime, buffer, new Date().toISOString());
}

async function saveStickerPostgres(file, mime, buffer) {
  await pgPool.query(
    `INSERT INTO stickers (file, mime, data, updated_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (file) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, updated_at = NOW()`,
    [file, mime, buffer]
  );
}

function listStickerFilesSqlite() {
  return sqlite.prepare("SELECT file FROM stickers ORDER BY file ASC").all().map((r) => r.file);
}

async function listStickerFilesPostgres() {
  const { rows } = await pgPool.query("SELECT file FROM stickers ORDER BY file ASC");
  return rows.map((r) => r.file);
}

function restoreStickersToDiskSqlite(iconsDir) {
  fs.mkdirSync(iconsDir, { recursive: true });
  const rows = sqlite.prepare("SELECT file, data FROM stickers").all();
  for (const row of rows) {
    fs.writeFileSync(path.join(iconsDir, row.file), row.data);
  }
  return rows.length;
}

async function restoreStickersToDiskPostgres(iconsDir) {
  fs.mkdirSync(iconsDir, { recursive: true });
  const { rows } = await pgPool.query("SELECT file, data FROM stickers");
  for (const row of rows) {
    fs.writeFileSync(path.join(iconsDir, row.file), row.data);
  }
  return rows.length;
}

function formatPriceFa(amount) {
  return new Intl.NumberFormat("fa-IR").format(Math.round(amount)) + " تومان";
}

function calcOrderTotal(items) {
  return (items || []).reduce(
    (sum, line) => sum + Math.round(Number(line.unitPrice || line.price || 0)) * (line.quantity || 1),
    0
  );
}

function rowToOrder(row) {
  let items = [];
  try {
    items = JSON.parse(row.items_json || row.itemsJson || "[]");
  } catch {
    items = [];
  }
  return {
    id: row.id,
    trackingCode: row.tracking_code || row.trackingCode,
    tableNumber: row.table_number || row.tableNumber,
    note: row.note || "",
    items,
    total: row.total,
    createdAt: row.created_at || row.createdAt,
    status: row.status,
    customerPhone: row.customer_phone || row.customerPhone || "",
  };
}

/* —— Orders: SQLite —— */
function getMetaSqlite(key, fallback) {
  const row = sqlite.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

function setMetaSqlite(key, value) {
  sqlite
    .prepare(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, String(value));
}

function nextTrackingCodeSqlite() {
  let n = parseInt(getMetaSqlite("tracking_counter", "0"), 10) + 1;
  if (n > 99) n = 1;
  setMetaSqlite("tracking_counter", n);
  return "G-" + n;
}

function resetTrackingCounterSqlite() {
  setMetaSqlite("tracking_counter", "0");
}

function createOrderSqlite(payload) {
  const items = payload.items || [];
  const total = payload.total != null ? Math.round(payload.total) : calcOrderTotal(items);
  const customerPhone = normalizeIranPhone(payload.customerPhone || payload.phone) || null;
  const order = {
    id: "ord-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    trackingCode: nextTrackingCodeSqlite(),
    tableNumber: String(payload.tableNumber || "").trim(),
    note: String(payload.note || "").trim(),
    items,
    total,
    createdAt: new Date().toISOString(),
    status: "open",
    customerPhone: customerPhone || "",
  };
  sqlite
    .prepare(
      `INSERT INTO orders (id, tracking_code, table_number, note, items_json, total, created_at, status, customer_phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      order.id,
      order.trackingCode,
      order.tableNumber,
      order.note || null,
      JSON.stringify(items),
      order.total,
      order.createdAt,
      order.status,
      customerPhone
    );
  if (customerPhone) touchCustomerSqlite(customerPhone);
  return order;
}

function listOpenOrdersSqlite() {
  return sqlite
    .prepare(
      "SELECT id, tracking_code, table_number, note, items_json, total, created_at, status FROM orders WHERE status = 'open' ORDER BY created_at ASC"
    )
    .all()
    .map(rowToOrder);
}

function closeShiftSqlite() {
  const orders = listOpenOrdersSqlite();
  sqlite.prepare("UPDATE orders SET status = 'closed' WHERE status = 'open'").run();
  resetTrackingCounterSqlite();
  return orders;
}

/* —— Orders: Postgres —— */
async function getMetaPostgres(key, fallback) {
  const { rows } = await pgPool.query("SELECT value FROM meta WHERE key = $1", [key]);
  return rows[0] ? rows[0].value : fallback;
}

async function setMetaPostgres(key, value) {
  await pgPool.query(
    `INSERT INTO meta (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, String(value)]
  );
}

async function nextTrackingCodePostgres() {
  let n = parseInt(await getMetaPostgres("tracking_counter", "0"), 10) + 1;
  if (n > 99) n = 1;
  await setMetaPostgres("tracking_counter", n);
  return "G-" + n;
}

async function resetTrackingCounterPostgres() {
  await setMetaPostgres("tracking_counter", "0");
}

async function createOrderPostgres(payload) {
  const items = payload.items || [];
  const total = payload.total != null ? Math.round(payload.total) : calcOrderTotal(items);
  const customerPhone = normalizeIranPhone(payload.customerPhone || payload.phone) || null;
  const order = {
    id: "ord-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    trackingCode: await nextTrackingCodePostgres(),
    tableNumber: String(payload.tableNumber || "").trim(),
    note: String(payload.note || "").trim(),
    items,
    total,
    createdAt: new Date().toISOString(),
    status: "open",
    customerPhone: customerPhone || "",
  };
  await pgPool.query(
    `INSERT INTO orders (id, tracking_code, table_number, note, items_json, total, created_at, status, customer_phone)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      order.id,
      order.trackingCode,
      order.tableNumber,
      order.note || null,
      JSON.stringify(items),
      order.total,
      order.createdAt,
      order.status,
      customerPhone,
    ]
  );
  if (customerPhone) await touchCustomerPostgres(customerPhone);
  return order;
}

async function listOpenOrdersPostgres() {
  const { rows } = await pgPool.query(
    `SELECT id, tracking_code AS "trackingCode", table_number AS "tableNumber", note, items_json AS "itemsJson", total, created_at AS "createdAt", status
     FROM orders WHERE status = 'open' ORDER BY created_at ASC`
  );
  return rows.map(rowToOrder);
}

async function closeShiftPostgres() {
  const orders = await listOpenOrdersPostgres();
  await pgPool.query("UPDATE orders SET status = 'closed' WHERE status = 'open'");
  await resetTrackingCounterPostgres();
  return orders;
}

function formatShiftReceipt(orders) {
  if (!orders.length) {
    return "📋 سفارش بازی برای بستن فیش نیست.";
  }

  const lines = [];

  for (const order of orders) {
    for (const item of order.items || []) {
      const qty = item.quantity || 1;
      const opt = item.optionLabel ? ` (${item.optionLabel})` : "";
      const qtyLabel = qty > 1 ? ` × ${new Intl.NumberFormat("fa-IR").format(qty)}` : "";
      lines.push(`• ${item.name}${opt}${qtyLabel}`);
    }
  }

  const sep = "━━━━━━━━━━━━";
  return (
    `📋 فیش پایان شیفت — کافه گاف\n` +
    `${sep}\n` +
    `${lines.join("\n")}\n` +
    `${sep}\n` +
    `🧾 تعداد سفارش: ${new Intl.NumberFormat("fa-IR").format(orders.length)}\n` +
    `🔁 شماره سفارش‌ها ریست شد`
  );
}

/* —— Public API —— */
async function initMenuDb() {
  const databaseUrl = process.env.DATABASE_URL || "";
  if (databaseUrl) {
    const info = await initPostgres(databaseUrl);
    return info;
  }
  return initSqlite();
}

async function readMenu() {
  if (mode === "postgres") return readMenuPostgres();
  return readMenuSqlite();
}

async function writeMenu(menu) {
  if (mode === "postgres") return saveMenuPostgres(menu);
  return saveMenuSqlite(menu);
}

async function saveSticker(file, mime, buffer) {
  if (mode === "postgres") return saveStickerPostgres(file, mime, buffer);
  return saveStickerSqlite(file, mime, buffer);
}

async function listDbStickerFiles() {
  if (mode === "postgres") return listStickerFilesPostgres();
  return listStickerFilesSqlite();
}

async function restoreStickersToDisk(iconsDir) {
  if (mode === "postgres") return restoreStickersToDiskPostgres(iconsDir);
  return restoreStickersToDiskSqlite(iconsDir);
}

async function createOrder(payload) {
  if (mode === "postgres") return createOrderPostgres(payload);
  return createOrderSqlite(payload);
}

async function closeShift() {
  if (mode === "postgres") return closeShiftPostgres();
  return closeShiftSqlite();
}

function createFeedbackSqlite(payload) {
  const phone = normalizeIranPhone(payload.phone) || null;
  const feedback = {
    id: "fb-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    name: String(payload.name || "").trim().slice(0, 80),
    message: String(payload.message || "").trim().slice(0, 2000),
    phone: phone || "",
    createdAt: new Date().toISOString(),
  };
  if (!feedback.message) {
    throw new Error("متن نظر خالی است");
  }
  sqlite
    .prepare(
      "INSERT INTO feedback (id, name, message, created_at, phone) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      feedback.id,
      feedback.name || null,
      feedback.message,
      feedback.createdAt,
      phone
    );
  if (phone) touchCustomerSqlite(phone);
  return feedback;
}

function listFeedbackSqlite() {
  return sqlite
    .prepare(
      "SELECT id, name, message, phone, created_at AS createdAt FROM feedback ORDER BY created_at DESC"
    )
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name || "",
      message: row.message,
      phone: row.phone || "",
      createdAt: row.createdAt,
    }));
}

function deleteFeedbackSqlite(id) {
  const info = sqlite.prepare("DELETE FROM feedback WHERE id = ?").run(id);
  return info.changes > 0;
}

async function createFeedbackPostgres(payload) {
  const phone = normalizeIranPhone(payload.phone) || null;
  const feedback = {
    id: "fb-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    name: String(payload.name || "").trim().slice(0, 80),
    message: String(payload.message || "").trim().slice(0, 2000),
    phone: phone || "",
    createdAt: new Date().toISOString(),
  };
  if (!feedback.message) {
    throw new Error("متن نظر خالی است");
  }
  await pgPool.query(
    "INSERT INTO feedback (id, name, message, created_at, phone) VALUES ($1, $2, $3, $4, $5)",
    [feedback.id, feedback.name || null, feedback.message, feedback.createdAt, phone]
  );
  if (phone) await touchCustomerPostgres(phone);
  return feedback;
}

async function listFeedbackPostgres() {
  const { rows } = await pgPool.query(
    `SELECT id, name, message, phone, created_at AS "createdAt"
     FROM feedback ORDER BY created_at DESC`
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name || "",
    message: row.message,
    phone: row.phone || "",
    createdAt: row.createdAt,
  }));
}

async function deleteFeedbackPostgres(id) {
  const result = await pgPool.query("DELETE FROM feedback WHERE id = $1", [id]);
  return result.rowCount > 0;
}

async function createFeedback(payload) {
  if (mode === "postgres") return createFeedbackPostgres(payload);
  return createFeedbackSqlite(payload);
}

async function listFeedback() {
  if (mode === "postgres") return listFeedbackPostgres();
  return listFeedbackSqlite();
}

async function deleteFeedback(id) {
  if (mode === "postgres") return deleteFeedbackPostgres(id);
  return deleteFeedbackSqlite(id);
}

/* —— Customers —— */
function touchCustomerSqlite(phone) {
  const now = new Date().toISOString();
  sqlite
    .prepare("UPDATE customers SET last_seen_at = ? WHERE phone = ?")
    .run(now, phone);
}

async function touchCustomerPostgres(phone) {
  await pgPool.query("UPDATE customers SET last_seen_at = NOW() WHERE phone = $1", [phone]);
}

function getCustomerByPhoneSqlite(phone) {
  const normalized = normalizeIranPhone(phone);
  if (!normalized) return null;
  const row = sqlite.prepare("SELECT * FROM customers WHERE phone = ?").get(normalized);
  return mapCustomerRow(row);
}

async function getCustomerByPhonePostgres(phone) {
  const normalized = normalizeIranPhone(phone);
  if (!normalized) return null;
  const { rows } = await pgPool.query("SELECT * FROM customers WHERE phone = $1", [normalized]);
  return mapCustomerRow(rows[0]);
}

function upsertCustomerSqlite(payload) {
  const phone = normalizeIranPhone(payload.phone);
  if (!phone) throw new Error("شماره موبایل نامعتبر است");

  const name = String(payload.name || "").trim().slice(0, 80);
  const birthMonth = payload.birthMonth != null ? Number(payload.birthMonth) : null;
  const birthDay = payload.birthDay != null ? Number(payload.birthDay) : null;
  let birthJalali = String(payload.birthJalali || "").trim();

  if (!birthJalali && birthMonth && birthDay) {
    const year = payload.birthYear ? Number(payload.birthYear) : null;
    birthJalali = year
      ? `${year}/${String(birthMonth).padStart(2, "0")}/${String(birthDay).padStart(2, "0")}`
      : `${String(birthMonth).padStart(2, "0")}/${String(birthDay).padStart(2, "0")}`;
  }

  const now = new Date().toISOString();
  const existing = getCustomerByPhoneSqlite(phone);

  if (existing) {
    const nextName = name || existing.name;
    const nextBirth = birthJalali || existing.birthJalali;
    const nextMonth =
      Number.isFinite(birthMonth) && birthMonth > 0 ? birthMonth : existing.birthMonth;
    const nextDay =
      Number.isFinite(birthDay) && birthDay > 0 ? birthDay : existing.birthDay;
    sqlite
      .prepare(
        `UPDATE customers
         SET name = ?, birth_jalali = ?, birth_month = ?, birth_day = ?, updated_at = ?, last_seen_at = ?
         WHERE phone = ?`
      )
      .run(
        nextName || null,
        nextBirth || null,
        nextMonth || null,
        nextDay || null,
        now,
        now,
        phone
      );
    return getCustomerByPhoneSqlite(phone);
  }

  const customer = {
    id: "cus-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    phone,
    name,
    birthJalali,
    birthMonth: Number.isFinite(birthMonth) && birthMonth > 0 ? birthMonth : null,
    birthDay: Number.isFinite(birthDay) && birthDay > 0 ? birthDay : null,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  };
  sqlite
    .prepare(
      `INSERT INTO customers
       (id, phone, name, birth_jalali, birth_month, birth_day, created_at, updated_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      customer.id,
      customer.phone,
      customer.name || null,
      customer.birthJalali || null,
      customer.birthMonth,
      customer.birthDay,
      customer.createdAt,
      customer.updatedAt,
      customer.lastSeenAt
    );
  return getCustomerByPhoneSqlite(phone);
}

async function upsertCustomerPostgres(payload) {
  const phone = normalizeIranPhone(payload.phone);
  if (!phone) throw new Error("شماره موبایل نامعتبر است");

  const name = String(payload.name || "").trim().slice(0, 80);
  const birthMonth = payload.birthMonth != null ? Number(payload.birthMonth) : null;
  const birthDay = payload.birthDay != null ? Number(payload.birthDay) : null;
  let birthJalali = String(payload.birthJalali || "").trim();

  if (!birthJalali && birthMonth && birthDay) {
    const year = payload.birthYear ? Number(payload.birthYear) : null;
    birthJalali = year
      ? `${year}/${String(birthMonth).padStart(2, "0")}/${String(birthDay).padStart(2, "0")}`
      : `${String(birthMonth).padStart(2, "0")}/${String(birthDay).padStart(2, "0")}`;
  }

  const now = new Date().toISOString();
  const existing = await getCustomerByPhonePostgres(phone);

  if (existing) {
    const nextName = name || existing.name;
    const nextBirth = birthJalali || existing.birthJalali;
    const nextMonth =
      Number.isFinite(birthMonth) && birthMonth > 0 ? birthMonth : existing.birthMonth;
    const nextDay =
      Number.isFinite(birthDay) && birthDay > 0 ? birthDay : existing.birthDay;
    await pgPool.query(
      `UPDATE customers
       SET name = $1, birth_jalali = $2, birth_month = $3, birth_day = $4, updated_at = $5, last_seen_at = $6
       WHERE phone = $7`,
      [
        nextName || null,
        nextBirth || null,
        nextMonth || null,
        nextDay || null,
        now,
        now,
        phone,
      ]
    );
    return getCustomerByPhonePostgres(phone);
  }

  const customer = {
    id: "cus-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    phone,
    name,
    birthJalali,
    birthMonth: Number.isFinite(birthMonth) && birthMonth > 0 ? birthMonth : null,
    birthDay: Number.isFinite(birthDay) && birthDay > 0 ? birthDay : null,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  };
  await pgPool.query(
    `INSERT INTO customers
     (id, phone, name, birth_jalali, birth_month, birth_day, created_at, updated_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      customer.id,
      customer.phone,
      customer.name || null,
      customer.birthJalali || null,
      customer.birthMonth,
      customer.birthDay,
      customer.createdAt,
      customer.updatedAt,
      customer.lastSeenAt,
    ]
  );
  return getCustomerByPhonePostgres(phone);
}

function listCustomersSqlite() {
  const rows = sqlite
    .prepare("SELECT * FROM customers ORDER BY last_seen_at DESC")
    .all()
    .map(mapCustomerRow);

  return rows.map((c) => {
    const feedbackCount = sqlite
      .prepare("SELECT COUNT(*) AS c FROM feedback WHERE phone = ?")
      .get(c.phone).c;
    const orderCount = sqlite
      .prepare("SELECT COUNT(*) AS c FROM orders WHERE customer_phone = ?")
      .get(c.phone).c;
    return { ...c, feedbackCount, orderCount };
  });
}

async function listCustomersPostgres() {
  const { rows } = await pgPool.query("SELECT * FROM customers ORDER BY last_seen_at DESC");
  const customers = rows.map(mapCustomerRow);
  const result = [];
  for (const c of customers) {
    const fb = await pgPool.query(
      "SELECT COUNT(*)::int AS c FROM feedback WHERE phone = $1",
      [c.phone]
    );
    const ord = await pgPool.query(
      "SELECT COUNT(*)::int AS c FROM orders WHERE customer_phone = $1",
      [c.phone]
    );
    result.push({
      ...c,
      feedbackCount: fb.rows[0].c,
      orderCount: ord.rows[0].c,
    });
  }
  return result;
}

function getCustomerDetailSqlite(phone) {
  const customer = getCustomerByPhoneSqlite(phone);
  if (!customer) return null;
  const feedback = sqlite
    .prepare(
      "SELECT id, name, message, created_at AS createdAt FROM feedback WHERE phone = ? ORDER BY created_at DESC"
    )
    .all(customer.phone);
  const orders = sqlite
    .prepare(
      "SELECT id, tracking_code, table_number, note, items_json, total, created_at, status, customer_phone FROM orders WHERE customer_phone = ? ORDER BY created_at DESC"
    )
    .all(customer.phone)
    .map(rowToOrder);
  return { customer, feedback, orders };
}

async function getCustomerDetailPostgres(phone) {
  const customer = await getCustomerByPhonePostgres(phone);
  if (!customer) return null;
  const fb = await pgPool.query(
    `SELECT id, name, message, created_at AS "createdAt"
     FROM feedback WHERE phone = $1 ORDER BY created_at DESC`,
    [customer.phone]
  );
  const ord = await pgPool.query(
    `SELECT id, tracking_code AS "trackingCode", table_number AS "tableNumber", note,
            items_json AS "itemsJson", total, created_at AS "createdAt", status,
            customer_phone AS "customerPhone"
     FROM orders WHERE customer_phone = $1 ORDER BY created_at DESC`,
    [customer.phone]
  );
  return {
    customer,
    feedback: fb.rows,
    orders: ord.rows.map(rowToOrder),
  };
}

async function lookupCustomer(phone) {
  if (mode === "postgres") return getCustomerByPhonePostgres(phone);
  return getCustomerByPhoneSqlite(phone);
}

async function upsertCustomer(payload) {
  if (mode === "postgres") return upsertCustomerPostgres(payload);
  return upsertCustomerSqlite(payload);
}

async function listCustomers() {
  if (mode === "postgres") return listCustomersPostgres();
  return listCustomersSqlite();
}

async function getCustomerDetail(phone) {
  if (mode === "postgres") return getCustomerDetailPostgres(phone);
  return getCustomerDetailSqlite(phone);
}

function getDbMode() {
  return mode;
}

module.exports = {
  initMenuDb,
  readMenu,
  writeMenu,
  saveSticker,
  listDbStickerFiles,
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
};
