import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { BOT_TOKEN } from "../config";
import { logError } from "../logging";
import db, { DB_FILE } from "../database/db";
import { getAllUsers } from "../database/users";

/** О котрій годині (UTC) робити щоденний бекап. 1:00 UTC = 3:00/4:00 за Києвом. */
const BACKUP_HOUR_UTC = 1;

/** Скільки останніх бекапів тримати на диску сервера. */
const KEEP_LOCAL_BACKUPS = 7;

/**
 * Куди складати бекапи на сервері. За замовчуванням — папка backups поруч із базою
 * (на Northflank це /data/backups, тобто на тому ж постійному диску).
 */
function backupDir(): string {
    const fromEnv = process.env.BACKUP_DIR?.trim();

    if (fromEnv) return path.resolve(fromEnv);

    return DB_FILE === ":memory:"
        ? path.join(os.tmpdir(), "tfua-backups")
        : path.join(path.dirname(DB_FILE), "backups");
}

function rotateBackups(dir: string) {
    const files = fs.readdirSync(dir)
        .filter((name) => /^tfua-.*\.db\.gz$/.test(name))
        .map((name) => ({ name, time: fs.statSync(path.join(dir, name)).mtimeMs }))
        .sort((a, b) => b.time - a.time || b.name.localeCompare(a.name));

    for (const old of files.slice(KEEP_LOCAL_BACKUPS)) {
        fs.unlinkSync(path.join(dir, old.name));
    }
}

/**
 * Робить узгоджену копію бази (навіть поки бот працює) і стискає її.
 * Повертає шлях до файлу .db.gz.
 */
export async function createBackup(): Promise<{ file: string; size: number }> {
    const dir = backupDir();

    fs.mkdirSync(dir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    let base = path.join(dir, `tfua-${stamp}`);

    for (let i = 1; fs.existsSync(`${base}.db.gz`); i++) {
        base = path.join(dir, `tfua-${stamp}-${i}`);
    }

    const rawFile = `${base}.db`;
    const gzFile = `${base}.db.gz`;

    await db.backup(rawFile);

    fs.writeFileSync(gzFile, zlib.gzipSync(fs.readFileSync(rawFile)));
    fs.unlinkSync(rawFile);

    rotateBackups(dir);

    return { file: gzFile, size: fs.statSync(gzFile).size };
}

export type DocumentUploader = (
    chatId: number,
    file: Buffer,
    filename: string,
    caption: string
) => Promise<void>;

/** Налаштування повторних спроб відправки (у тестах затримку зменшують). */
export const UPLOAD_RETRY = { attempts: 3, delayMs: 2000 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Відправка файлу через вбудований у Node fetch.
 * Вбудоване в Telegraf завантаження файлів (старий node-fetch) на нових версіях Node
 * обривається з «socket hang up», тому файли надсилаємо напряму, з повторними спробами.
 */
const telegramUploader: DocumentUploader = async (chatId, file, filename, caption) => {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`;
    let lastError: unknown;

    for (let attempt = 1; attempt <= UPLOAD_RETRY.attempts; attempt++) {
        let waitMs = UPLOAD_RETRY.delayMs * attempt;

        try {
            const form = new FormData();
            form.append("chat_id", String(chatId));
            form.append("caption", caption);
            form.append("document", new Blob([new Uint8Array(file)]), filename);

            const response = await fetch(url, {
                method: "POST",
                body: form,
                signal: AbortSignal.timeout(60_000)
            });

            const data = await response.json().catch(() => ({})) as {
                ok?: boolean;
                description?: string;
                parameters?: { retry_after?: number };
            };

            if (response.ok && data.ok) return;

            lastError = new Error(`Telegram API ${response.status}: ${data.description ?? "невідома помилка"}`);

            // Помилки запиту (не той чат, завеликий файл тощо) повтор не виправить.
            if (response.status < 500 && response.status !== 429) throw lastError;

            if (data.parameters?.retry_after) waitMs = data.parameters.retry_after * 1000;
        } catch (err) {
            if (err === lastError) throw err;

            // Мережева помилка (обрив з'єднання, тайм-аут) — пробуємо ще раз.
            lastError = err;
        }

        if (attempt < UPLOAD_RETRY.attempts) await sleep(waitMs);
    }

    throw lastError;
};

let uploader: DocumentUploader = telegramUploader;

/** Підміна способу відправки (для тестів). Без аргументу — повертає справжній. */
export function setDocumentUploader(custom?: DocumentUploader): void {
    uploader = custom ?? telegramUploader;
}

/** Робить бекап і надсилає файл адміністратору в Telegram (копія поза сервером). */
export async function sendBackup(chatId: number, reason: string): Promise<void> {
    const { file, size } = await createBackup();

    const caption = `💾 Бекап бази (${reason})

👥 Анкет: ${getAllUsers().length}
📦 Розмір: ${Math.max(1, Math.round(size / 1024))} КБ

🔒 У файлі персональні дані користувачів — не пересилайте його нікому.`;

    await uploader(chatId, fs.readFileSync(file), path.basename(file), caption);
}

function msUntilNextBackup(now = new Date()): number {
    const next = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        BACKUP_HOUR_UTC
    ));

    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);

    return next.getTime() - now.getTime();
}

/** Запускає щоденний бекап з відправкою адміністратору. */
export function scheduleDailyBackup(chatId: number): void {
    const run = async () => {
        try {
            await sendBackup(chatId, "щоденний");
            console.log("💾 Щоденний бекап надіслано адміністратору");
        } catch (err) {
            logError("❌ Не вдалося зробити щоденний бекап:", err);
        }

        setTimeout(run, msUntilNextBackup()).unref();
    };

    setTimeout(run, msUntilNextBackup()).unref();
}
