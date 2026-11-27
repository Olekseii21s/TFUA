import db from "./db";

export function createMatch(
    user1: number,
    user2: number
) {
    db.prepare(`
        INSERT INTO matches (user1, user2, created_at)
        VALUES (?, ?, ?)
    `).run(user1, user2, Date.now());
}

export function hasMatch(
    user1: number,
    user2: number
) {
    return db.prepare(`
        SELECT *
        FROM matches
        WHERE (user1 = ? AND user2 = ?)
           OR (user1 = ? AND user2 = ?)
    `).get(user1, user2, user2, user1);
}

/** ID усіх, з ким у користувача є матч (нові — першими). */
export function getMatchedUserIds(
    userId: number
): number[] {
    const rows = db.prepare(`
        SELECT CASE WHEN user1 = ? THEN user2 ELSE user1 END AS other
        FROM matches
        WHERE user1 = ? OR user2 = ?
        ORDER BY id DESC
    `).all(userId, userId, userId) as { other: number }[];

    return [...new Set(rows.map((row) => row.other))];
}

export function countMatches(sinceMs = 0): number {
    return (db.prepare(`
        SELECT COUNT(*) AS c FROM matches WHERE COALESCE(created_at, 0) >= ?
    `).get(sinceMs) as { c: number }).c;
}

/** Прибрати тімейта зі СВОГО списку (односторонньо: у нього ви залишаєтесь). */
export function hideTeammate(userId: number, teammateId: number, now = Date.now()): void {
    db.prepare(`
        INSERT OR IGNORE INTO hidden_teammates (user_id, teammate_id, created_at)
        VALUES (?, ?, ?)
    `).run(userId, teammateId, now);
}

/**
 * Тімейти для списку «🤝 Мої тімейти»: усі матчі, крім прибраних користувачем.
 * Для пошуку використовується getMatchedUserIds — прибрані тімейти там теж не показуються.
 */
export function getVisibleTeammateIds(userId: number): number[] {
    const hidden = new Set((db.prepare(`
        SELECT teammate_id FROM hidden_teammates WHERE user_id = ?
    `).all(userId) as { teammate_id: number }[]).map((row) => row.teammate_id));

    return getMatchedUserIds(userId).filter((id) => !hidden.has(id));
}
