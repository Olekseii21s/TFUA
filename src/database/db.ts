import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// На сервері DB_PATH має вказувати на постійний диск (наприклад /data/database.db),
// інакше база зникає при кожному деплої або перезапуску контейнера.
const dbPath = process.env.DB_PATH?.trim() || "database.db";

fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

console.log(`🗄 База даних: ${path.resolve(dbPath)}`);


try {
    db.exec(`
        ALTER TABLE users
        ADD COLUMN age TEXT
    `);
} catch {}


db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        telegram_id INTEGER PRIMARY KEY,
        username TEXT,
        name TEXT NOT NULL,
        games TEXT NOT NULL,
        age TEXT,
        gender TEXT,
        about TEXT NOT NULL
    )
`);

// Rank data is stored per game in user_games; archive the old duplicate column without losing its data.
try {
    db.exec(`ALTER TABLE users RENAME COLUMN ranks TO legacy_ranks`);
} catch {}

db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_user INTEGER NOT NULL,
        to_user INTEGER NOT NULL,
        status TEXT DEFAULT 'pending'
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_user INTEGER NOT NULL,
        to_user INTEGER NOT NULL
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS user_games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER NOT NULL,
        game TEXT NOT NULL,
        rank TEXT NOT NULL
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS hidden_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        hidden_user_id INTEGER NOT NULL
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user1 INTEGER NOT NULL,
        user2 INTEGER NOT NULL
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS bans (
        telegram_id INTEGER PRIMARY KEY,
        reason TEXT
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS search_preferences (
        telegram_id INTEGER PRIMARY KEY,
        games TEXT NOT NULL,
        gender TEXT NOT NULL,
        min_age INTEGER NOT NULL,
        max_age INTEGER NOT NULL
    )
`);

try {
    db.exec(`ALTER TABLE search_preferences ADD COLUMN rank_filters TEXT`);
} catch {}

try {
    db.exec(`ALTER TABLE hidden_profiles ADD COLUMN created_at INTEGER`);
} catch {}

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_games_user ON user_games (telegram_id);
    CREATE INDEX IF NOT EXISTS idx_requests_from ON requests (from_user, to_user, status);
    CREATE INDEX IF NOT EXISTS idx_requests_to ON requests (to_user, status);
    CREATE INDEX IF NOT EXISTS idx_matches_user1 ON matches (user1);
    CREATE INDEX IF NOT EXISTS idx_matches_user2 ON matches (user2);
    CREATE INDEX IF NOT EXISTS idx_hidden_user ON hidden_profiles (user_id, hidden_user_id);
`);

export default db;
