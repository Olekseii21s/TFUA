import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";

test("нова схема накочується на базу старої версії без втрати даних", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tfua-migration-"));
    const file = path.join(dir, "old.db");

    // База як у першій версії бота (з колонкою ranks і без нових таблиць).
    const old = new Database(file);
    old.exec(`
        CREATE TABLE users (telegram_id INTEGER PRIMARY KEY, username TEXT, name TEXT NOT NULL,
                            games TEXT NOT NULL, ranks TEXT, about TEXT NOT NULL);
        INSERT INTO users VALUES (1, 'old', 'Old User', 'CS2', '5 lvl', 'hi');
        CREATE TABLE hidden_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, hidden_user_id INTEGER NOT NULL);
        INSERT INTO hidden_profiles (user_id, hidden_user_id) VALUES (1, 2), (1, 2);
    `);
    old.close();

    process.env.DB_PATH = file;

    const log = console.log;
    console.log = () => undefined;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const db = require("../src/database/db").default as Database.Database;
    console.log = log;

    assert.equal(db.pragma("user_version", { simple: true }), 5);

    const userRow = db.prepare("SELECT name, legacy_ranks, age FROM users WHERE telegram_id = 1").get();
    assert.deepEqual({ ...(userRow as object) }, { name: "Old User", legacy_ranks: "5 lvl", age: null });

    const hidden = db.prepare("SELECT COUNT(*) AS c FROM hidden_profiles").get() as { c: number };
    assert.equal(hidden.c, 1, "дублікати прихованих анкет прибрано");

    // Наявні анкети отримали «стартову» активність, щоб не зникнути з пошуку одразу після оновлення.
    const activity = db.prepare("SELECT last_active_at, blocked_bot FROM users WHERE telegram_id = 1").get() as {
        last_active_at: number | null;
        blocked_bot: number;
    };
    assert.ok(activity.last_active_at && activity.last_active_at > Date.now() - 60_000);
    assert.equal(activity.blocked_bot, 0);

    // Анкета не на паузі, старі запити отримали дату (повні 7 днів до згорання).
    const pausedRow = db.prepare("SELECT paused FROM users WHERE telegram_id = 1").get() as { paused: number };
    assert.equal(pausedRow.paused, 0);

    const requestColumns = (db.prepare("PRAGMA table_info(requests)").all() as { name: string }[]).map((c) => c.name);
    assert.ok(requestColumns.includes("created_at"));

    for (const table of ["sessions", "reports", "notification_settings", "user_sources", "hidden_teammates", "search_preferences", "matches", "requests"]) {
        assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = ?").get(table), `таблиця ${table}`);
    }

    // Повторний запуск міграцій нічого не ламає.
    assert.equal(db.pragma("user_version", { simple: true }), 5);

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
});
