import db from "./db";

export interface UserGameRecord {
    id: number;
    telegram_id: number;
    game: string;
    rank: string;
}

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
): UserGameRecord[] {
    return db.prepare(`
        SELECT *
        FROM user_games
        WHERE telegram_id = ?
        ORDER BY id
    `).all(telegramId) as UserGameRecord[];
}

/** Усі ігри всіх користувачів одним запитом — для пошуку. */
export function getAllUserGames(): Map<number, UserGameRecord[]> {
    const rows = db.prepare(`
        SELECT *
        FROM user_games
        ORDER BY id
    `).all() as UserGameRecord[];

    const byUser = new Map<number, UserGameRecord[]>();

    for (const row of rows) {
        const list = byUser.get(row.telegram_id) || [];
        list.push(row);
        byUser.set(row.telegram_id, list);
    }

    return byUser;
}

export function deleteUserGames(
    telegramId: number
) {
    db.prepare(`
        DELETE FROM user_games
        WHERE telegram_id = ?
    `).run(telegramId);
}

/** Замінює ігри користувача атомарно. */
export const replaceUserGames = db.transaction(
    (telegramId: number, ranks: Record<string, string>) => {
        deleteUserGames(telegramId);

        for (const [game, rank] of Object.entries(ranks)) {
            addUserGame(telegramId, game, rank);
        }
    }
);
