import db from "./db";

/** Звідки людина вперше прийшла в бота: мітка з посилання t.me/<бот>?start=<мітка> або "direct". */
export function recordSource(telegramId: number, source: string, now = Date.now()): void {
    // INSERT OR IGNORE — зберігається саме ПЕРШЕ джерело, повторні /start його не перезаписують.
    db.prepare(`
        INSERT OR IGNORE INTO user_sources (telegram_id, source, first_seen_at)
        VALUES (?, ?, ?)
    `).run(telegramId, source, now);
}

export interface SourceStats {
    source: string;
    visitors: number;
    profiles: number;
}

/** Скільки людей прийшло з кожного джерела і скільки з них створили анкету. */
export function getSourceStats(sinceMs: number): SourceStats[] {
    return db.prepare(`
        SELECT
            s.source AS source,
            COUNT(*) AS visitors,
            COUNT(u.telegram_id) AS profiles
        FROM user_sources s
        LEFT JOIN users u ON u.telegram_id = s.telegram_id
        WHERE s.first_seen_at >= ?
        GROUP BY s.source
        ORDER BY visitors DESC
        LIMIT 20
    `).all(sinceMs) as SourceStats[];
}
