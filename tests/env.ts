// Тестове оточення. Імпортується ПЕРШИМ у кожному тесті — до коду бота.
// Значення задаються примусово: тести можуть запускатися під час збірки на сервері,
// і там вони НЕ повинні торкатися справжньої бази чи справжнього бота.
import fs from "fs";
import os from "os";
import path from "path";

process.env.BOT_TOKEN = "123456:test-token";
process.env.ADMIN_ID = "9999";
process.env.CHANNEL_ID = "-100777";
process.env.DB_PATH = ":memory:";
process.env.BACKUP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tfua-test-backups-"));
