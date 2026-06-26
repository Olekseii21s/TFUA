import db from "./db";

export function saveGames(
    telegramId: number,
    games: string[]
) {

    db.prepare(`
        DELETE FROM user_games
        WHERE telegram_id = ?
    `).run(telegramId);

    const stmt = db.prepare(`
        INSERT INTO user_games
        (telegram_id, game)
        VALUES (?, ?)
    `);

    for (const game of games) {
        stmt.run(
            telegramId,
            game
        );
    }
}

export function getGames(
    telegramId: number
) {

    return db.prepare(`
        SELECT game
        FROM user_games
        WHERE telegram_id = ?
    `).all(telegramId);
}