import { Context, Markup, Telegraf, Telegram } from "telegraf";
import { ADMIN_ID, CHANNEL_ID } from "../config";
import { FlowState, flowStore, newState, searchStore } from "../state";
import { banUser, isBanned, unbanUser } from "../database/bans";
import { getAllUsers, getUserStats } from "../database/users";
import { countMatches } from "../database/matches";
import { countPendingRequests } from "../database/requests";
import { getSourceStats } from "../database/sources";
import { mainMenu, stepKeyboard } from "../ui/keyboards";
import { sendBackup } from "../services/backup";
import { sendToUser } from "../services/delivery";
import { runInBackground } from "../services/background";
import { logError } from "../logging";
import { removeButtons } from "./common";

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
⏸ Приховали анкету: ${users.paused}

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

/** Максимальна довжина тексту розсилки (ліміт Telegram — 4096 символів разом із заголовком). */
const BROADCAST_MAX_LENGTH = 4000;

/** Пауза між повідомленнями розсилки (ліміт Telegram ~30 повідомлень/сек). */
export const BROADCAST_DELAY = { ms: 50 };

const broadcastMessage = (text: string) => `📢 Оголошення\n\n${text}`;

/** Кому піде розсилка: усі анкети, крім забанених і тих, хто заблокував бота. */
function broadcastRecipients(): number[] {
    return getAllUsers()
        .filter((u) => u.blocked_bot !== 1 && !isBanned(u.telegram_id))
        .map((u) => u.telegram_id);
}

let broadcastInProgress = false;

/** Крок 1: адмін надіслав текст — показуємо, як виглядатиме розсилка, і просимо підтвердити. */
export async function handleBroadcast(ctx: Context, state: FlowState, text: string) {
    const telegramId = ctx.from!.id;

    if (telegramId !== ADMIN_ID) {
        flowStore.delete(telegramId);
        return;
    }

    if (!text.trim()) return ctx.reply("❌ Текст розсилки порожній. Введіть текст:");

    if (text.length > BROADCAST_MAX_LENGTH) {
        return ctx.reply(`❌ Задовгий текст: ${text.length} символів, максимум ${BROADCAST_MAX_LENGTH}. Скоротіть і надішліть ще раз:`);
    }

    state.draft = text;

    await ctx.reply("👀 Так виглядатиме розсилка:");
    await ctx.reply(broadcastMessage(text));

    return ctx.reply(
        `Надіслати її ${broadcastRecipients().length} користувачам?`,
        Markup.inlineKeyboard([
            [
                Markup.button.callback("✅ Надіслати", "broadcast_send"),
                Markup.button.callback("❌ Скасувати", "broadcast_cancel")
            ]
        ])
    );
}

/** Крок 2: відправка у фоні, щоб бот не «замовкав» для всіх на час розсилки. */
function startBroadcast(telegram: Telegram, adminId: number, text: string): Promise<void> {
    broadcastInProgress = true;

    return runInBackground("розсилка", async () => {
        try {
            const recipients = broadcastRecipients();
            let delivered = 0;

            for (const userId of recipients) {
                // Заблокували бота — sendToUser позначить це, і такі гравці зникнуть із пошуку.
                if (await sendToUser(telegram, userId, broadcastMessage(text))) delivered++;

                if (BROADCAST_DELAY.ms) await new Promise((resolve) => setTimeout(resolve, BROADCAST_DELAY.ms));
            }

            await sendToUser(telegram, adminId, `✅ Розсилку завершено: доставлено ${delivered} з ${recipients.length}.`);
        } finally {
            broadcastInProgress = false;
        }
    });
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

        if (broadcastInProgress) {
            await ctx.answerCbQuery("⏳ Попередня розсилка ще триває", { show_alert: true });
            return;
        }

        flowStore.set(ctx.from.id, newState("broadcast"));

        await ctx.answerCbQuery();

        return ctx.reply(
            "📢 Введіть текст розсилки. Перед відправкою я покажу, як вона виглядатиме, і попрошу підтвердити.",
            stepKeyboard()
        );
    });

    bot.action("broadcast_send", async (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return;

        const state = flowStore.get(ctx.from.id);

        // Чернетку прибираємо до старту — повторне натискання нічого не надішле вдруге.
        flowStore.delete(ctx.from.id);
        await removeButtons(ctx);

        if (state?.flow !== "broadcast" || !state.draft) {
            await ctx.answerCbQuery("Немає чернетки розсилки");
            return;
        }

        if (broadcastInProgress) {
            await ctx.answerCbQuery("⏳ Попередня розсилка ще триває", { show_alert: true });
            return;
        }

        const total = broadcastRecipients().length;

        await ctx.answerCbQuery("📤 Розсилку запущено");
        await ctx.reply(`📤 Розсилку запущено для ${total} користувачів. Напишу, коли завершиться.`, mainMenu(ctx.from.id));

        void startBroadcast(ctx.telegram, ctx.from.id, state.draft);
    });

    bot.action("broadcast_cancel", async (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return;

        flowStore.delete(ctx.from.id);
        await removeButtons(ctx);
        await ctx.answerCbQuery();

        return ctx.reply("❌ Розсилку скасовано.", mainMenu(ctx.from.id));
    });
}
