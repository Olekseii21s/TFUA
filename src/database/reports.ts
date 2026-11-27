import db from "./db";

export function hasReported(reporterId: number, targetId: number): boolean {
    return !!db.prepare(`
        SELECT 1 FROM reports WHERE reporter_id = ? AND target_id = ?
    `).get(reporterId, targetId);
}

export function addReport(reporterId: number, targetId: number, reason: string): void {
    db.prepare(`
        INSERT OR IGNORE INTO reports (reporter_id, target_id, reason, created_at)
        VALUES (?, ?, ?, ?)
    `).run(reporterId, targetId, reason, Date.now());
}

/** На кого користувач уже скаржився — таких більше ніколи не показуємо йому в пошуку. */
export function getReportedTargetIds(reporterId: number): number[] {
    const rows = db.prepare(`
        SELECT target_id FROM reports WHERE reporter_id = ?
    `).all(reporterId) as { target_id: number }[];

    return rows.map((row) => row.target_id);
}
