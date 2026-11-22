import db from "./db";

export function createMatch(
    user1: number,
    user2: number
) {
    db.prepare(`
        INSERT INTO matches (user1, user2)
        VALUES (?, ?)
    `).run(user1, user2);
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

export function countMatches(): number {
    return (db.prepare(`SELECT COUNT(*) AS c FROM matches`).get() as { c: number }).c;
}
