const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Use DATA_DIR env var if set AND writable, otherwise fall back to local ./data
let DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch {
  DATA_DIR = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'blog.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initialize() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      content TEXT NOT NULL,
      excerpt TEXT,
      category TEXT NOT NULL DEFAULT 'update',
      featured_image TEXT,
      published INTEGER DEFAULT 0,
      author_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS post_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      caption TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      author_name TEXT NOT NULL,
      author_email TEXT,
      content TEXT NOT NULL,
      approved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prayer_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_name TEXT NOT NULL,
      content TEXT NOT NULL,
      response TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      token TEXT UNIQUE NOT NULL,
      confirmed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS post_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      caption TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed default stats
  const insertStat = db.prepare('INSERT OR IGNORE INTO stats (key, value) VALUES (?, ?)');
  insertStat.run('homes_completed', 0);
  insertStat.run('groups_hosted', 0);
  insertStat.run('families_served', 0);

  // Seed default settings
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('trip_start', '');
  insertSetting.run('trip_end', '');
  insertSetting.run('site_name', "Hannah's Blog");
  insertSetting.run('hero_color', '#fde047');
  insertSetting.run('footer_text', "Hannah's Guatemala Mission Blog");
  insertSetting.run('hero_title', 'Building Hope in Guatemala');
  insertSetting.run('hero_subtitle', "Follow Hannah's journey as she helps build homes and transform lives");
  insertSetting.run('about_content', `Hannah is spending 3 months in Guatemala on a mission trip, supervising and assisting in the building of homes for local families.

Each week, a different church group comes in to build a home for a local family. Hannah makes sure the homes are built correctly and on time, helping coordinate between the groups and the families they serve.

This mission is about more than building walls and roofs. It's about building relationships, sharing love, and making a lasting difference in the lives of Guatemalan families who need a safe place to call home.`);
}

initialize();

module.exports = { db, DATA_DIR, UPLOADS_DIR };
