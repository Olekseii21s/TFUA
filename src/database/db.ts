import Database from "better-sqlite3";

const db = new Database("database.db");


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
                                         ranks TEXT,
                                         age TEXT,
                                         gender TEXT,
                                         about TEXT NOT NULL
    )
`);

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

db.exec(` CREATE TABLE IF NOT EXISTS user_games (
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


export default db;