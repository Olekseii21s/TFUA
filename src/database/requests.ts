import db from "./db";

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
    `).all(toUser);
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
    `).get(user1, user2, user2, user1);
}

export function updateRequestStatus(
    requestId: number,
    status: string
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
    `).get(fromUser, toUser);
}

export function getIncomingPendingRequest(
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
    `).get(fromUser, toUser);
}