import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// На сервері DB_PATH має вказувати на постійний диск (наприклад /data/database.db),
// інакше база зникає при кожному деплої або перезапуску контейнера.
// Для тестів можна вказати ":memory:".
const dbPath = process.env.DB_PATH?.trim() || "database.db";
const inMemory = dbPath === ":memory:";

/** Повний шлях до файлу бази (або ":memory:" у тестах). */
export const DB_FILE = inMemory ? ":memory:" : path.resolve(dbPath);

if (!inMemory) {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
}

const db = new Database(dbPath);

if (!inMemory) {
    db.pragma("journal_mode = WAL");
    console.log(`🗄 База даних: ${path.resolve(dbPath)}`);
}

db.pragma("busy_timeout = 5000");

type Migration = (database: Database.Database) => void;

/** Ігнорує помилку, якщо зміна вже застосована (колонка вже є тощо). */
function tryExec(database: Database.Database, sql: string) {
    try {
        database.exec(sql);
    } catch {
        // Уже застосовано.
    }
}

/**
 * Міграції схеми. Кожна виконується рівно один раз; номер останньої
 * застосованої зберігається в PRAGMA user_version.
 * НІКОЛИ не змінюйте вже існуючі міграції — лише додавайте нові в кінець.
 */
const migrations: Migration[] = [

    // 1 — схема, що була до етапу 3. Безпечно накочується і на стару базу.
    (database) => {
        database.exec(`
            CREATE TABLE IF NOT EXISTS users (
                telegram_id INTEGER PRIMARY KEY,
                username TEXT,
                name TEXT NOT NULL,
                games TEXT NOT NULL,
                age TEXT,
                gender TEXT,
                about TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_user INTEGER NOT NULL,
                to_user INTEGER NOT NULL,
                status TEXT DEFAULT 'pending'
            );

            CREATE TABLE IF NOT EXISTS likes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_user INTEGER NOT NULL,
                to_user INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS user_games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id INTEGER NOT NULL,
                game TEXT NOT NULL,
                rank TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS hidden_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                hidden_user_id INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS matches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user1 INTEGER NOT NULL,
                user2 INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS bans (
                telegram_id INTEGER PRIMARY KEY,
                reason TEXT
            );

            CREATE TABLE IF NOT EXISTS search_preferences (
                telegram_id INTEGER PRIMARY KEY,
                games TEXT NOT NULL,
                gender TEXT NOT NULL,
                min_age INTEGER NOT NULL,
                max_age INTEGER NOT NULL
            );
        `);

        // Колонки, додані в старих версіях бота.
        tryExec(database, `ALTER TABLE users ADD COLUMN age TEXT`);
        tryExec(database, `ALTER TABLE users RENAME COLUMN ranks TO legacy_ranks`);
        tryExec(database, `ALTER TABLE search_preferences ADD COLUMN rank_filters TEXT`);
        tryExec(database, `ALTER TABLE hidden_profiles ADD COLUMN created_at INTEGER`);

        database.exec(`
            CREATE INDEX IF NOT EXISTS idx_user_games_user ON user_games (telegram_id);
            CREATE INDEX IF NOT EXISTS idx_requests_from ON requests (from_user, to_user, status);
            CREATE INDEX IF NOT EXISTS idx_requests_to ON requests (to_user, status);
            CREATE INDEX IF NOT EXISTS idx_matches_user1 ON matches (user1);
            CREATE INDEX IF NOT EXISTS idx_matches_user2 ON matches (user2);
        `);
    },

    // 2 — збереження діалогів і видачі пошуку між перезапусками, скарги в базі.
    (database) => {
        database.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                telegram_id INTEGER NOT NULL,
                kind TEXT NOT NULL,
                data TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (telegram_id, kind)
            );

            CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reporter_id INTEGER NOT NULL,
                target_id INTEGER NOT NULL,
                reason TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_pair ON reports (reporter_id, target_id);

            -- Прибираємо дублікати прихованих анкет і забороняємо нові.
            DELETE FROM hidden_profiles
            WHERE id NOT IN (
                SELECT MAX(id) FROM hidden_profiles GROUP BY user_id, hidden_user_id
            );

            DROP INDEX IF EXISTS idx_hidden_user;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_hidden_pair ON hidden_profiles (user_id, hidden_user_id);
        `);
    }
];

function migrate(database: Database.Database) {
    const current = database.pragma("user_version", { simple: true }) as number;

    for (let version = current; version < migrations.length; version++) {
        database.transaction(() => {
            migrations[version](database);
            database.pragma(`user_version = ${version + 1}`);
        })();

        if (!inMemory) {
            console.log(`🗄 Міграцію бази ${version + 1} застосовано`);
        }
    }
}

migrate(db);

export default db;
