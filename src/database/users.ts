import db from "./db";

export interface UserRecord {
    telegram_id: number;
    username: string | null;
    name: string;
    games: string;
    age: string | null;
    gender: string | null;
    about: string;
    /** Коли гравець востаннє щось робив у боті (мс). */
    last_active_at: number | null;
    /** 1 — Telegram відповів, що гравець заблокував бота. */
    blocked_bot: number;
    created_at: number | null;
}

export type EditableUserField = "name" | "games" | "age" | "gender" | "about";

const editableColumns: Record<EditableUserField, string> = {
    name: "name",
    games: "games",
    age: "age",
    gender: "gender",
    about: "about"
};

const COLUMNS = "telegram_id, username, name, games, age, gender, about, last_active_at, blocked_bot, created_at";

const saveUserStatement = db.prepare(`
    INSERT INTO users
        (telegram_id, username, name, games, age, gender, about, last_active_at, blocked_bot, created_at)
    VALUES
        (@telegramId, @username, @name, @games, @age, @gender, @about, @now, 0, @now)
    ON CONFLICT(telegram_id) DO UPDATE SET
        username = excluded.username,
        name = excluded.name,
        games = excluded.games,
        age = excluded.age,
        gender = excluded.gender,
        about = excluded.about,
        last_active_at = excluded.last_active_at,
        blocked_bot = 0
`);

export function saveUser(
    telegramId: number,
    username: string,
    name: string,
    games: string,
    age: string,
    gender: string,
    about: string
): void {
    saveUserStatement.run({ telegramId, username, name, games, age, gender, about, now: Date.now() });
}

const getUserStatement = db.prepare(`SELECT ${COLUMNS} FROM users WHERE telegram_id = ?`);

export function getUser(telegramId: number): UserRecord | undefined {
    return getUserStatement.get(telegramId) as UserRecord | undefined;
}

const getAllUsersStatement = db.prepare(`SELECT ${COLUMNS} FROM users`);

export function getAllUsers(): UserRecord[] {
    return getAllUsersStatement.all() as UserRecord[];
}

export function updateField(
    telegramId: number,
    field: EditableUserField,
    value: string
): void {
    if (!Object.prototype.hasOwnProperty.call(editableColumns, field)) {
        throw new Error(`Unsupported user field: ${String(field)}`);
    }

    db.prepare(`
        UPDATE users
        SET ${editableColumns[field]} = ?
        WHERE telegram_id = ?
    `).run(value, telegramId);
}

const touchStatement = db.prepare(`
    UPDATE users
    SET username = ?, last_active_at = ?, blocked_bot = 0
    WHERE telegram_id = ?
`);

/**
 * Гравець щось зробив у боті: оновлюємо username (його могли змінити в Telegram),
 * час активності і знімаємо позначку «заблокував бота».
 */
export function touchUser(telegramId: number, username: string | undefined, now = Date.now()): void {
    touchStatement.run(username || "", now, telegramId);
}

/**
 * Позначка «заблокував бота»: ставиться, коли Telegram відповів 403 або надіслав
 * службове оновлення про блокування; знімається при розблокуванні чи будь-якій дії гравця.
 */
export function setBlockedBot(telegramId: number, blocked: boolean): void {
    db.prepare(`UPDATE users SET blocked_bot = ? WHERE telegram_id = ?`).run(blocked ? 1 : 0, telegramId);
}

/** Telegram відповів 403 — гравець заблокував бота, у пошуку його більше не показуємо. */
export function markBlockedBot(telegramId: number): void {
    setBlockedBot(telegramId, true);
}

export interface UserStats {
    total: number;
    newLastDay: number;
    newLastWeek: number;
    activeLastDay: number;
    activeLastWeek: number;
    blockedBot: number;
}

export function getUserStats(now = Date.now()): UserStats {
    const day = now - 24 * 60 * 60 * 1000;
    const week = now - 7 * 24 * 60 * 60 * 1000;

    return db.prepare(`
        SELECT
            COUNT(*) AS total,
            COALESCE(SUM(created_at >= @day), 0) AS newLastDay,
            COALESCE(SUM(created_at >= @week), 0) AS newLastWeek,
            COALESCE(SUM(last_active_at >= @day), 0) AS activeLastDay,
            COALESCE(SUM(last_active_at >= @week), 0) AS activeLastWeek,
            COALESCE(SUM(blocked_bot = 1), 0) AS blockedBot
        FROM users
    `).get({ day, week }) as UserStats;
}
