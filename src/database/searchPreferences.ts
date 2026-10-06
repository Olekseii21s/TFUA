import db from "./db";

export function saveSearchPreferences(
    telegramId: number,
    games: string[],
    gender: string,
    minAge: number,
    maxAge: number,
    rankFilters: Record<string, string> = {}
) {
    db.prepare(`
        INSERT OR REPLACE INTO search_preferences
        (telegram_id, games, gender, min_age, max_age, rank_filters)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        telegramId,
        games.join(", "),
        gender,
        minAge,
        maxAge,
        JSON.stringify(rankFilters)
    );
}

export function getSearchPreferences(
    telegramId: number
) {
    return db.prepare(`
        SELECT *
        FROM search_preferences
        WHERE telegram_id = ?
    `).get(telegramId) as any;
}

export function deleteSearchPreferences(
    telegramId: number
) {
    db.prepare(`
        DELETE FROM search_preferences
        WHERE telegram_id = ?
    `).run(telegramId);
}
