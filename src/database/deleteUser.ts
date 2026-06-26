import db from "./db";

export function deleteUser(
    telegramId: number
) {

    db.prepare(`
        DELETE FROM users
        WHERE telegram_id = ?
    `).run(telegramId);

    db.prepare(`
        DELETE FROM user_games
        WHERE telegram_id = ?
    `).run(telegramId);

    db.prepare(`
        DELETE FROM requests
        WHERE from_user = ?
           OR to_user = ?
    `).run(
        telegramId,
        telegramId
    );

    db.prepare(`
        DELETE FROM matches
        WHERE user1 = ?
           OR user2 = ?
    `).run(
        telegramId,
        telegramId
    );

    db.prepare(`
        DELETE FROM hidden_profiles
        WHERE user_id = ?
           OR hidden_user_id = ?
    `).run(
        telegramId,
        telegramId
    );

}