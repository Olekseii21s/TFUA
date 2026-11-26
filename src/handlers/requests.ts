import { Context, Markup, Telegraf } from "telegraf";
import { BTN } from "../constants";
import { sameAgeGroup } from "../domain/validation";
import { escapeHtml } from "../utils";
import { allowAction, LIMITS } from "../services/rateLimit";
import { getUser, UserRecord } from "../database/users";
import { getUserGames } from "../database/userGames";
import { isBanned } from "../database/bans";
import { createRequest, getPendingRequest, getRequests, updateRequestStatus } from "../database/requests";
import { createMatch, getMatchedUserIds, hasMatch } from "../database/matches";
import { contactHtml, formatProfile, matchText } from "../ui/format";
import { mainMenu } from "../ui/keyboards";
import { removeButtons, requireProfile } from "./common";
import { advanceSearch } from "./search";
import { sendToUser } from "../services/delivery";

/**
 * Надсилає картку вхідного запиту з кнопками «Прийняти / Відмовити».
 * Username відправника НЕ показується, доки запит не прийнято.
 * Повертає текст помилки, якщо запит показати не можна.
 */
async function sendIncomingRequest(ctx: Context, senderId: number): Promise<string | null> {
    const request = getPendingRequest(senderId, ctx.from!.id);

    if (!request) return "Цей запит уже оброблено";

    const senderProfile = getUser(senderId);
    const currentProfile = getUser(ctx.from!.id);

    if (!senderProfile || !currentProfile || isBanned(senderId) || !sameAgeGroup(senderProfile, currentProfile)) {
        updateRequestStatus(request.id, "rejected");
        return "❌ Анкета більше недоступна";
    }

    await ctx.reply(
        formatProfile(senderProfile, "🎮 Вас запрошують у гру!"),
        Markup.inlineKeyboard([
            [
                Markup.button.callback("✅ Хочу грати", `accept_${senderId}`),
                Markup.button.callback("❌ Відмовити", `reject_${senderId}`)
            ],
            [Markup.button.callback("⚠️ Поскаржитись", `report_user_${senderId}`)]
        ])
    );

    return null;
}

/** Показує перший доступний вхідний запит. Повертає false, якщо запитів немає. */
async function showNextPendingRequest(ctx: Context): Promise<boolean> {
    for (const request of getRequests(ctx.from!.id)) {
        const error = await sendIncomingRequest(ctx, request.from_user);

        if (!error) return true;
    }

    return false;
}

