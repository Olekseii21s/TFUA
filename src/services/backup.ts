import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import type { Telegram } from "telegraf";
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

/** Робить бекап і надсилає файл адміністратору в Telegram (копія поза сервером). */
export async function sendBackup(telegram: Telegram, chatId: number, reason: string): Promise<void> {
    const { file, size } = await createBackup();

    await telegram.sendDocument(
        chatId,
        { source: file, filename: path.basename(file) },
        {
            caption: `💾 Бекап бази (${reason})

👥 Анкет: ${getAllUsers().length}
📦 Розмір: ${Math.max(1, Math.round(size / 1024))} КБ

🔒 У файлі персональні дані користувачів — не пересилайте його нікому.`
        }
    );
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
export function scheduleDailyBackup(telegram: Telegram, chatId: number): void {
    const run = async () => {
        try {
            await sendBackup(telegram, chatId, "щоденний");
            console.log("💾 Щоденний бекап надіслано адміністратору");
        } catch (err) {
            console.error("❌ Не вдалося зробити щоденний бекап:", err);
        }

        setTimeout(run, msUntilNextBackup()).unref();
    };

    setTimeout(run, msUntilNextBackup()).unref();
}
