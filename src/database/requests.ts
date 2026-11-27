import db from "./db";

/**
 * pending — чекає відповіді; accepted / rejected — отримувач відповів;
 * expired — згорів без відповіді; cancelled — відправник скасував.
 */
export type RequestStatus = "pending" | "accepted" | "rejected" | "expired" | "cancelled";

export interface RequestRecord {
    id: number;
    from_user: number;
    to_user: number;
    status: RequestStatus;
    created_at: number | null;
}

export function createRequest(
    fromUser: number,
    toUser: number,
    now = Date.now()
) {
    db.prepare(`
        INSERT INTO requests (from_user, to_user, status, created_at)
        VALUES (?, ?, 'pending', ?)
    `).run(fromUser, toUser, now);
}

/** Вхідні запити, що чекають відповіді (нові — першими). */
export function getRequests(
    toUser: number
) {
    return db.prepare(`
        SELECT *
        FROM requests
        WHERE to_user = ?
          AND status = 'pending'
        ORDER BY id DESC
    `).all(toUser) as RequestRecord[];
}

/** Надіслані запрошення, що ще чекають відповіді (нові — першими). */
export function getSentPendingRequests(
    fromUser: number,
    limit = 20
) {
    return db.prepare(`
        SELECT *
        FROM requests
        WHERE from_user = ?
          AND status = 'pending'
        ORDER BY id DESC
        LIMIT ?
    `).all(fromUser, limit) as RequestRecord[];
}

export function countSentPendingRequests(fromUser: number): number {
    return (db.prepare(`
        SELECT COUNT(*) AS c FROM requests WHERE from_user = ? AND status = 'pending'
    `).get(fromUser) as { c: number }).c;
}

export function getRequestBetween(
    user1: number,
    user2: number
) {
    return db.prepare(`
        SELECT *
        FROM requests
        WHERE (
            from_user = ? AND to_user = ?
        )
        OR (
            from_user = ? AND to_user = ?
        )
        ORDER BY id DESC
        LIMIT 1
    `).get(user1, user2, user2, user1) as RequestRecord | undefined;
}

export function updateRequestStatus(
    requestId: number,
    status: RequestStatus
) {
    db.prepare(`
        UPDATE requests
        SET status = ?
        WHERE id = ?
    `).run(status, requestId);
}

export function getPendingRequest(
    fromUser: number,
    toUser: number
) {
    return db.prepare(`
        SELECT *
        FROM requests
        WHERE from_user = ?
          AND to_user = ?
          AND status = 'pending'
        LIMIT 1
    `).get(fromUser, toUser) as RequestRecord | undefined;
}

/**
 * Скасувати своє запрошення. Спрацьовує лише для власного запиту, що ще чекає відповіді.
 * Повертає скасований запит або undefined.
 */
export function cancelRequest(
    requestId: number,
    fromUser: number
): RequestRecord | undefined {
    return db.prepare(`
        UPDATE requests
        SET status = 'cancelled'
        WHERE id = ?
          AND from_user = ?
          AND status = 'pending'
        RETURNING *
    `).get(requestId, fromUser) as RequestRecord | undefined;
}

/** Позначає як «згорілі» запити без відповіді, створені раніше за cutoff. Повертає їх. */
export function expirePendingRequests(cutoffMs: number): RequestRecord[] {
    return db.prepare(`
        UPDATE requests
        SET status = 'expired'
        WHERE status = 'pending'
          AND COALESCE(created_at, 0) < ?
        RETURNING *
    `).all(cutoffMs) as RequestRecord[];
}

/**
 * ID тих, з ким у користувача вже була «справжня» взаємодія: запит чекає відповіді,
 * прийнятий або відхилений. Згорілі й скасовані запити сюди не входять — такі гравці
 * можуть знову зустрітися в пошуку (після короткої паузи, див. hideProfile).
 */
export function getInteractedUserIds(
    userId: number
): number[] {
    const rows = db.prepare(`
        SELECT to_user AS other FROM requests
        WHERE from_user = ? AND status IN ('pending', 'accepted', 'rejected')
        UNION
        SELECT from_user AS other FROM requests
        WHERE to_user = ? AND status IN ('pending', 'accepted', 'rejected')
    `).all(userId, userId) as { other: number }[];

    return rows.map((row) => row.other);
}

export function countPendingRequests(): number {
    return (db.prepare(`SELECT COUNT(*) AS c FROM requests WHERE status = 'pending'`).get() as { c: number }).c;
}
