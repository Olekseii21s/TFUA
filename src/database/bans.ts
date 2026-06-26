import db from "./db";

export function banUser(
    telegramId: number,
    reason: string = ""
) {
    db.prepare(`
        INSERT OR REPLACE INTO bans
        (telegram_id, reason)
        VALUES (?, ?)
    `).run(
        telegramId,
        reason
    );
}

export function unbanUser(
    telegramId: number
) {
    db.prepare(`
        DELETE FROM bans
        WHERE telegram_id = ?
    `).run(telegramId);
}

export function isBanned(
    telegramId: number
) {
    return db.prepare(`
        SELECT *
        FROM bans
        WHERE telegram_id = ?
    `).get(telegramId);
}