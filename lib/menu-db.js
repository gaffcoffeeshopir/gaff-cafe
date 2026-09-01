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
  `);

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
  `);

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
  const order = {
    id: "ord-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    trackingCode: nextTrackingCodeSqlite(),
    tableNumber: String(payload.tableNumber || "").trim(),
    note: String(payload.note || "").trim(),
    items,
    total,
    createdAt: new Date().toISOString(),
    status: "open",
  };
  sqlite
    .prepare(
      `INSERT INTO orders (id, tracking_code, table_number, note, items_json, total, created_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      order.id,
      order.trackingCode,
      order.tableNumber,
      order.note || null,
      JSON.stringify(items),
      order.total,
      order.createdAt,
      order.status
    );
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
  const order = {
    id: "ord-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    trackingCode: await nextTrackingCodePostgres(),
    tableNumber: String(payload.tableNumber || "").trim(),
    note: String(payload.note || "").trim(),
    items,
    total,
    createdAt: new Date().toISOString(),
    status: "open",
  };
  await pgPool.query(
    `INSERT INTO orders (id, tracking_code, table_number, note, items_json, total, created_at, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      order.id,
      order.trackingCode,
      order.tableNumber,
      order.note || null,
      JSON.stringify(items),
      order.total,
      order.createdAt,
      order.status,
    ]
  );
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
  let grandTotal = 0;

  for (const order of orders) {
    for (const item of order.items || []) {
      const qty = item.quantity || 1;
      const unit = Math.round(Number(item.unitPrice || item.price || 0));
      const lineTotal = unit * qty;
      grandTotal += lineTotal;
      const opt = item.optionLabel ? ` (${item.optionLabel})` : "";
      const qtyLabel = qty > 1 ? ` × ${new Intl.NumberFormat("fa-IR").format(qty)}` : "";
      lines.push(`• ${item.name}${opt}${qtyLabel} — ${formatPriceFa(lineTotal)}`);
    }
  }

  const sep = "━━━━━━━━━━━━";
  return (
    `📋 فیش پایان شیفت — کافه گاف\n` +
    `${sep}\n` +
    `${lines.join("\n")}\n` +
    `${sep}\n` +
    `💰 جمع کل: ${formatPriceFa(grandTotal)}\n` +
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
  getPersistenceInfo,
  isPersistentStorage,
  getDbMode,
};
