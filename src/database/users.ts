import db from "./db";

export function saveUser(
    telegramId: number,
    username: string,
    name: string,
    games: string,
    ranks: string,
    age: string,
    gender: string,
    about: string
)

{


    console.log("PARAMS COUNT = 8");
    console.log([
        telegramId,
        username,
        name,
        games,
        ranks,
        age,
        gender,
        about
    ]);

    db.prepare(`
    INSERT OR REPLACE INTO users
(
    telegram_id,
    username,
    name,
    games,
    ranks,
    age,
    gender,
    about
)
           
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
    telegramId,
    username,
    name,
    games,
    ranks,
    age,
    gender,
    about
);
}

export function getUser(
    telegramId: number
) {
    return db.prepare(`
        SELECT *
        FROM users
        WHERE telegram_id = ?
    `).get(telegramId);
}

export function getAllUsers() {
    return db.prepare(`
        SELECT *
        FROM users
    `).all();
}



export function updateField(
    telegramId: number,
    field: string,
    value: string
) {
    db.prepare(`
        UPDATE users
        SET ${field} = ?
        WHERE telegram_id = ?
    `).run(
        value,
        telegramId
    );
}