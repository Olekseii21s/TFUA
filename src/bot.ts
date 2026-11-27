import { Markup, Telegraf } from "telegraf";
import { ADMIN_ID } from "./config";
import { BANNED_TEXT, LIMIT_TEXT } from "./constants";
import { flowStore, searchStore } from "./state";
import { allowAction, LIMITS } from "./services/rateLimit";
import { isBanned } from "./database/bans";
import { logError } from "./logging";
import { setBlockedBot, touchUser } from "./database/users";
import { registerStartHandlers } from "./handlers/start";
import { registerProfileHandlers } from "./handlers/profile";
import { registerSearchHandlers } from "./handlers/search";
import { registerRequestHandlers } from "./handlers/requests";
import { registerReportHandlers } from "./handlers/reports";
import { registerAdminHandlers } from "./handlers/admin";
import { registerTextRouter } from "./handlers/text";

/** Створює бота з усіма middleware та обробниками (без запуску). */
export function createBot(token: string): Telegraf {
    const bot = new Telegraf(token);

    // Службове оновлення від Telegram: людина заблокувала або розблокувала бота.
    // Обробляється ПЕРШИМ і далі не йде: це не дія гравця, тож активність не оновлюємо
    // (інакше той, хто щойно заблокував бота, виглядав би «свіжим» у пошуку).
    bot.on("my_chat_member", (ctx) => {
        if (ctx.chat.type !== "private") return;

        const status = ctx.myChatMember.new_chat_member.status;

        if (status === "kicked") setBlockedBot(ctx.from.id, true);
        else if (status === "member") setBlockedBot(ctx.from.id, false);
    });

    // Бан перевіряється для БУДЬ-якої дії: повідомлень, кнопок меню та inline-кнопок.
    bot.use(async (ctx, next) => {
        const userId = ctx.from?.id;

        if (userId && userId !== ADMIN_ID && isBanned(userId)) {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery(BANNED_TEXT);
            } else if (ctx.chat?.type === "private") {
                await ctx.reply(BANNED_TEXT, Markup.removeKeyboard());
            }

            return;
        }

        // Захист від флуду: надто часті дії від одного користувача просто ігноруємо.
        if (userId && userId !== ADMIN_ID && !allowAction(`flood:${userId}`, LIMITS.flood)) {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery(LIMIT_TEXT).catch(() => undefined);
            }

            return;
        }

        return next();
    });

    // Гравець щось зробив: оновлюємо його username (міг змінитися в Telegram) і час активності.
    // Так у матчах завжди актуальний контакт, а неактивні гравці зникають із пошуку.
    bot.use(async (ctx, next) => {
        if (ctx.from && !ctx.from.is_bot) {
            touchUser(ctx.from.id, ctx.from.username);
        }

        return next();
    });

    // Після кожного апдейту зберігаємо стан діалогу та пошуку в базу,
    // щоб після перезапуску бота користувач продовжив з того ж місця.
    bot.use(async (ctx, next) => {
        try {
            await next();
        } finally {
            const userId = ctx.from?.id;

            if (userId) {
                flowStore.persist(userId);
                searchStore.persist(userId);
            }
        }
    });

    // Порядок важливий: кнопки й команди — раніше, текстовий роутер — останнім.
    registerStartHandlers(bot);
    registerProfileHandlers(bot);
    registerSearchHandlers(bot);
    registerRequestHandlers(bot);
    registerReportHandlers(bot);
    registerAdminHandlers(bot);
    registerTextRouter(bot);

    // Будь-яка помилка в обробнику не зупиняє бота.
    bot.catch(async (err, ctx) => {
        logError(`Помилка під час обробки update ${ctx.update.update_id}:`, err);

        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery("⚠️ Сталася помилка, спробуйте ще раз");
            } else if (ctx.chat) {
                await ctx.reply("⚠️ Сталася помилка. Спробуйте ще раз або натисніть /start");
            }
        } catch {
            // Не вдалося навіть повідомити користувача — просто логуємо вище.
        }
    });

    return bot;
}
