import db from "./db";

export function addLike(
    fromUser: number,
    toUser: number
) {
    db.prepare(`
        INSERT INTO likes
            (from_user, to_user)
        VALUES (?, ?)
    `).run(
        fromUser,
        toUser
    );
}

export function hasLikedBack(
    fromUser: number,
    toUser: number
) {
    return db.prepare(`
        SELECT *
        FROM likes
        WHERE from_user = ?
          AND to_user = ?
    `).get(
        fromUser,
        toUser
    );
}