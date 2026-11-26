import db from "./db";

/** Повністю видаляє анкету та всі пов'язані з нею дані однією транзакцією. */
export const deleteUser = db.transaction((telegramId: number) => {

    db.prepare(`DELETE FROM users WHERE telegram_id = ?`).run(telegramId);

    db.prepare(`DELETE FROM user_games WHERE telegram_id = ?`).run(telegramId);

    db.prepare(`DELETE FROM search_preferences WHERE telegram_id = ?`).run(telegramId);

    db.prepare(`DELETE FROM user_sources WHERE telegram_id = ?`).run(telegramId);

    db.prepare(`
        DELETE FROM requests
        WHERE from_user = ? OR to_user = ?
    `).run(telegramId, telegramId);

    db.prepare(`DELETE FROM sessions WHERE telegram_id = ?`).run(telegramId);

    db.prepare(`DELETE FROM notification_settings WHERE telegram_id = ?`).run(telegramId);

    db.prepare(`
        DELETE FROM reports
        WHERE reporter_id = ? OR target_id = ?
    `).run(telegramId, telegramId);

    db.prepare(`
        DELETE FROM likes
        WHERE from_user = ? OR to_user = ?
    `).run(telegramId, telegramId);

    db.prepare(`
        DELETE FROM matches
        WHERE user1 = ? OR user2 = ?
    `).run(telegramId, telegramId);

    db.prepare(`
        DELETE FROM hidden_profiles
        WHERE user_id = ? OR hidden_user_id = ?
    `).run(telegramId, telegramId);

});
