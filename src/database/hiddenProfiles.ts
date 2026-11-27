import db from "./db";

/** Ховає анкету з пошуку користувача (кнопка «Пропустити»). Повторний виклик оновлює час. */
export function hideProfile(
    userId: number,
    hiddenUserId: number,
    now = Date.now()
) {
    const updated = db.prepare(`
        UPDATE hidden_profiles
        SET created_at = ?
        WHERE user_id = ?
          AND hidden_user_id = ?
    `).run(now, userId, hiddenUserId);

    if (updated.changes === 0) {
        db.prepare(`
            INSERT INTO hidden_profiles
            (user_id, hidden_user_id, created_at)
            VALUES (?, ?, ?)
        `).run(userId, hiddenUserId, now);
    }
}

/** ID анкет, які користувач пропустив після вказаного моменту (мс). */
export function getRecentlyHiddenIds(
    userId: number,
    sinceMs: number
): number[] {
    const rows = db.prepare(`
        SELECT hidden_user_id
        FROM hidden_profiles
        WHERE user_id = ?
          AND COALESCE(created_at, 0) >= ?
    `).all(userId, sinceMs) as { hidden_user_id: number }[];

    return rows.map((row) => row.hidden_user_id);
}
