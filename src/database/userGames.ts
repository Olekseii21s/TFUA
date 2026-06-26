import db from "./db";

export function addUserGame(
    telegramId: number,
    game: string,
    rank: string
) {
    db.prepare(`
        INSERT INTO user_games
        (telegram_id, game, rank)
        VALUES (?, ?, ?)
    `).run(
        telegramId,
        game,
        rank
    );
}

export function getUserGames(
    telegramId: number
) {
    return db.prepare(`
        SELECT *
        FROM user_games
        WHERE telegram_id = ?
    `).all(telegramId);
}

export function deleteUserGames(
    telegramId: number
) {
    db.prepare(`
        DELETE FROM user_games
        WHERE telegram_id = ?
    `).run(telegramId);
}