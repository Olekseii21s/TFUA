// Має бути першим імпортом: .env потрібен ще до підключення бази (DB_PATH).
import "dotenv/config";

import { ADMIN_ID, BOT_TOKEN } from "./config";
import { SESSION_TTL_DAYS } from "./constants";
import { createBot } from "./bot";
import { purgeOldSessions } from "./database/sessions";
import { scheduleDailyBackup } from "./services/backup";

const purged = purgeOldSessions(SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

if (purged) {
    console.log(`🧹 Видалено старих незавершених діалогів: ${purged}`);
}

const bot = createBot(BOT_TOKEN);

bot.launch(() => {
    console.log("🚀 Bot started");

    // Щодня о 1:00 UTC бот надсилає адміністратору стиснуту копію бази.
    scheduleDailyBackup(bot.telegram, ADMIN_ID);
}).catch((err) => {
    console.error("❌ Не вдалося запустити бота:", err);
    process.exit(1);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
