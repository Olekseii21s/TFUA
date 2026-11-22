import { Telegraf } from "telegraf";
import { BTN } from "../constants";
import { flowStore } from "../state";
import { getUser } from "../database/users";
import { mainMenu } from "../ui/keyboards";
import { showOwnProfile } from "./profile";

const WELCOME_TEXT = `🎮 Вітаємо в Team Finder!

Тут ти можеш знайти тімейтів для улюблених ігор, переглядати анкети інших гравців та надсилати запити на спільну гру.

📋 Як це працює:
1️⃣ Створи анкету — ігри, ранги, вік і пару слів про себе
2️⃣ Натисни «${BTN.search}» і гортай анкети
3️⃣ Запроси гравця в гру — коли він погодиться, ви отримаєте контакти одне одного

⚠️ Бот у Beta-версії. Якщо помітиш проблему або маєш ідею — натисни «${BTN.bug}».

Гарної гри! 🎯`;

export function registerStartHandlers(bot: Telegraf) {

    bot.start(async (ctx) => {
        flowStore.delete(ctx.from.id);

        const profile = getUser(ctx.from.id);

        if (!profile) {
            return ctx.reply(WELCOME_TEXT, mainMenu(ctx.from.id));
        }

        return ctx.reply(
            `👋 З поверненням, ${profile.name}!\n\nОберіть дію в меню 👇`,
            mainMenu(ctx.from.id)
        );
    });

    bot.hears(BTN.back, async (ctx) => {
        const state = flowStore.get(ctx.from.id);

        flowStore.delete(ctx.from.id);

        // З редагування анкети повертаємось до анкети, а не в головне меню.
        if (state && (state.flow === "editField" || state.flow === "editGames") && getUser(ctx.from.id)) {
            return showOwnProfile(ctx);
        }

        return ctx.reply("🏠 Головне меню", mainMenu(ctx.from.id));
    });
}
