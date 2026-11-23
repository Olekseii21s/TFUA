import { Context, Telegraf } from "telegraf";
import { CHANNEL_ID } from "../config";
import { BTN, REPORT_MAX_LENGTH } from "../constants";
import { validateText } from "../domain/validation";
import { FlowState, flowStore, newState } from "../state";
import { allowAction, LIMITS } from "../services/rateLimit";
import { getUser } from "../database/users";
import { hideProfile } from "../database/hiddenProfiles";
import { addReport, hasReported } from "../database/reports";
import { LIMIT_TEXT } from "../constants";
import { formatProfile } from "../ui/format";
import { mainMenu, stepKeyboard } from "../ui/keyboards";
import { advanceSearch } from "./search";
import { logError } from "../logging";

export async function handleReport(ctx: Context, state: FlowState, text: string) {
    const telegramId = ctx.from!.id;
    const reportedId = state.targetId!;

    const error = validateText(text, REPORT_MAX_LENGTH, "Причина скарги");

    if (error) return ctx.reply(error);

    // Стан скарги очищаємо одразу, щоб наступні повідомлення не йшли як нові скарги.
    flowStore.delete(telegramId);

    if (!allowAction(`complaint:${telegramId}`, LIMITS.complaint)) {
        return ctx.reply(LIMIT_TEXT, mainMenu(telegramId));
    }

    const reportedUser = getUser(reportedId);

    if (!reportedUser) {
        return ctx.reply("❌ Цю анкету вже видалено.", mainMenu(telegramId));
    }

    try {
        await ctx.telegram.sendMessage(
            CHANNEL_ID,
            `🚨 Нова скарга

👤 Скаржник:
${ctx.from!.first_name}
🆔 ${telegramId}

━━━━━━━━━━

🎮 Анкета:
🆔 ${reportedUser.telegram_id}

${formatProfile(reportedUser)}

━━━━━━━━━━

📝 Причина:

${text}`
        );
    } catch (err) {
        logError("Не вдалося надіслати скаргу в канал:", err);

        return ctx.reply("⚠️ Не вдалося надіслати скаргу. Спробуйте пізніше.", mainMenu(telegramId));
    }

    addReport(telegramId, reportedId, text);

    // Анкету, на яку поскаржились, більше не показуємо в пошуку.
    hideProfile(telegramId, reportedId);

    await ctx.reply("✅ Скаргу надіслано. Дякуємо, адміністратор її перегляне.", mainMenu(telegramId));

    await advanceSearch(ctx, reportedId);
}

export async function handleBugReport(ctx: Context, text: string) {
    const telegramId = ctx.from!.id;

    const error = validateText(text, REPORT_MAX_LENGTH, "Повідомлення");

    if (error) return ctx.reply(error);

    flowStore.delete(telegramId);

    if (!allowAction(`bug:${telegramId}`, LIMITS.bugReport)) {
        return ctx.reply(LIMIT_TEXT, mainMenu(telegramId));
    }

    try {
        await ctx.telegram.sendMessage(
            CHANNEL_ID,
            `🐞 Нова проблема

👤 ${ctx.from!.first_name}
🆔 ${telegramId}
📱 ${ctx.from!.username ? "@" + ctx.from!.username : "Без username"}

━━━━━━━━━━

${text}`
        );
    } catch (err) {
        logError("Не вдалося надіслати повідомлення про проблему в канал:", err);

        return ctx.reply("⚠️ Не вдалося надіслати повідомлення. Спробуйте пізніше.", mainMenu(telegramId));
    }

    return ctx.reply("✅ Дякуємо! Ваше повідомлення відправлено адміністратору.", mainMenu(telegramId));
}

export function registerReportHandlers(bot: Telegraf) {

    bot.hears(BTN.bug, async (ctx) => {
        if (!allowAction(`bug:${ctx.from.id}`, LIMITS.bugReport, false)) {
            return ctx.reply("⏳ Ви вже надіслали кілька повідомлень. Спробуйте через годину.", mainMenu(ctx.from.id));
        }

        flowStore.set(ctx.from.id, newState("bug"));

        return ctx.reply(
            "🐞 Опишіть проблему або запропонуйте покращення одним повідомленням 👇",
            stepKeyboard()
        );
    });

    bot.action(/^report_user_(\d+)$/, async (ctx) => {
        const targetId = Number(ctx.match[1]);

        if (hasReported(ctx.from.id, targetId)) {
            await ctx.answerCbQuery("⚠️ Ви вже скаржилися на цю анкету");
            return;
        }

        if (!allowAction(`complaint:${ctx.from.id}`, LIMITS.complaint, false)) {
            await ctx.answerCbQuery("⏳ Забагато скарг за годину. Спробуйте пізніше.", { show_alert: true });
            return;
        }

        flowStore.set(ctx.from.id, newState("report", { targetId }));

        await ctx.answerCbQuery();

        return ctx.reply("⚠️ Напишіть причину скарги одним повідомленням:", stepKeyboard());
    });
}
