import db from "./db";

/** Збережений стан користувача (діалог, видача пошуку) — переживає перезапуск бота. */
export function loadSession<T>(telegramId: number, kind: string): T | undefined {
    const row = db.prepare(`
        SELECT data FROM sessions WHERE telegram_id = ? AND kind = ?
    `).get(telegramId, kind) as { data: string } | undefined;

    if (!row) return undefined;

    try {
        return JSON.parse(row.data) as T;
    } catch {
        return undefined;
    }
}

export function saveSession(telegramId: number, kind: string, data: unknown): void {
    db.prepare(`
        INSERT INTO sessions (telegram_id, kind, data, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (telegram_id, kind) DO UPDATE SET
            data = excluded.data,
            updated_at = excluded.updated_at
    `).run(telegramId, kind, JSON.stringify(data), Date.now());
}

export function deleteSession(telegramId: number, kind: string): void {
    db.prepare(`DELETE FROM sessions WHERE telegram_id = ? AND kind = ?`).run(telegramId, kind);
}

export function deleteAllSessions(telegramId: number): void {
    db.prepare(`DELETE FROM sessions WHERE telegram_id = ?`).run(telegramId);
}

/** Видаляє незавершені діалоги, до яких давно не поверталися. */
export function purgeOldSessions(olderThanMs: number): number {
    return db.prepare(`DELETE FROM sessions WHERE updated_at < ?`).run(Date.now() - olderThanMs).changes;
}
