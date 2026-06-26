import db from "./db";

export function hideProfile(
    userId: number,
    hiddenUserId: number
) {
    const existing = db.prepare(`
        SELECT *
        FROM hidden_profiles
        WHERE user_id = ?
          AND hidden_user_id = ?
    `).get(userId, hiddenUserId);

    if (existing) {
        return;
    }

    db.prepare(`
        INSERT INTO hidden_profiles
        (user_id, hidden_user_id)
        VALUES (?, ?)
    `).run(userId, hiddenUserId);
}

export function isHidden(
    userId: number,
    hiddenUserId: number
) {
    return db.prepare(`
        SELECT *
        FROM hidden_profiles
        WHERE user_id = ?
          AND hidden_user_id = ?
    `).get(userId, hiddenUserId);
}