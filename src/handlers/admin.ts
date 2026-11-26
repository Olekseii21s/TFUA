import { Context, Markup, Telegraf } from "telegraf";
import { ADMIN_ID, CHANNEL_ID } from "../config";
import { flowStore, newState, searchStore } from "../state";
import { banUser, unbanUser } from "../database/bans";
import { getAllUsers, getUserStats } from "../database/users";
import { countMatches } from "../database/matches";
import { countPendingRequests } from "../database/requests";
import { getSourceStats } from "../database/sources";
import { mainMenu, stepKeyboard } from "../ui/keyboards";
import { sendBackup } from "../services/backup";
import { sendToUser } from "../services/delivery";
import { logError } from "../logging";

async function backupNow(ctx: Context) {
    try {
        await sendBackup(ADMIN_ID, "ручний");
    } catch (err) {
        logError("❌ Не вдалося зробити бекап:", err);
        await ctx.reply("⚠️ Не вдалося зробити бекап. Деталі — у логах сервера.");
    }
}

/** Текст статистики для адміна: анкети, активність, матчі, джерела трафіку за 30 днів. */
export function buildStatsText(now = Date.now()): string {
    const users = getUserStats(now);
    const week = now - 7 * 24 * 60 * 60 * 1000;
    const month = now - 30 * 24 * 60 * 60 * 1000;

    const sources = getSourceStats(month);
    const sourcesText = sources.length
        ? sources.map((s) => `• ${s.source}: ${s.visitors} → анкет ${s.profiles}`).join("\n")
        : "• поки немає даних";

    return `📊 Статистика

👥 Анкет: ${users.total}
🆕 Нових: ${users.newLastDay} за добу · ${users.newLastWeek} за тиждень
🟢 Активних: ${users.activeLastDay} за добу · ${users.activeLastWeek} за тиждень
🚫 Заблокували бота: ${users.blockedBot}

🤝 Матчів: ${countMatches()} (за тиждень: ${countMatches(week)})
📨 Запитів без відповіді: ${countPendingRequests()}

📣 Звідки прийшли (30 днів, перший /start):
${sourcesText}

Посилання з міткою: t.me/<бот>?start=tiktok`;
}

function parseUserIdArg(text: string): number | null {
    const id = Number(text.split(/\s+/)[1]);

    return Number.isInteger(id) && id > 0 ? id : null;
}

export async function handleBroadcast(ctx: Context, text: string) {
    const telegramId = ctx.from!.id;

    flowStore.delete(telegramId);

    if (telegramId !== ADMIN_ID) return;

    const users = getAllUsers();
    let delivered = 0;

    for (const user of users) {
        // Заблокували бота — sendToUser позначить це, і такі гравці зникнуть із пошуку.
        if (await sendToUser(ctx.telegram, user.telegram_id, `📢 Оголошення\n\n${text}`)) delivered++;

        // Telegram обмежує ~30 повідомлень/сек — не перевищуємо ліміт.
        await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return ctx.reply(`✅ Розсилку доставлено ${delivered} з ${users.length} користувачів`, mainMenu(telegramId));
}

export function registerAdminHandlers(bot: Telegraf) {

    bot.command("ban", async (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return;

        const userId = parseUserIdArg(ctx.message.text);

        if (!userId) return ctx.reply("Приклад:\n/ban 123456789");

        banUser(userId);
        searchStore.delete(userId);
        flowStore.delete(userId);

        return ctx.reply(`✅ Користувач ${userId} заблокований`);
    });

    bot.command("unban", async (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return;

        const userId = parseUserIdArg(ctx.message.text);

        if (!userId) return ctx.reply("Приклад:\n/unban 123456789");

        unbanUser(userId);

        return ctx.reply(`✅ Користувач ${userId} розблокований`);
    });

    bot.command("admin", async (ctx) => {
        if (ctx.from.id !== ADMIN_ID) {
            return ctx.reply("⛔ У вас немає доступу.");
        }

        return ctx.reply(
            "🛠 Адмін-панель",
            Markup.inlineKeyboard([
                [Markup.button.callback("📊 Статистика", "admin_stats")],
                [Markup.button.callback("🐞 Скарги", "admin_reports")],
                [Markup.button.callback("📢 Розсилка", "admin_broadcast")],
                [Markup.button.callback("👥 Користувачі", "admin_users")],
                [Markup.button.callback("💾 Бекап бази", "admin_backup")]
            ])
        );
    });

    bot.command("backup", async (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return;

        await backupNow(ctx);
    });

    bot.action("admin_backup", async (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return;

        await ctx.answerCbQuery("💾 Готую бекап...");
        await backupNow(ctx);
    });

    bot.action("admin_stats", async (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return;

        await ctx.answerCbQuery();

        return ctx.reply(buildStatsText());
    });

    bot.command("stats", async (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return;

        return ctx.reply(buildStatsText());
    });

    bot.action("admin_users", async (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return;

        const text = getAllUsers()
            .slice(-10)
            .reverse()
            .map((u) => `👤 ${u.name}\n🆔 ${u.telegram_id}`)
            .join("\n\n");

        await ctx.answerCbQuery();

        return ctx.reply(`👥 Останні користувачі\n\n${text || "—"}`);
    });

    bot.action("admin_reports", async (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return;

        await ctx.answerCbQuery();

        return ctx.reply(`🐞 Скарги переглядайте у каналі\n\n${CHANNEL_ID}`);
    });

    bot.action("admin_broadcast", async (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return;

        flowStore.set(ctx.from.id, newState("broadcast"));

        await ctx.answerCbQuery();

        return ctx.reply("📢 Введіть текст розсилки:", stepKeyboard());
    });
}
