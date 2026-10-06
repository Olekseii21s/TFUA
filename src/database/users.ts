import db from "./db";

export interface UserRecord {
    telegram_id: number;
    username: string | null;
    name: string;
    games: string;
    age: string | null;
    gender: string | null;
    about: string;
}

export type EditableUserField = "name" | "games" | "age" | "gender" | "about";

const editableColumns: Record<EditableUserField, string> = {
    name: "name",
    games: "games",
    age: "age",
    gender: "gender",
    about: "about"
};

const saveUserStatement = db.prepare(`
    INSERT INTO users
        (telegram_id, username, name, games, age, gender, about)
    VALUES
        (@telegramId, @username, @name, @games, @age, @gender, @about)
    ON CONFLICT(telegram_id) DO UPDATE SET
        username = excluded.username,
        name = excluded.name,
        games = excluded.games,
        age = excluded.age,
        gender = excluded.gender,
        about = excluded.about
`);

export function saveUser(
    telegramId: number,
    username: string,
    name: string,
    games: string,
    age: string,
    gender: string,
    about: string
): void {
    saveUserStatement.run({ telegramId, username, name, games, age, gender, about });
}

const getUserStatement = db.prepare(`
    SELECT telegram_id, username, name, games, age, gender, about
    FROM users
    WHERE telegram_id = ?
`);

export function getUser(telegramId: number): UserRecord | undefined {
    return getUserStatement.get(telegramId) as UserRecord | undefined;
}

const getAllUsersStatement = db.prepare(`
    SELECT telegram_id, username, name, games, age, gender, about
    FROM users
`);

export function getAllUsers(): UserRecord[] {
    return getAllUsersStatement.all() as UserRecord[];
}

export function updateField(
    telegramId: number,
    field: EditableUserField,
    value: string
): void {
    if (!Object.prototype.hasOwnProperty.call(editableColumns, field)) {
        throw new Error(`Unsupported user field: ${String(field)}`);
    }

    db.prepare(`
        UPDATE users
        SET ${editableColumns[field]} = ?
        WHERE telegram_id = ?
    `).run(value, telegramId);
}
