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
