import { Context, Markup, Telegraf } from "telegraf";
import { BTN, REQUEST_TTL_DAYS } from "../constants";
import { sameAgeGroup } from "../domain/validation";
import { escapeHtml } from "../utils";
import { allowAction, LIMITS } from "../services/rateLimit";
import { isReachable } from "../services/search";
import { sendToUser } from "../services/delivery";
import { getUser, UserRecord } from "../database/users";
import { getUserGames } from "../database/userGames";
import { isBanned } from "../database/bans";
import { hideProfile } from "../database/hiddenProfiles";
import {
    cancelRequest,
    countSentPendingRequests,
    createRequest,
    getPendingRequest,
    getRequests,
    getSentPendingRequests,
    updateRequestStatus
} from "../database/requests";
import { createMatch, getVisibleTeammateIds, hasMatch, hideTeammate } from "../database/matches";
import { contactHtml, formatAgo, formatProfile, formatTimeLeft, matchText } from "../ui/format";
import { mainMenu } from "../ui/keyboards";
import { removeButtons, requireProfile } from "./common";
import { advanceSearch } from "./search";

const DAY = 24 * 60 * 60 * 1000;

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

/** Список надісланих запрошень, що чекають відповіді, з кнопками «Скасувати». */
function sentRequestsView(userId: number, now = Date.now()) {
    const sent = getSentPendingRequests(userId)
        .map((request) => ({ request, target: getUser(request.to_user) }))
        .filter((item): item is { request: typeof item.request; target: UserRecord } => !!item.target);

    if (!sent.length) {
        return { text: "📤 Надісланих запрошень без відповіді немає.", keyboard: undefined };
    }

    const lines = sent.map(({ request, target }, i) => {
        const createdAt = request.created_at ?? now;
        const expiresAt = createdAt + REQUEST_TTL_DAYS * DAY;

        return `${i + 1}. 👤 ${target.name} — надіслано ${formatAgo(now - createdAt)}, згорить ${formatTimeLeft(expiresAt - now)}`;
    });

    const text = `📤 Надіслані запрошення (чекають відповіді)

${lines.join("\n")}

Запрошення без відповіді згорають через ${REQUEST_TTL_DAYS} днів. Скасоване запрошення зникає в гравця з «📨 Запити».`;

    const keyboard = Markup.inlineKeyboard(
        sent.map(({ request, target }) => [Markup.button.callback(`❌ Скасувати: ${target.name}`, `cancel_req_${request.id}`)])
    );

    return { text, keyboard };
}

export function registerRequestHandlers(bot: Telegraf) {

    bot.hears(/^📨 Запити/, async (ctx) => {
        if (!requireProfile(ctx)) return;

        const sentCount = countSentPendingRequests(ctx.from.id);

        if (sentCount) {
            await ctx.reply(
                `📤 Ваші запрошення без відповіді: ${sentCount}`,
                Markup.inlineKeyboard([[Markup.button.callback(`📤 Надіслані запрошення (${sentCount})`, "sent_requests")]])
            );
        }

        const shown = await showNextPendingRequest(ctx);

        if (!shown) {
            return ctx.reply(sentCount ? "📭 Нових вхідних запитів немає." : "📭 Нових запитів немає.", mainMenu(ctx.from.id));
        }
    });

    bot.action("sent_requests", async (ctx) => {
        await ctx.answerCbQuery();

        const view = sentRequestsView(ctx.from.id);

        return ctx.reply(view.text, view.keyboard ?? {});
    });

    bot.action(/^cancel_req_(\d+)$/, async (ctx) => {
        // Скасувати можна лише СВОЄ запрошення, що ще чекає відповіді.
        const cancelled = cancelRequest(Number(ctx.match[1]), ctx.from.id);

        if (!cancelled) {
            await ctx.answerCbQuery("Цей запит уже оброблено");
            return;
        }

        // Щоб одразу не натрапити на цього гравця в пошуку знову.
        hideProfile(ctx.from.id, cancelled.to_user);

        await ctx.answerCbQuery("❌ Запрошення скасовано");

        const view = sentRequestsView(ctx.from.id);

        try {
            await ctx.editMessageText(view.text, view.keyboard ?? {});
        } catch {
            await ctx.reply(view.text, view.keyboard ?? {});
        }
    });

    bot.hears(BTN.teammates, async (ctx) => {
        if (!requireProfile(ctx)) return;

        const teammates = getVisibleTeammateIds(ctx.from.id)
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

        // Кнопки «Прибрати» — під списком (головне меню лишається з попереднього повідомлення).
        return ctx.reply(`🤝 Ваші тімейти:\n\n${list}`, {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard(
                teammates.map((u) => [Markup.button.callback(`❌ Прибрати: ${u.name}`, `tm_rm_${u.telegram_id}`)])
            )
        });
    });

    bot.action(/^tm_rm_(\d+)$/, async (ctx) => {
        const teammateId = Number(ctx.match[1]);
        const teammate = getUser(teammateId);

        if (!teammate || !getVisibleTeammateIds(ctx.from.id).includes(teammateId)) {
            await ctx.answerCbQuery("Цього гравця вже немає у вашому списку");
            return;
        }

        await ctx.answerCbQuery();

        return ctx.reply(
            `Прибрати «${teammate.name}» зі свого списку тімейтів?

• гравець нічого не отримає, у його списку ви залишитесь
• у пошуку ви одне одного не побачите`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback("✅ Так, прибрати", `tm_rm_yes_${teammateId}`),
                    Markup.button.callback("❌ Ні", "tm_rm_no")
                ]
            ])
        );
    });

    bot.action(/^tm_rm_yes_(\d+)$/, async (ctx) => {
        const teammateId = Number(ctx.match[1]);

        await removeButtons(ctx);

        if (!hasMatch(ctx.from.id, teammateId) || !getVisibleTeammateIds(ctx.from.id).includes(teammateId)) {
            await ctx.answerCbQuery("Цього гравця вже немає у вашому списку");
            return;
        }

        hideTeammate(ctx.from.id, teammateId);

        await ctx.answerCbQuery("Прибрано");

        return ctx.reply(`✅ «${getUser(teammateId)?.name ?? "Гравця"}» прибрано зі списку тімейтів.`, mainMenu(ctx.from.id));
    });

    bot.action("tm_rm_no", async (ctx) => {
        await removeButtons(ctx);
        await ctx.answerCbQuery("Скасовано");
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

        // Анкета на паузі, давно неактивна або гравець заблокував бота — запрошення ніхто не побачить.
        if (!isReachable(targetProfile)) {
            await ctx.answerCbQuery("❌ Гравець зараз не шукає тімейтів");
            await removeButtons(ctx);
            await advanceSearch(ctx, targetId);
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

        await ctx.reply(
            `✅ Запит відправлено! Коли гравець погодиться, ви отримаєте його контакт.\n\nЯкщо він не відповість за ${REQUEST_TTL_DAYS} днів, запрошення згорить. Свої запрошення видно в «${BTN.requests}».`
        );

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