export function registerRequestHandlers(bot: Telegraf) {

    bot.hears(/^📨 Запити/, async (ctx) => {
        if (!requireProfile(ctx)) return;

        const shown = await showNextPendingRequest(ctx);

        if (!shown) {
            return ctx.reply("📭 Нових запитів немає.", mainMenu(ctx.from.id));
        }
    });

    bot.hears(BTN.teammates, async (ctx) => {
        if (!requireProfile(ctx)) return;

        const teammates = getMatchedUserIds(ctx.from.id)
            .map((id) => getUser(id))
            .filter((u): u is UserRecord => !!u)
            .slice(0, 30);

        if (!teammates.length) {
            return ctx.reply(
                `🤝 Тут з'являться гравці, які прийняли ваш запит (або ви — їхній).\n\nПоки що порожньо — натисніть «${BTN.search}»!`,
                mainMenu(ctx.from.id)
            );
        }

        const list = teammates
            .map((u) => {
                const games = getUserGames(u.telegram_id).map((g) => g.game).join(", ") || "—";

                return `👤 <b>${escapeHtml(u.name)}</b> — ${contactHtml(u)}\n🎮 ${escapeHtml(games)}`;
            })
            .join("\n\n");

        return ctx.reply(`🤝 Ваші тімейти:\n\n${list}`, { parse_mode: "HTML", ...mainMenu(ctx.from.id) });
    });

    bot.action(/^like_(\d+)$/, async (ctx) => {
        const targetId = Number(ctx.match[1]);
        const currentUserId = ctx.from.id;

        if (targetId === currentUserId) {
            await ctx.answerCbQuery("❌ Не можна запросити самого себе");
            return;
        }

        const currentProfile = getUser(currentUserId);

        if (!currentProfile) {
            await ctx.answerCbQuery("❌ Спочатку створіть анкету");
            return;
        }

        const targetProfile = getUser(targetId);

        // sameAgeGroup: дорослий не може запросити неповнолітнього і навпаки — навіть в обхід пошуку.
        if (!targetProfile || isBanned(targetId) || !sameAgeGroup(currentProfile, targetProfile)) {
            await ctx.answerCbQuery("❌ Ця анкета недоступна");
            await removeButtons(ctx);
            await advanceSearch(ctx, targetId);
            return;
        }

        if (hasMatch(currentUserId, targetId)) {
            await ctx.answerCbQuery("🎉 У вас уже є матч із цим гравцем");
            return;
        }

        // Ця людина вже запросила нас — пропонуємо одразу прийняти її запит.
        if (getPendingRequest(targetId, currentUserId)) {
            await ctx.answerCbQuery("Цей гравець уже запросив вас!");
            await removeButtons(ctx);
            await sendIncomingRequest(ctx, targetId);
            return;
        }

        if (getPendingRequest(currentUserId, targetId)) {
            await ctx.answerCbQuery("⚠️ Ви вже відправили запит цьому гравцю");
            return;
        }

        if (!allowAction(`invite:${currentUserId}`, LIMITS.invite)) {
            await ctx.answerCbQuery("⏳ Забагато запрошень за годину. Спробуйте пізніше.", { show_alert: true });
            return;
        }

        createRequest(currentUserId, targetId);

        // Якщо отримувач заблокував бота — запит лишається в «📨 Запити», а гравець зникає з пошуку.
        await sendToUser(
            ctx.telegram,
            targetId,
            "🔔 Вас запросили в гру!",
            Markup.inlineKeyboard([
                [Markup.button.callback("👀 Переглянути", `request_from_${currentUserId}`)]
            ])
        );

        await ctx.answerCbQuery("✅ Запит відправлено!");
        await removeButtons(ctx);

        await ctx.reply("✅ Запит відправлено! Коли гравець погодиться, ви отримаєте його контакт.");

        await advanceSearch(ctx, targetId);
    });

    bot.action(/^request_from_(\d+)$/, async (ctx) => {
        const error = await sendIncomingRequest(ctx, Number(ctx.match[1]));

        await ctx.answerCbQuery(error || undefined);

        if (!error) await removeButtons(ctx);
    });

    // Залишено для кнопок у старих повідомленнях.
    bot.action(/^request_(\d+)$/, async (ctx) => {
        const requestId = Number(ctx.match[1]);
        const request = getRequests(ctx.from.id).find((r) => r.id === requestId);

        if (!request) {
            await ctx.answerCbQuery("Цей запит уже оброблено");
            return;
        }

        const error = await sendIncomingRequest(ctx, request.from_user);

        await ctx.answerCbQuery(error || undefined);
    });

    bot.action(/^accept_(\d+)$/, async (ctx) => {
        const senderId = Number(ctx.match[1]);
        const currentUserId = ctx.from.id;

        // Прийняти можна лише реальний запит, що ще очікує відповіді.
        const pendingRequest = getPendingRequest(senderId, currentUserId);

        await removeButtons(ctx);

        if (!pendingRequest) {
            await ctx.answerCbQuery("Цей запит уже оброблено");
            return;
        }

        const senderProfile = getUser(senderId);
        const currentProfile = getUser(currentUserId);

        if (!senderProfile || !currentProfile || isBanned(senderId) || !sameAgeGroup(senderProfile, currentProfile)) {
            updateRequestStatus(pendingRequest.id, "rejected");
            await ctx.answerCbQuery("❌ Анкета більше недоступна");
            return;
        }

        updateRequestStatus(pendingRequest.id, "accepted");

        if (!hasMatch(senderId, currentUserId)) {
            createMatch(senderId, currentUserId);
        }

        // Якщо відправник заблокував бота — контакт все одно отримає той, хто прийняв.
        await sendToUser(ctx.telegram, senderId, matchText(currentProfile), { parse_mode: "HTML" });

        await ctx.answerCbQuery("🎉 Запит прийнято!");
        await ctx.reply(matchText(senderProfile), { parse_mode: "HTML", ...mainMenu(currentUserId) });

        await showNextPendingRequest(ctx);
    });

    bot.action(/^reject_(\d+)$/, async (ctx) => {
        const senderId = Number(ctx.match[1]);
        const currentUserId = ctx.from.id;

        const pendingRequest = getPendingRequest(senderId, currentUserId);

        if (pendingRequest) {
            updateRequestStatus(pendingRequest.id, "rejected");
        }

        await removeButtons(ctx);
        await ctx.answerCbQuery("Запит відхилено");

        const shown = await showNextPendingRequest(ctx);

        if (!shown) {
            await ctx.reply("❌ Запит відхилено. Більше запитів немає.", mainMenu(currentUserId));
        }
    });
}
