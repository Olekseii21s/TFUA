import db from "./db";

export type RequestStatus = "pending" | "accepted" | "rejected";

export interface RequestRecord {
    id: number;
    from_user: number;
    to_user: number;
    status: RequestStatus;
}

export function createRequest(
    fromUser: number,
    toUser: number
) {
    db.prepare(`
        INSERT INTO requests (
            from_user,
            to_user,
            status
        )
        VALUES (?, ?, 'pending')
    `).run(fromUser, toUser);
}

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

/** ID усіх, з ким у користувача вже був запит у будь-який бік і з будь-яким статусом. */
export function getInteractedUserIds(
    userId: number
): number[] {
    const rows = db.prepare(`
        SELECT to_user AS other FROM requests WHERE from_user = ?
        UNION
        SELECT from_user AS other FROM requests WHERE to_user = ?
    `).all(userId, userId) as { other: number }[];

    return rows.map((row) => row.other);
}
