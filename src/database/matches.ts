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