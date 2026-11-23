import db from "./db";

/** Чи хоче користувач отримувати сповіщення про нових гравців (за замовчуванням — так). */
export function isNotifyEnabled(telegramId: number): boolean {
    const row = db.prepare(`
        SELECT enabled FROM notification_settings WHERE telegram_id = ?
    `).get(telegramId) as { enabled: number } | undefined;

    return row ? row.enabled === 1 : true;
}

export function setNotifyEnabled(telegramId: number, enabled: boolean): void {
    db.prepare(`
        INSERT INTO notification_settings (telegram_id, enabled)
        VALUES (?, ?)
        ON CONFLICT (telegram_id) DO UPDATE SET enabled = excluded.enabled
    `).run(telegramId, enabled ? 1 : 0);
}

export function getLastNotifiedAt(telegramId: number): number {
    const row = db.prepare(`
        SELECT last_notified_at FROM notification_settings WHERE telegram_id = ?
    `).get(telegramId) as { last_notified_at: number | null } | undefined;

    return row?.last_notified_at ?? 0;
}

export function markNotified(telegramId: number, at = Date.now()): void {
    db.prepare(`
        INSERT INTO notification_settings (telegram_id, last_notified_at)
        VALUES (?, ?)
        ON CONFLICT (telegram_id) DO UPDATE SET last_notified_at = excluded.last_notified_at
    `).run(telegramId, at);
}
